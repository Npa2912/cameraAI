from contextlib import nullcontext
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from main import probe
from ai_worker.yunyi_video import open_video


class BotkeepTests(unittest.TestCase):
    def test_rejects_direct_lan_and_http(self):
        for url in ("https://192.168.1.21/live", "http://provider.example/live",
                    "https://camera.local/live", "https://user:pass@provider.example/live"):
            with self.subTest(url=url), self.assertRaises(ValueError), open_video(url):
                self.fail("Invalid source accepted")

    def test_probe_needs_sixteen_frames(self):
        frame = SimpleNamespace(width=1280, height=720)
        with patch("main.open_video", return_value=nullcontext(iter([frame] * 15))):
            with self.assertRaises(StopIteration):
                probe("https://provider.example/live")
        with patch("main.open_video", return_value=nullcontext(iter([frame] * 16))), patch("builtins.print"):
            probe("https://provider.example/live")
