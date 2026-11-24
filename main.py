"""Botkeep Python 3.11 entry point. Probe the authorized source before enabling AI."""

import os
from pathlib import Path
import shutil
import sqlite3
import time
from contextlib import closing

from dotenv import load_dotenv

from ai_worker.presence import Presence
from ai_worker.worker import Settings, Worker
from ai_worker.yunyi_video import open_video


def probe(url):
    with open_video(url) as frames:
        first = next(frames)
        for _ in range(15):
            next(frames)
        print(f"Video probe: 16 decoded frames; {first.width}x{first.height}", flush=True)


def producer(url, detector, path, settings, interval):
    def run(stop, status):
        import av

        presence = Presence(interval)
        with closing(sqlite3.connect(path)) as db:
            worker = Worker(db, settings)
            delay = 1
            while not stop.is_set():
                started = time.monotonic()
                next_sample = 0
                presence.reset()
                worker.cancel_live("YI06")
                status["video"] = "connecting"
                try:
                    with open_video(url) as frames:
                        for frame in frames:
                            if stop.is_set():
                                return
                            status["video"] = "receiving"
                            now = time.monotonic()
                            if now < next_sample:
                                continue
                            captured = time.time()
                            next_sample = now + .5
                            image = frame.to_ndarray(format="bgr24")
                            people = detector.detect(image)
                            action = presence.observe(now, len(people))
                            if action == "left":
                                worker.cancel_live("YI06")
                            elif action == "alert":
                                worker.enqueue_live("YI06", captured, max(score for _, score in people),
                                                    detector.jpeg(image, people))
                except (ValueError, OSError, IndexError, av.error.FFmpegError) as error:
                    print(f"Source retry: {type(error).__name__}", flush=True)
                finally:
                    worker.cancel_live("YI06")
                    status["video"] = "disconnected"
                if time.monotonic() - started >= 30:
                    delay = 1
                stop.wait(delay)
                delay = min(delay * 2, 30)
    return run


def main():
    load_dotenv()
    mode = os.getenv("CAMHOME_MODE", "probe")
    url = os.getenv("CAMHOME_YUNYI_STREAM_URL", "")
    if not url:
        raise ValueError("An authorized Yunyi stream URL is required")
    if mode == "probe":
        probe(url)
        return
    if mode != "live":
        raise ValueError("CAMHOME_MODE must be probe or live")
    from ai_worker.onnx_person import PersonDetector
    from ai_worker.service import run

    for variable in ("CAMHOME_PUBLIC_ORIGIN", "CAMHOME_PHOTO_KEY", "NOTIFY_SECRET"):
        if not os.getenv(variable):
            raise ValueError(f"Missing {variable}")
    os.environ["CAMHOME_NOTIFY_URL"] = "https://camhome-zalo-bot.anpr2154.workers.dev/notify"
    os.environ["ZALO_NOTIFICATIONS_ENABLED"] = "true"
    settings = Settings(confidence=float(os.getenv("CAMHOME_CONFIDENCE", ".6")))
    interval = float(os.getenv("CAMHOME_ALERT_INTERVAL", "15"))
    Presence(interval)
    model = Path(os.getenv("CAMHOME_ONNX_MODEL", "models/yolo11n.onnx"))
    print(f"Runtime resources: visible_cpus={os.cpu_count()} disk_free_mib={shutil.disk_usage('.').free // 1048576} "
          f"model_mib={model.stat().st_size / 1048576:.1f}", flush=True)
    detector = PersonDetector(model, settings.confidence)
    path = os.getenv("CAMHOME_AI_DB", "camhome.sqlite")
    run(producer(url, detector, path, settings, interval))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(f"Startup or probe failed: {type(error).__name__}") from None
