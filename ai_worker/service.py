"""Lightweight polling outbox and expiring camera-image server."""

from contextlib import closing
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import signal
import sqlite3
from threading import Event, Thread
import time
from urllib.parse import urlsplit

from ai_worker.notifications.cloudflare import CloudflareNotifier
from ai_worker.notifications.zalo_bot import BotError, ZaloBot, enabled, event_caption
from ai_worker.worker import Settings, Worker


class PhotoLinks:
    ttl = 300

    def __init__(self, origin, secret):
        parts = urlsplit(origin)
        if (parts.scheme != "https" or not parts.hostname or parts.username or parts.password
                or parts.path not in ("", "/") or parts.query or parts.fragment or len(secret) < 32):
            raise ValueError("Configure an HTTPS public origin and a private photo signing key")
        self.origin = origin.rstrip("/")
        self.key = secret.encode()

    def signature(self, event_id, expiry):
        return hmac.new(self.key, f"{event_id}:{expiry}".encode(), hashlib.sha256).hexdigest()

    def url(self, event_id, now):
        expiry = int(now) + self.ttl
        return f"{self.origin}/photo/{event_id}/{expiry}/{self.signature(event_id, expiry)}"

    def event_id(self, path, now):
        match = re.fullmatch(r"/photo/([0-9a-f]{32})/([0-9]{1,12})/([0-9a-f]{64})", path)
        if not match:
            return None
        event_id, expiry, signature = match.groups()
        if now >= int(expiry) or int(expiry) > now + self.ttl:
            return None
        return event_id if hmac.compare_digest(signature, self.signature(event_id, expiry)) else None


def handler_for(path, links, status):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def respond(self, status_code, body=b"", content_type="text/plain"):
            self.send_response(status_code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "private, no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                self.respond(200, json.dumps(status.copy()).encode(), "application/json")
                return
            event_id = links.event_id(self.path, time.time()) if links else None
            if event_id:
                with closing(sqlite3.connect(path)) as db:
                    row = db.execute("SELECT jpeg FROM events WHERE id = ?", (event_id,)).fetchone()
                if row:
                    self.respond(200, row[0], "image/jpeg")
                    return
            self.respond(404)

        do_HEAD = do_GET

    return Handler


def send_event(bot, links, event):
    try:
        bot.send_photo(links.url(event["id"], time.time()),
                       event_caption(event, simulation=event["camera"] == "CamHome demo"))
    except BotError as error:
        return error.outcome, error.retry_after
    return "sent"


def run(producer=None):
    path = os.getenv("CAMHOME_AI_DB", "camhome.sqlite")
    notify_url = os.getenv("CAMHOME_NOTIFY_URL", "")
    relay = CloudflareNotifier(notify_url, os.getenv("NOTIFY_SECRET", "")) if enabled() and notify_url else None
    bot = ZaloBot.from_env() if enabled() and not relay else None
    links = None
    if bot:
        if not bot.chat_id:
            raise ValueError("Configure ZALO_CHAT_ID")
    origin = os.getenv("CAMHOME_PUBLIC_ORIGIN", "")
    if bot or (relay and origin):
        links = PhotoLinks(origin, os.getenv("CAMHOME_PHOTO_KEY", ""))
    stop = Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    status = {"zalo": "relay_configured" if relay else "unchecked" if bot else "disabled",
              "ai": "inactive", "video": "not_connected"}
    db = sqlite3.connect(path)
    server = None
    producer_thread = None
    try:
        worker = Worker(db, Settings())
        with db:
            # A terminated POST may have reached the recipient. Preserve it for reconciliation.
            db.execute("UPDATE events SET delivery = 'uncertain' WHERE delivery = 'sending'")
        server = ThreadingHTTPServer((os.getenv("CAMHOME_HTTP_BIND", "0.0.0.0"), int(os.getenv("SERVER_PORT", "8080"))),
                                     handler_for(path, links, status))
        Thread(target=server.serve_forever, daemon=True).start()
        if producer:
            status["ai"] = "ready"
            producer_thread = Thread(target=producer, args=(stop, status), daemon=True)
            producer_thread.start()
        print(json.dumps({"event": "notification_service_started", **status}), flush=True)
        next_check = 0
        send_after = 0

        def send(event):
            nonlocal send_after
            started = time.monotonic()
            if relay:
                if event["live"] and not links:
                    return "failed"
                result = relay(event, links.url(event["id"], time.time()) if links else None)
            else:
                result = send_event(bot, links, event)
            if result == "retry" or isinstance(result, tuple) and result[0] == "retry":
                send_after = time.time() + max(30, result[1] if isinstance(result, tuple) else 0)
            if event["live"]:
                print(json.dumps({"event": "live_delivery", "request_ms": round((time.monotonic()-started)*1000),
                                  "frame_to_response_ms": round((time.time()-event["captured"])*1000)}), flush=True)
            return result

        while not stop.is_set():
            if producer_thread and not producer_thread.is_alive():
                raise RuntimeError("Video producer stopped")
            now = time.time()
            worker.maintenance(now)
            if bot and now >= next_check:
                try:
                    bot.get_me()
                    status["zalo"] = "reachable"
                except BotError as error:
                    status["zalo"] = error.outcome
                next_check = now + 60
            if (relay or status["zalo"] == "reachable") and now >= send_after:
                outcome = worker.deliver_one(now, send)
                if outcome:
                    print(json.dumps({"event": "delivery", "outcome": outcome}), flush=True)
            status["queue"] = dict(db.execute(
                "SELECT delivery, COUNT(*) FROM events GROUP BY delivery"
            ))
            stop.wait(1 if relay else 5)
    finally:
        stop.set()
        if producer_thread:
            producer_thread.join(timeout=20)
        if server:
            server.shutdown()
            server.server_close()
        db.close()


if __name__ == "__main__":
    run()
