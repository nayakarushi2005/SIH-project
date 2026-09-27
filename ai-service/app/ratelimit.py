"""Per-user request limit (in memory; one service process)."""

import time
from collections import defaultdict, deque

from app.errors import ServiceError


class RateLimiter:
    def __init__(self, limit: int = 30, window_s: float = 60):
        self.limit = limit
        self.window_s = window_s
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_s:
            hits.popleft()
        if len(hits) >= self.limit:
            raise ServiceError(429, "Too many requests. Please slow down.", "rate_limited")
        hits.append(now)
