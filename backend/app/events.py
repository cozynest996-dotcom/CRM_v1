import asyncio
from typing import List, Any

# Simple in-memory broadcaster for Server-Sent Events (SSE)
subscribers: List[asyncio.Queue] = []

def publish_event(event: Any) -> None:
    # push event to all subscriber queues (non-blocking)
    for q in list(subscribers):
        try:
            q.put_nowait(event)
        except Exception:
            # ignore failing subscriber
            pass