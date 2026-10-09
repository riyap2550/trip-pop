"""Tiny JSON-file store. One file for all users — swap for a database before real traffic."""

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "state.json"
_lock = threading.RLock()

DEFAULT_PROFILE = {
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
}

DEFAULT_STATE = {
    "profiles": {},           # travel profile per user, keyed by user_id
    "trips": [],
    "watches": [],
    "alerts": [],
    "holds": [],
    "documents": [],          # per traveler: each member gets a checklist for their own passport
    "destinations": {},  # cities the planning agent added, keyed by destination_id
    "users": [],
    "refresh_tokens": [],
    "memberships": [],        # {id, trip_id, user_id, role, invited_by_user_id, joined_at, display_name, avatar_url}
    "invite_tokens": [],      # {id, token, trip_id, inviter_user_id, phone_number, role, created_at, expires_at, used}
    "itinerary_events": [],   # {id, trip_id, at, action, item_id, day_date, author_user_id, author_name, summary}
    "push_tokens": [],        # {user_id, token, platform, updated_at}
    "friendships": [],        # {id, requester_id, addressee_id, status: "pending"|"accepted", created_at, responded_at}
    "posts": [],              # {id, trip_id, author_user_id, caption, created_at}; visibility follows the trip's privacy
    "photos": [],             # {id, trip_id, day_date, uploader_user_id, filename, content_type, caption, width, height, created_at}
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
    # Migration: the single shared profile becomes each existing user's own profile
    if "profile" in state and state.get("users"):
        legacy = state.pop("profile")
        for u in state["users"]:
            state["profiles"].setdefault(u["id"], json.loads(json.dumps(legacy)))
    for profile in state["profiles"].values():
        for key, value in DEFAULT_PROFILE.items():
            profile.setdefault(key, json.loads(json.dumps(value)))
    # Migration: checklist items from before per-user documents belong to the trip's owner
    owners = {t["id"]: t.get("owner_user_id") for t in state["trips"]}
    for doc in state["documents"]:
        if not doc.get("user_id") and owners.get(doc["trip_id"]):
            doc["user_id"] = owners[doc["trip_id"]]
    # Migration: trips from before social sharing are visible to travelers' friends
    for trip in state["trips"]:
        trip.setdefault("privacy", "friends")
    # Migration: assign owner for trips missing owner_user_id
    users = state.get("users", [])
    for trip in state["trips"]:
        if not trip.get("owner_user_id"):
            if len(users) == 1:
                uid = users[0]["id"]
                trip["owner_user_id"] = uid
                already_member = any(
                    m["trip_id"] == trip["id"] and m["user_id"] == uid
                    for m in state.get("memberships", [])
                )
                if not already_member:
                    state["memberships"].append({
                        "id": new_id("mem"),
                        "trip_id": trip["id"],
                        "user_id": uid,
                        "role": "owner",
                        "invited_by_user_id": None,
                        "joined_at": now_iso(),
                        "display_name": users[0].get("display_name", ""),
                        "avatar_url": users[0].get("avatar_url"),
                    })
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


def profile_for(state: dict, user_id: str) -> dict:
    """This user's travel profile, created with defaults on first use."""
    return state["profiles"].setdefault(user_id, json.loads(json.dumps(DEFAULT_PROFILE)))


def find_memberships(state, trip_id):
    return [m for m in state.get("memberships", []) if m["trip_id"] == trip_id]


def user_role(state, trip_id, user_id):
    for m in state.get("memberships", []):
        if m["trip_id"] == trip_id and m["user_id"] == user_id:
            return m["role"]
    return None
