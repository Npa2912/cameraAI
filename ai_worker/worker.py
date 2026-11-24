"""Independent object detection worker for authorized frame sources."""

import argparse
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import sqlite3
from uuid import uuid4
from zoneinfo import ZoneInfo

PEOPLE = {"person"}
ANIMALS = {"dog", "cat", "bird", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"}


@dataclass(frozen=True)
class Settings:
    confidence: float = 0.6
    confirmations: int = 3
    cooldown: float = 60
    people: bool = True
    animals: bool = True
    enabled: bool = True
    notify: bool = False

    def __post_init__(self):
        if not 0 < self.confidence <= 1 or self.confirmations < 2 or not 0 <= self.cooldown < float("inf"):
            raise ValueError("Invalid confidence, confirmations or cooldown")


class Worker:
    def __init__(self, database: sqlite3.Connection, settings: Settings):
        self.db = database
        self.settings = settings
        self.streaks = {}
        self.active = {}
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY, camera TEXT NOT NULL, label TEXT NOT NULL,
                confidence REAL NOT NULL, captured REAL NOT NULL, local_time TEXT NOT NULL,
                jpeg BLOB NOT NULL, delivery TEXT NOT NULL
            )
        """)
        self.db.execute("CREATE INDEX IF NOT EXISTS event_cooldown ON events(camera, label, captured)")
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(events)")}
        if "retry_at" not in columns:
            self.db.execute("ALTER TABLE events ADD COLUMN retry_at REAL NOT NULL DEFAULT 0")
        if "attempts" not in columns:
            self.db.execute("ALTER TABLE events ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0")
        if "live" not in columns:
            self.db.execute("ALTER TABLE events ADD COLUMN live INTEGER NOT NULL DEFAULT 0")

    def enqueue_live(self, camera, captured, confidence, jpeg):
        event_id = uuid4().hex
        local = datetime.fromtimestamp(captured, ZoneInfo("Asia/Ho_Chi_Minh")).isoformat()
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            self.db.execute(
                "UPDATE events SET delivery = 'expired' WHERE camera = ? AND live = 1 AND delivery = 'pending'",
                (camera,),
            )
            self.db.execute(
                """INSERT INTO events
                   (id,camera,label,confidence,captured,local_time,jpeg,delivery,live)
                   VALUES (?,?,'person',?,?,?,?,'pending',1)""",
                (event_id, camera, confidence, captured, local, jpeg),
            )

    def maintenance(self, now):
        with self.db:
            self.db.execute(
                "UPDATE events SET delivery = 'expired' WHERE live = 1 AND delivery = 'pending' AND captured <= ?",
                (now - 12,),
            )
            self.db.execute("DELETE FROM events WHERE live = 1 AND captured <= ? AND delivery != 'sending'",
                            (now - 330,))

    def cancel_live(self, camera):
        with self.db:
            self.db.execute(
                "UPDATE events SET delivery = 'expired' WHERE camera = ? AND live = 1 AND delivery = 'pending'",
                (camera,),
            )

    def process(self, camera, captured, detections: Iterable[tuple[str, float]], encode_snapshot):
        settings = self.settings
        if not settings.enabled:
            self.streaks.pop(camera, None)
            self.active.pop(camera, None)
            return []
        allowed = (PEOPLE if settings.people else set()) | (ANIMALS if settings.animals else set())
        scores = {}
        for label, confidence in detections:
            if label in allowed and settings.confidence <= confidence <= 1:
                scores[label] = max(scores.get(label, 0), confidence)
        previous = self.streaks.get(camera, {})
        streaks = {label: min(previous.get(label, 0) + 1, settings.confirmations) for label in scores}
        self.streaks[camera] = streaks
        active = self.active.setdefault(camera, {})
        for label in list(active):
            active[label] = 0 if label in scores else active[label] + 1
            if active[label] >= settings.confirmations:
                del active[label]
        local_time = datetime.fromtimestamp(captured, ZoneInfo("Asia/Ho_Chi_Minh")).isoformat()
        created = []
        activated = []
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            snapshot = None
            for label, count in streaks.items():
                if count < settings.confirmations or label in active:
                    continue
                latest = self.db.execute(
                    "SELECT MAX(captured) FROM events WHERE camera = ? AND label = ?", (camera, label)
                ).fetchone()[0]
                if latest is not None and captured - latest < settings.cooldown:
                    continue
                if snapshot is None:
                    snapshot = encode_snapshot()
                if not snapshot:
                    raise ValueError("Event frame could not be encoded")
                event_id = uuid4().hex
                self.db.execute(
                    """INSERT INTO events
                       (id, camera, label, confidence, captured, local_time, jpeg, delivery)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (event_id, camera, label, scores[label], captured, local_time, snapshot,
                     "pending" if settings.notify else "disabled"),
                )
                created.append(event_id)
                activated.append(label)
        active.update(dict.fromkeys(activated, 0))
        return created

    def deliver_one(self, now, sender):
        """Sender returns sent, retry, failed or uncertain. Retry only known non-deliveries."""
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            self.db.row_factory = sqlite3.Row
            try:
                event = self.db.execute(
                    """SELECT * FROM events WHERE delivery = 'pending' AND retry_at <= ?
                       AND (live = 0 OR captured > ?) ORDER BY live DESC, captured LIMIT 1""", (now, now - 12)
                ).fetchone()
            finally:
                self.db.row_factory = None
            if event is None:
                return None
            self.db.execute("UPDATE events SET delivery = 'sending', attempts = attempts + 1 WHERE id = ?",
                            (event["id"],))
        try:
            result = sender(dict(event))
        except Exception:
            result = "uncertain"
        outcome, minimum_delay = result if isinstance(result, tuple) else (result, 0)
        if outcome not in {"sent", "retry", "failed", "uncertain"}:
            outcome = "uncertain"
        if outcome == "retry" and event["attempts"] >= 7:
            outcome = "failed"
        delay = max(minimum_delay, min(3600, 30 * 2 ** min(event["attempts"], 7)))
        with self.db:
            self.db.execute("UPDATE events SET delivery = ?, retry_at = ? WHERE id = ?",
                            ("pending" if outcome == "retry" else outcome, now + delay, event["id"]))
        return outcome


