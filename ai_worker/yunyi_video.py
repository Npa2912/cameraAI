"""Read an HTTPS stream explicitly granted by Yunyi or its approved SDK."""

from contextlib import contextmanager
import ipaddress
from urllib.parse import urlsplit


@contextmanager
def open_video(url):
    import av
    import certifi

    parts = urlsplit(url)
    if (parts.scheme != "https" or not parts.hostname or "." not in parts.hostname
            or parts.username or parts.password or parts.fragment
            or parts.hostname.lower().rstrip(".").endswith((".local", ".internal", ".localhost"))):
        raise ValueError("Provide an authorized Yunyi HTTPS stream URL")
    try:
        ipaddress.ip_address(parts.hostname)
    except ValueError:
        pass
    else:
        raise ValueError("The stream URL must use the approved provider hostname")
    options = {"protocol_whitelist": "https,tls,tcp,crypto", "tls_verify": "1", "ca_file": certifi.where()}
    with av.open(url, timeout=(8.0, 10.0), options=options) as video:
        stream = video.streams.video[0]
        stream.codec_context.thread_count = 1
        yield video.decode(stream)
