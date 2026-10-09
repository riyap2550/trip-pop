"""Shared test setup: a throwaway JSON store per test, stubbed agent calls, and seed helpers."""

import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Set before importing main, so auth and the Anthropic client don't depend on backend/.env
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("TRIPPOP_API_KEY", "test")

from fastapi.testclient import TestClient  # noqa: E402

import agent  # noqa: E402
import main  # noqa: E402
import store  # noqa: E402
import watcher  # noqa: E402


@pytest.fixture(autouse=True)
def tmp_store(tmp_path, monkeypatch):
    """Point the store at a temp file so tests never touch backend/data/state.json."""
    monkeypatch.setattr(store, "DATA_FILE", tmp_path / "state.json")
    monkeypatch.setattr(main, "_last_manual_run", 0.0)
    main.jobs.clear()

    def fake_job(trip_id, *_args):
        return {"trip_id": trip_id, "summary": "ok"}

    monkeypatch.setattr(agent, "check_documents", fake_job)
    monkeypatch.setattr(agent, "process_feedback", fake_job)
    monkeypatch.setattr(agent, "plan_trip", lambda *_args: {"trip_id": "trip_fake", "summary": "ok"})
    monkeypatch.setattr(watcher, "tick", lambda: {"alerts_created": 0, "checked_at": store.now_iso()})
    yield tmp_path
    main.jobs.clear()


@pytest.fixture
def client():
    # No `with`: entering the client would run the lifespan and start the watcher loop.
    return TestClient(main.app)


def register(client, email: str, name: str = "") -> tuple[dict, str]:
    res = client.post("/auth/register", json={"email": email, "password": "pw-123456", "display_name": name})
    assert res.status_code == 200, res.text
    body = res.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["id"]


def add_member(trip_id: str, uid: str, role: str) -> None:
    with store.transaction() as state:
        state["memberships"].append({
            "id": store.new_id("mem"), "trip_id": trip_id, "user_id": uid, "role": role,
            "invited_by_user_id": None, "joined_at": store.now_iso(), "display_name": "", "avatar_url": None,
        })


def seed_trip(owner_id: str, privacy: str = "friends", status: str = "planned",
              days: tuple[str, ...] = ("2027-01-12", "2027-01-13")) -> str:
    trip_id = store.new_id("trip")
    with store.transaction() as state:
        state["trips"].append({
            "id": trip_id, "title": "Test trip", "goal": "somewhere warm", "destination": "Lisbon",
            "country": "Portugal", "origin": "JFK", "start_date": days[0], "end_date": days[-1],
            "travelers": 1, "hotel_style": "mid", "budget_usd": 2000, "summary": "A test trip.",
            "why_it_fits": "", "status": status, "privacy": privacy, "owner_user_id": owner_id,
            "costs": {"flights": 0, "hotel": 0, "food": 0, "activities": 0, "total": 0},
            "booking_links": {"flight": None, "hotel": None},
            "days": [{"date": d, "theme": "", "items": []} for d in days],
            "changes": [], "feedback": None, "chat": [],
        })
    add_member(trip_id, owner_id, "owner")
    return trip_id


def seed_watch(trip_id: str) -> str:
    watch_id = store.new_id("watch")
    with store.transaction() as state:
        state["watches"].append({
            "id": watch_id, "trip_id": trip_id, "kind": "flight", "label": "Flight", "target_price": 300,
            "price_unit": "per person", "active": True, "history": [{"t": store.now_iso(), "price": 400}],
            "booking_url": "https://example.com", "last_alert_price": None,
        })
    return watch_id


def seed_hold(trip_id: str) -> str:
    hold_id = store.new_id("hold")
    with store.transaction() as state:
        state["holds"].insert(0, {
            "id": hold_id, "kind": "flight", "trip_id": trip_id, "title": "Flight hold", "details": "",
            "price": 400, "status": "pending_approval", "created_at": store.now_iso(),
            "expires_at": "2099-01-01T00:00:00+00:00", "booking_url": "https://example.com",
        })
    return hold_id


def seed_alert(trip_id: str) -> str:
    alert_id = store.new_id("alert")
    with store.transaction() as state:
        state["alerts"].insert(0, {
            "id": alert_id, "watch_id": None, "trip_id": trip_id, "hold_id": None, "title": "Price drop",
            "body": "", "created_at": store.now_iso(), "read": False,
        })
    return alert_id


def make_friends(a_id: str, b_id: str) -> None:
    with store.transaction() as state:
        state["friendships"].append({
            "id": store.new_id("fr"), "requester_id": a_id, "addressee_id": b_id, "status": "accepted",
            "created_at": store.now_iso(), "responded_at": store.now_iso(),
        })
