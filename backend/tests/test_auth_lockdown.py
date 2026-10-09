"""Phase 1: every route needs a token except register/login/refresh/health and the invite preview,
and each one only touches the caller's own trips."""

import time

import pytest

import main
import store
from conftest import add_member, register, seed_alert, seed_hold, seed_trip, seed_watch

LOCKED_ROUTES = [
    ("get", "/jobs/job_x", None),
    ("post", "/trips/trip_x/feedback/snooze", None),
    ("get", "/deals", None),
    ("patch", "/watches/watch_x", {"active": False}),
    ("post", "/watcher/run", None),
    ("post", "/holds/hold_x/approve", None),
    ("post", "/holds/hold_x/decline", None),
    ("post", "/alerts/read", None),
    ("post", "/auth/logout", {"refresh_token": "x"}),
]


@pytest.mark.parametrize(("method", "path", "body"), LOCKED_ROUTES)
def test_locked_routes_need_a_token(client, method, path, body):
    res = client.request(method.upper(), path, json=body)
    assert res.status_code == 401


def test_invite_preview_is_public_and_has_no_phone(client):
    owner, owner_id = register(client, "a@example.com", "Ana")
    trip_id = seed_trip(owner_id)
    res = client.post(f"/trips/{trip_id}/invites", json={"role": "viewer", "phone_number": "+15550001111"},
                      headers=owner)
    token = res.json()["token"]
    preview = client.get(f"/invites/{token}")
    assert preview.status_code == 200
    assert preview.json()["trip_title"] == "Test trip"
    assert "phone_number" not in preview.json()


def _wait_for_job(job_id: str) -> None:
    deadline = time.time() + 2
    while main.jobs[job_id]["status"] == "running" and time.time() < deadline:
        time.sleep(0.01)


def test_jobs_are_visible_only_to_whoever_started_them(client):
    a, a_id = register(client, "a@example.com")
    b, _ = register(client, "b@example.com")
    trip_id = seed_trip(a_id)
    job = client.post(f"/trips/{trip_id}/documents/check", headers=a).json()
    _wait_for_job(job["id"])
    assert client.get(f"/jobs/{job['id']}", headers=a).status_code == 200
    assert client.get(f"/jobs/{job['id']}", headers=b).status_code == 404


def test_deals_are_scoped_to_my_trips(client):
    a, a_id = register(client, "a@example.com")
    b, b_id = register(client, "b@example.com")
    c, _ = register(client, "c@example.com")
    trip_a = seed_trip(a_id)
    trip_b = seed_trip(b_id)
    watch_a, hold_a, alert_a = seed_watch(trip_a), seed_hold(trip_a), seed_alert(trip_a)
    watch_b = seed_watch(trip_b)

    mine = client.get("/deals", headers=a).json()
    assert [w["id"] for w in mine["watches"]] == [watch_a]
    assert [h["id"] for h in mine["holds"]] == [hold_a]
    assert [x["id"] for x in mine["alerts"]] == [alert_a]
    assert mine["watches"][0]["my_role"] == "owner"

    theirs = client.get("/deals", headers=b).json()
    assert [w["id"] for w in theirs["watches"]] == [watch_b]
    assert theirs["holds"] == [] and theirs["alerts"] == []

    assert client.get("/deals", headers=c).json() == {"watches": [], "alerts": [], "holds": []}

    # A shared member sees the trip's items, with their own role
    add_member(trip_a, b_id, "viewer")
    shared = client.get("/deals", headers=b).json()
    assert {w["id"] for w in shared["watches"]} == {watch_a, watch_b}
    assert [h["id"] for h in shared["holds"]] == [hold_a]
    assert shared["holds"][0]["my_role"] == "viewer"


@pytest.fixture
def trip_with_roles(client):
    """A trip owned by A, with B as viewer, C as editor, and D as a stranger."""
    _, a_id = register(client, "a@example.com")
    viewer, viewer_id = register(client, "viewer@example.com")
    editor, editor_id = register(client, "editor@example.com")
    stranger, _ = register(client, "stranger@example.com")
    trip_id = seed_trip(a_id)
    add_member(trip_id, viewer_id, "viewer")
    add_member(trip_id, editor_id, "editor")
    return trip_id, {"viewer": viewer, "editor": editor, "stranger": stranger}


