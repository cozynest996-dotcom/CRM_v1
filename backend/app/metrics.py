import threading
from typing import Dict, Any


class _Metrics:
    def __init__(self):
        self.lock = threading.Lock()
        self.counters: Dict[str, int] = {}
        # simple histograms: name -> {count, total, min, max}
        self.histograms: Dict[str, Dict[str, float]] = {}

    def increment(self, key: str, amount: int = 1) -> None:
        with self.lock:
            self.counters[key] = self.counters.get(key, 0) + amount

    def observe_hist(self, key: str, value: float) -> None:
        with self.lock:
            h = self.histograms.get(key)
            if not h:
                self.histograms[key] = {"count": 1, "total": value, "min": value, "max": value}
            else:
                h["count"] += 1
                h["total"] += value
                h["min"] = min(h["min"], value)
                h["max"] = max(h["max"], value)

    def get_metrics(self) -> Dict[str, Any]:
        with self.lock:
            # build a shallow copy
            return {
                "counters": dict(self.counters),
                "histograms": {k: dict(v) for k, v in self.histograms.items()},
            }


metrics = _Metrics()


