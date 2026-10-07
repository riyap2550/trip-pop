"""Tiny JSON-file store. One user, one file — swap for a database when you add accounts."""

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "state.json"
_lock = threading.RLock()

DEFAULT_STATE = {
    "profile": {
        "name": "",
        "home_airport": "JFK",
        "passport_country": "United States",
        "passport_expiry": None,
        "budget_style": "mid",          # value | mid | luxury
        "typical_daily_budget": None,   # USD per person per day, learned over time
        "pace": "balanced",             # relaxed | balanced | packed
        "interests": [],
        "dislikes": [],
        "learned_notes": [],            # free-form facts the agent has learned
        "history": [],                  # log of profile changes the agent made, with reasons
    },
    "trips": [],
    "watches": [],
    "alerts": [],
    "holds": [],
    "documents": [],
    "destinations": {},  # cities the planning agent added, keyed by destination_id
    "users": [],
    "refresh_tokens": [],
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _load() -> dict:
    if not DATA_FILE.exists():
        return json.loads(json.dumps(DEFAULT_STATE))
    state = json.loads(DATA_FILE.read_text())
    for key, value in DEFAULT_STATE.items():
        state.setdefault(key, json.loads(json.dumps(value)))
    for key, value in DEFAULT_STATE["profile"].items():
        state["profile"].setdefault(key, value)
    return state


def _save(state: dict) -> None:
    DATA_FILE.parent.mkdir(exist_ok=True)
    tmp = DATA_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(DATA_FILE)


def read() -> dict:
    with _lock:
        return _load()


class transaction:
    """`with transaction() as state:` — mutate `state`; it's saved on exit."""

    def __enter__(self) -> dict:
        _lock.acquire()
        self.state = _load()
        return self.state

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                _save(self.state)
        finally:
            _lock.release()


def find(items: list[dict], item_id: str) -> dict | None:
    return next((i for i in items if i["id"] == item_id), None)
