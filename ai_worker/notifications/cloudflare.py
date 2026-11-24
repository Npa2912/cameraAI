"""Optional transport to the CamHome Cloudflare notification endpoint."""

from http.client import HTTPSConnection, HTTPException
import json
import re
from urllib.parse import urlsplit


class CloudflareNotifier:
    def __init__(self, url, secret, connection=HTTPSConnection):
        parts = urlsplit(url)
        if (parts.scheme != "https" or not parts.hostname or parts.username or parts.password
                or parts.path != "/notify" or parts.query or parts.fragment
                or not re.fullmatch(r"[!-~]{32,256}", secret)):
            raise ValueError("Configure CAMHOME_NOTIFY_URL and NOTIFY_SECRET")
        self.host = parts.hostname
        self.port = parts.port or 443
        self.secret = secret
        self.connection = connection

    def __call__(self, event, photo_url):
        payload = {key: event[key] for key in ("camera", "label", "captured", "confidence")}
        if photo_url:
            payload["photo_url"] = photo_url
        connection = self.connection(self.host, self.port, timeout=18)
        try:
            try:
                connection.connect()
            except (OSError, HTTPException):
                return "retry"
            try:
                connection.request("POST", "/notify", json.dumps(payload), {
                    "Content-Type": "application/json", "Authorization": f"Bearer {self.secret}",
                })
                response = connection.getresponse()
                if response.status == 429:
                    delay = response.getheader("Retry-After") or ""
                    return "retry", int(delay) if re.fullmatch(r"[0-9]{1,9}", delay) else 30
                if response.status == 200:
                    data = json.loads(response.read(8192))
                    if isinstance(data, dict) and data.get("ok") is True and data.get("outcome") == "sent":
                        return "sent"
                if response.status in {400, 401, 404, 405, 413, 415, 422}:
                    return "failed"
            except (OSError, HTTPException, ValueError):
                pass
            return "uncertain"
        finally:
            connection.close()
