"""Windows LAN bridge using the external MIT-licensed OpenYI checkout."""
import argparse
import base64
from collections import deque
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import io
import json
import os
from pathlib import Path
import queue
import secrets
import socket
import sys
import threading
import time


class Preview:
    def __init__(self, connect, folder, ptz=False):
        self.connect = connect
        self.folder = folder
        self.ptz = ptz
        self.pending_move = None
        self.lock = threading.Lock()
        self.leases = {}
        self.state = {"status": "offline"}
        self.frame = None
        self.number = 0
        self.closed = threading.Event()

    def publish(self, status, message=None):
        with self.lock:
            self.state = {"status": status, "message": message}
            self.frame = None
            self.pending_move = None

    def wanted(self):
        with self.lock:
            now = time.monotonic()
            self.leases = {key: end for key, end in self.leases.items() if end > now}
            return bool(self.leases) and not self.closed.is_set()

    def poll(self, viewer, after):
        with self.lock:
            self.leases[viewer] = time.monotonic() + 6
            result = dict(self.state)
            if self.frame and self.number != after:
                result.update(sequence=self.number, image=base64.b64encode(self.frame).decode())
            return result

    def release(self, viewer):
        with self.lock:
            self.leases.pop(viewer, None)

    def decoded(self, jpeg, width, height, fps):
        with self.lock:
            self.number += 1
            self.frame = jpeg
            self.state = dict(status="online", width=width, height=height, fps=fps, codec="H.264", ptz=self.ptz)

    def move(self, viewer, direction):
        with self.lock:
            if (not self.ptz or not self.frame or self.pending_move is not None
                    or self.leases.get(viewer, 0) <= time.monotonic()):
                return False
            self.pending_move = (viewer, direction)
            return True

    def next_move(self):
        with self.lock:
            move, self.pending_move = self.pending_move, None
            if move and self.leases.get(move[0], 0) > time.monotonic():
                return move[1]
            return None

    def snapshot(self):
        with self.lock:
            jpeg = self.frame
        if jpeg is None:
            return None
        self.folder.mkdir(parents=True, exist_ok=True)
        name = time.strftime("YIQ6-%Y%m%d-%H%M%S-") + secrets.token_hex(4) + ".jpg"
        (self.folder / name).write_bytes(jpeg)
        return name

    def run(self):
        while not self.closed.is_set():
            if not self.wanted():
                self.publish("offline")
                self.closed.wait(0.15)
                continue
            self.publish("connecting")
            try:
                self.connect(self)
            except FatalCameraError as error:
                self.publish("error", str(error))
                while self.wanted():
                    self.closed.wait(0.2)
            except CameraOffline as error:
                self.publish("offline", str(error))
                self.closed.wait(2)
            except OSError:
                self.publish("offline", "Camera unavailable. Retrying over LAN.")
                self.closed.wait(2)
            except Exception:
                self.publish("error", "Camera session failed. Check the OpenYI profile and LAN.")
                self.closed.wait(2)


class CameraOffline(OSError):
    pass


class FatalCameraError(RuntimeError):
    pass


def source(openyi, profile_path, expected_ip, bind_ip, broadcast):
    sys.path.insert(0, str(openyi.resolve(strict=True)))
    import av
    from yicam.credentials import load_device
    from yicam import protocol
    from yicam.protocol import AuthenticationError, Camera
    from yicam.video import FrameClock, FrameOrder

    if broadcast:
        discovery = protocol.envelope(0x30)

        class DiscoverySocket(socket.socket):
            def bind(self, address):
                self.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
                return super().bind((bind_ip, address[1]))

            def sendto(self, data, peer):
                if peer == (expected_ip, 32108) and data == discovery:
                    peer = (broadcast, 32108)
                return super().sendto(data, peer)

        class ProtocolSocketModule:
            socket = DiscoverySocket

            def __getattr__(self, name):
                return getattr(socket, name)

        # Adapt discovery inside the external module only. The original session
        # still validates the camera address and UID before authenticating.
        protocol.socket = ProtocolSocketModule()

    def stream(preview):
        try:
            profile = load_device(profile_path)
            if profile["ip"] != expected_ip or profile.get("protocol", "yi-stock") != "yi-stock":
                raise ValueError()
            if not profile["password"]:
                raise ValueError()
        except (OSError, ValueError, KeyError, TypeError):
            raise FatalCameraError("OpenYI DPAPI profile is unavailable or does not match the stock LAN camera.") from None
        camera = None
        stage = "TNP handshake"
        try:
            camera = Camera(expected_ip, profile["password"], profile.get("uid"))
            camera.connect()
            stage = "camera authentication"
            camera.firmware()
            stage = "video start"
            quality = profile.get("stream_quality", 1)
            camera.start_video(quality if quality in (0, 1, 2) else 1)
            stage = "waiting for decoded video"
            order, clock = FrameOrder(), FrameClock()
            stamps = deque(maxlen=30)
            decoder, decoder_id = None, None
            last_decoded = time.monotonic()
            while preview.wanted():
                if not camera.running or time.monotonic() - last_decoded > 8:
                    raise TimeoutError()
                direction = preview.next_move()
                if direction is not None:
                    reverse = profile.get("reverse_tilt_controls" if direction < 3 else "reverse_pan_controls")
                    if reverse:
                        direction = {1: 2, 2: 1, 3: 4, 4: 3}[direction]
                    camera.move(direction, 0.12)
                try:
                    received = camera.frames.get(timeout=0.15)
                except queue.Empty:
                    continue
                for frame in order.feed(received):
                    if frame.codec != 0x4e:
                        raise FatalCameraError("Camera sent a codec other than H.264.")
                    stream_id = (order.epoch, frame.generation)
                    if decoder_id != stream_id:
                        if not frame.keyframe:
                            continue
                        decoder = av.CodecContext.create("h264", "r")
                        decoder_id = stream_id
                        stamps.clear()
                        clock = FrameClock()
                    stamps.append(clock.time(frame))
                    try:
                        images = decoder.decode(av.Packet(frame.data))
                    except av.FFmpegError:
                        decoder_id = None
                        continue
                    if images:
                        image = images[-1].to_image()
                        jpeg = io.BytesIO()
                        image.save(jpeg, format="JPEG", quality=75)
                        span = stamps[-1] - stamps[0]
                        preview.decoded(jpeg.getvalue(), image.width, image.height,
                                        round((len(stamps) - 1) / span, 1) if span > 0 else None)
                        last_decoded = time.monotonic()
        except AuthenticationError:
            raise FatalCameraError("Camera rejected the OpenYI pairing.") from None
        except OSError:
            raise CameraOffline(f"Camera unavailable during {stage}. Retrying over LAN.") from None
        finally:
            if camera is not None:
                camera.close()

    return stream


