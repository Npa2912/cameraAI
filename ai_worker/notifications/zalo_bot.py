"""Client for the official Zalo Bot JSON API."""

from datetime import datetime, timedelta, timezone
from http.client import HTTPSConnection, HTTPException
import json
import os
import re
from urllib.parse import urlsplit


LABELS = {"person": "Người", "dog": "Chó", "cat": "Mèo", "bird": "Chim"}


class BotError(Exception):
    def __init__(self, outcome, retry_after=0):
        super().__init__(outcome)
        self.outcome = outcome
        self.retry_after = retry_after


def enabled():
    return os.getenv("ZALO_NOTIFICATIONS_ENABLED", "").lower() in {"1", "true", "yes"}


class ZaloBot:
    def __init__(self, token, chat_id="", connection=HTTPSConnection):
        if not re.fullmatch(r"[A-Za-z0-9._~:-]{1,512}", token):
            raise ValueError("Missing or invalid ZALO_BOT_TOKEN")
        self._token = token
        self.chat_id = chat_id
        self._connection = connection

    @classmethod
    def from_env(cls):
        return cls(os.getenv("ZALO_BOT_TOKEN", ""), os.getenv("ZALO_CHAT_ID", ""))

    def _call(self, method, payload, timeout=12, sending=False):
        connection = self._connection("bot-api.zaloplatforms.com", timeout=timeout)
        try:
            try:
                connection.connect()
            except (OSError, HTTPException):
                raise BotError("retry") from None
            try:
                connection.request("POST", f"/bot{self._token}/{method}", json.dumps(payload),
                                   {"Content-Type": "application/json"})
                response = connection.getresponse()
                if response.status == 429:
                    retry_after = response.getheader("Retry-After") or ""
                    raise BotError("retry", int(retry_after) if re.fullmatch(r"[0-9]{1,9}", retry_after) else 0)
                if response.status >= 500:
                    raise BotError("uncertain" if sending else "retry")
                if not 200 <= response.status < 300:
                    raise BotError("failed")
                data = json.loads(response.read(65537))
            except (OSError, HTTPException, ValueError):
                raise BotError("uncertain" if sending else "retry") from None
        finally:
            connection.close()
        if isinstance(data, dict) and data.get("ok") is False:
            if data.get("error_code") == 429:
                raise BotError("retry")
            raise BotError("failed")
        result = data.get("result") if isinstance(data, dict) and data.get("ok") is True else None
        if not isinstance(result, dict) or (sending and not result.get("message_id")):
            raise BotError("uncertain" if sending else "failed")
        return result

    def get_me(self):
        return self._call("getMe", {})

    def private_chat_id(self, pairing_code):
        update = self._call("getUpdates", {"timeout": 30}, timeout=40)
        message = update.get("message", {})
        chat = message.get("chat", {})
        if (update.get("event_name") == "message.text.received" and chat.get("chat_type") == "PRIVATE"
                and message.get("from", {}).get("is_bot") is False
                and message.get("text") == pairing_code and isinstance(chat.get("id"), str)):
            return chat["id"]
        return None

    def _recipient(self, text):
        if not self.chat_id or not 1 <= len(text) <= 2000:
            raise ValueError("Configure ZALO_CHAT_ID and use 1–2000 characters")
        return self.chat_id

    def send_text(self, text):
        return self._call("sendMessage", {"chat_id": self._recipient(text), "text": text}, sending=True)

    def send_photo(self, url, caption):
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("A valid HTTPS photo URL is required")
        return self._call("sendPhoto", {
            "chat_id": self._recipient(caption), "photo": url, "caption": caption,
        }, sending=True)


def event_caption(event, simulation=False):
    captured = datetime.fromtimestamp(event["captured"], timezone(timedelta(hours=7)))
    name = LABELS.get(event["label"], event["label"])
    title = "CAMHOME — THỬ NGHIỆM" if simulation else "CAMHOME — CẢNH BÁO AI"
    return (f"🚨 {title}\n\n📷 Camera: {event['camera']}\n👤 Phát hiện: {name}\n"
            f"🕒 Thời gian: {captured:%d/%m/%Y %H:%M:%S}\n"
            f"🎯 Độ tin cậy: {event['confidence']:.0%}")