def test_watch_updates_need_editor(client, trip_with_roles):
    trip_id, users = trip_with_roles
    watch_id = seed_watch(trip_id)
    assert client.patch(f"/watches/{watch_id}", json={"active": False}, headers=users["stranger"]).status_code == 403
    assert client.patch(f"/watches/{watch_id}", json={"active": False}, headers=users["viewer"]).status_code == 403
    res = client.patch(f"/watches/{watch_id}", json={"active": False}, headers=users["editor"])
    assert res.status_code == 200
    assert res.json()["active"] is False
    assert client.patch("/watches/watch_missing", json={"active": False}, headers=users["editor"]).status_code == 404


def test_hold_decisions_need_editor(client, trip_with_roles):
    trip_id, users = trip_with_roles
    hold_id = seed_hold(trip_id)
    assert client.post(f"/holds/{hold_id}/approve", headers=users["stranger"]).status_code == 403
    assert client.post(f"/holds/{hold_id}/approve", headers=users["viewer"]).status_code == 403
    assert client.post(f"/holds/{hold_id}/decline", headers=users["viewer"]).status_code == 403
    res = client.post(f"/holds/{hold_id}/approve", headers=users["editor"])
    assert res.status_code == 200
    assert res.json()["status"] == "approved"


def test_marking_alerts_read_leaves_other_users_alerts(client):
    a, a_id = register(client, "a@example.com")
    _, b_id = register(client, "b@example.com")
    alert_a = seed_alert(seed_trip(a_id))
    alert_b = seed_alert(seed_trip(b_id))
    assert client.post("/alerts/read", headers=a).status_code == 200
    alerts = {x["id"]: x for x in store.read()["alerts"]}
    assert alerts[alert_a]["read"] is True
    assert alerts[alert_b]["read"] is False


def test_watcher_run_has_a_cooldown(client):
    a, _ = register(client, "a@example.com")
    first = client.post("/watcher/run", headers=a)
    assert first.status_code == 200
    assert first.json()["alerts_created"] == 0
    assert client.post("/watcher/run", headers=a).status_code == 429


def test_snooze_needs_membership(client):
    _, a_id = register(client, "a@example.com")
    b, _ = register(client, "b@example.com")
    trip_id = seed_trip(a_id)
    assert client.post(f"/trips/{trip_id}/feedback/snooze", headers=b).status_code == 403


def test_owner_invites_and_owner_changes_are_rejected(client):
    a, a_id = register(client, "a@example.com")
    trip_id = seed_trip(a_id)
    assert client.post(f"/trips/{trip_id}/invites", json={"role": "owner"}, headers=a).status_code == 400
    assert client.patch(f"/trips/{trip_id}/members/{a_id}", json={"role": "viewer"}, headers=a).status_code == 400
    assert client.delete(f"/trips/{trip_id}/members/{a_id}", headers=a).status_code == 400


def test_deleting_a_trip_removes_its_invites(client):
    a, a_id = register(client, "a@example.com")
    trip_id = seed_trip(a_id)
    client.post(f"/trips/{trip_id}/invites", json={"role": "viewer"}, headers=a)
    assert client.delete(f"/trips/{trip_id}", headers=a).status_code == 200
    assert store.read()["invite_tokens"] == []


def test_logout_cant_revoke_someone_elses_refresh_token(client):
    res = client.post("/auth/register", json={"email": "a@example.com", "password": "pw-123456"})
    a_refresh = res.json()["refresh_token"]
    b, _ = register(client, "b@example.com")
    assert client.post("/auth/logout", json={"refresh_token": a_refresh}, headers=b).status_code == 200
    assert client.post("/auth/refresh", json={"refresh_token": a_refresh}).status_code == 200