def sample_frames(path, stride):
    import cv2

    if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
        frame = cv2.imread(str(path))
        if frame is None:
            raise ValueError("Cannot read sample image")
        yield 0, frame
        return
    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            raise ValueError("Cannot open sample video")
        index = 0
        fps = capture.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            raise ValueError("Cannot determine sample video frame rate")
        while True:
            available, frame = capture.read()
            if not available:
                break
            if index % stride == 0:
                yield index / fps, frame
            index += 1
    finally:
        capture.release()


def run_frames(worker, camera, frames, model):
    """Consume timestamped BGR frames from a sample or an authorized stream adapter."""
    import cv2

    for captured, frame in frames:
        prediction = model.predict(frame, conf=worker.settings.confidence, verbose=False)[0]
        detections = [
            (prediction.names[int(label)], score)
            for label, score in zip(prediction.boxes.cls.tolist(), prediction.boxes.conf.tolist())
        ]

        def snapshot():
            ok, buffer = cv2.imencode(".jpg", frame)
            return buffer.tobytes() if ok else None

        yield detections, worker.process(camera, captured, detections, snapshot)


def main():
    import time

    parser = argparse.ArgumentParser(description="CamHome sample object detection worker")
    parser.add_argument("sample", type=Path)
    parser.add_argument("--weights", type=Path, required=True, help="Local COCO YOLO weights")
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--camera", default="sample")
    parser.add_argument("--confidence", type=float, default=0.6)
    parser.add_argument("--confirmations", type=int, default=3)
    parser.add_argument("--cooldown", type=float, default=60)
    parser.add_argument("--stride", type=int, default=5)
    args = parser.parse_args()
    if not args.sample.is_file() or not args.weights.is_file() or args.stride < 1:
        parser.error("Provide an existing sample and weights file and a positive stride")

    from ultralytics import YOLO

    model = YOLO(str(args.weights), task="detect")
    from ai_worker.notifications.zalo_bot import enabled

    settings = Settings(args.confidence, args.confirmations, args.cooldown, notify=enabled())
    database = sqlite3.connect(args.db)
    try:
        worker = Worker(database, settings)
        start = time.time()
        frames = ((start + offset, frame) for offset, frame in sample_frames(args.sample, args.stride))
        for detections, events in run_frames(worker, args.camera, frames, model):
            if args.sample.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                print(detections)
            for event_id in events:
                print(event_id, flush=True)
    finally:
        database.close()


if __name__ == "__main__":
    main()