def serve(host, port, token, preview):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, data):
            payload = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            try:
                self.wfile.write(payload)
            except OSError:
                pass

        def do_POST(self):
            authorization = self.headers.get("Authorization", "").encode()
            if not hmac.compare_digest(authorization, ("Bearer " + token).encode()):
                self.reply(401, {})
                return
            if self.path not in ("/frame", "/disconnect", "/snapshot", "/move"):
                self.reply(404, {})
                return
            try:
                viewer = self.headers["X-CamHome-Viewer"]
                if not viewer or len(viewer) > 64:
                    raise ValueError()
                after = int(self.headers.get("X-CamHome-Frame", "-1"))
            except (TypeError, ValueError):
                self.reply(400, {})
                return
            if self.path == "/frame":
                self.reply(200, preview.poll(viewer, after))
            elif self.path == "/disconnect":
                preview.release(viewer)
                self.reply(200, {})
            elif self.path == "/move":
                direction = {"up": 1, "down": 2, "left": 3, "right": 4}.get(self.headers.get("X-CamHome-Direction"))
                self.reply(202 if direction and preview.move(viewer, direction) else 409, {})
            else:
                try:
                    name = preview.snapshot()
                    self.reply(200 if name else 409, {"name": name})
                except OSError:
                    self.reply(500, {})

    return ThreadingHTTPServer((host, port), Handler)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--openyi", type=Path, required=True)
    parser.add_argument("--profile", type=Path,
                        default=Path(os.environ.get("LOCALAPPDATA", ".")) / "YI Local" / "device.dpapi")
    parser.add_argument("--camera", required=True)
    parser.add_argument("--listen", default="127.0.0.1")
    parser.add_argument("--broadcast", help="IPv4 broadcast address for LAN TNP discovery.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--snapshots", type=Path, default=Path.home() / "Pictures" / "CamHome")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--ptz", action="store_true", help="Enable controls after confirming PTZ compatibility.")
    args = parser.parse_args()
    for value in (args.camera, args.listen, args.broadcast or args.camera):
        address = ipaddress.IPv4Address(value)
        if not any(address in ipaddress.IPv4Network(network) for network in
                   ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8")):
            parser.error("Use an IPv4 address on the local network.")
    bind_ip = "" if args.listen == "127.0.0.1" else args.listen
    preview = Preview(source(args.openyi, args.profile, args.camera, bind_ip, args.broadcast),
                      args.snapshots, args.ptz)
    worker = threading.Thread(target=preview.run, daemon=True)
    if args.probe:
        worker.start()
        try:
            deadline = time.monotonic() + 22
            last_failure = None
            while time.monotonic() < deadline:
                result = preview.poll("probe", -1)
                if result["status"] == "online":
                    result.pop("image")
                    print(json.dumps(result))
                    return 0
                if result["status"] == "error":
                    print(result["message"])
                    return 1
                if result["status"] == "offline" and result.get("message"):
                    last_failure = result["message"]
                time.sleep(0.2)
            print(last_failure or "Timed out waiting for a decoded camera frame.")
            return 1
        finally:
            preview.closed.set()
            worker.join(timeout=8)
    token = secrets.token_urlsafe(24)
    with serve(args.listen, args.port, token, preview) as server:
        print(f"CamHome bridge listening at http://{args.listen}:{args.port}", flush=True)
        print(f"CamHome access code: {token}", flush=True)
        worker.start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            preview.closed.set()
            worker.join(timeout=8)
    return 0


if __name__ == "__main__":
    sys.exit(main())
