import math


class Presence:
    def __init__(self, interval=15, debounce=1.5):
        if not math.isfinite(interval) or interval <= 0 or not math.isfinite(debounce) or debounce < 0:
            raise ValueError("Invalid presence timing")
        self.interval = interval
        self.debounce = debounce
        self.reset()

    def reset(self):
        self.last_seen = None
        self.last_alert = None

    def observe(self, now, people):
        if not people:
            if self.last_seen is not None and now - self.last_seen >= self.debounce:
                self.reset()
                return "left"
            return None
        self.last_seen = now
        if self.last_alert is None or now - self.last_alert >= self.interval:
            self.last_alert = now
            return "alert"
        return None
