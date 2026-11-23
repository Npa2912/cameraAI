import base64
from http.client import HTTPConnection
import json
from pathlib import Path
import tempfile
import threading
import unittest

from yiq6_bridge import CameraOffline, Preview, serve


class BridgeHttpTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.preview = Preview(None, Path(self.folder.name))
        self.server = serve("127.0.0.1", 0, "test-code", self.preview)
        self.addCleanup(self.server.server_close)
        worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        worker.start()
        self.addCleanup(worker.join, 2)
        self.addCleanup(self.server.shutdown)

    def request(self, action, code="test-code", after="-1", direction="up"):
        connection = HTTPConnection(*self.server.server_address, timeout=2)
        try:
            connection.request("POST", "/" + action, headers={
                "Authorization": "Bearer " + code,
                "X-CamHome-Viewer": "test-viewer",
                "X-CamHome-Frame": after,
                "X-CamHome-Direction": direction,
            })
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_access_and_disconnect(self):
        self.assertEqual(self.request("frame", code="bad")[0], 401)
        self.assertFalse(self.preview.wanted())
        self.assertEqual(self.request("frame"), (200, {"status": "offline"}))
        self.assertTrue(self.preview.wanted())
        self.assertEqual(self.request("disconnect")[0], 200)
        self.assertFalse(self.preview.wanted())

    def test_ptz_requires_opt_in_and_an_active_viewer(self):
        self.preview.decoded(b"frame fixture", 1280, 720, 15)
        self.request("frame")
        self.assertEqual(self.request("move")[0], 409)
        self.preview.ptz = True
        self.assertEqual(self.request("move", direction="invalid")[0], 409)
        self.assertEqual(self.request("move")[0], 202)
        self.assertEqual(self.preview.next_move(), 1)
        self.request("disconnect")
        self.assertEqual(self.request("move")[0], 409)

    def test_worker_reconnects_after_transport_loss_with_active_viewer(self):
        second_connection = threading.Event()
        calls = []

        def connect(preview):
            calls.append(True)
            if len(calls) == 1:
                raise CameraOffline("Simulated transport loss")
            preview.decoded(b"new frame fixture", 1280, 720, 15)
            second_connection.set()
            preview.closed.wait(4)

        self.preview.connect = connect
        self.request("frame")
        worker = threading.Thread(target=self.preview.run, daemon=True)
        worker.start()
        try:
            self.assertTrue(second_connection.wait(4))
            self.assertEqual(self.request("frame")[1]["status"], "online")
        finally:
            self.preview.closed.set()
            worker.join(2)

    def test_frame_sequence_and_snapshot(self):
        self.assertEqual(self.request("snapshot")[0], 409)
        data = b"frame fixture"
        self.preview.decoded(data, 1280, 720, 15)
        status, frame = self.request("frame")
        self.assertEqual(status, 200)
        self.assertEqual(frame["codec"], "H.264")
        self.assertEqual(base64.b64decode(frame["image"]), data)
        self.assertNotIn("image", self.request("frame", after=str(frame["sequence"]))[1])
        status, snapshot = self.request("snapshot")
        self.assertEqual(status, 200)
        self.assertEqual((Path(self.folder.name) / snapshot["name"]).read_bytes(), data)
        self.preview.publish("offline")
        self.assertNotIn("image", self.request("frame")[1])
        self.assertEqual(self.request("snapshot")[0], 409)


if __name__ == "__main__":
    unittest.main()
