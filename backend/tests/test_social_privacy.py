"""Phase 2: friends, privacy, the feed and trip photos. Non-members only ever get the shared view,
which leaves out money, documents, chat and anything personal."""

import json

import pytest

import social
import store
from conftest import add_member, make_friends, register, seed_hold, seed_trip

JPEG = b"\xff\xd8\xff" + b"0" * 100


def test_migration_defaults_privacy_to_friends(client):
    _, a_id = register(client, "a@example.com")
    trip_id = seed_trip(a_id)
    raw = json.loads(store.DATA_FILE.read_text())
    del raw["trips"][0]["privacy"]
    store.DATA_FILE.write_text(json.dumps(raw))
    assert store.find(store.read()["trips"], trip_id)["privacy"] == "friends"


# --- Friends -------------------------------------------------------------------------------

def test_friend_request_flow(client):
    a, a_id = register(client, "a@example.com", "Ana")
    b, b_id = register(client, "b@example.com", "Ben")

    sent = client.post("/social/friends/requests", json={"user_id": b_id}, headers=a)
    assert sent.status_code == 200
    assert sent.json()["friendship"] == "outgoing"
    incoming = client.get("/social/friends", headers=b).json()["incoming"]
    assert [r["user"]["id"] for r in incoming] == [a_id]
    assert client.get("/social/friends", headers=a).json()["outgoing"][0]["user"]["id"] == b_id

    request_id = incoming[0]["id"]
    assert client.post(f"/social/friends/requests/{request_id}/accept", headers=a).status_code == 403
    accepted = client.post(f"/social/friends/requests/{request_id}/accept", headers=b)
    assert accepted.status_code == 200
    assert accepted.json()["friendship"] == "friends"
    assert [f["id"] for f in client.get("/social/friends", headers=a).json()["friends"]] == [b_id]
    assert client.post("/social/friends/requests", json={"user_id": b_id}, headers=a).status_code == 409

    assert client.delete(f"/social/friends/{b_id}", headers=a).status_code == 200
    assert client.get("/social/friends", headers=b).json()["friends"] == []
    assert client.delete(f"/social/friends/{b_id}", headers=a).status_code == 404


def test_decline_and_cancel_delete_the_request(client):
    a, _ = register(client, "a@example.com")
    b, b_id = register(client, "b@example.com")

    client.post("/social/friends/requests", json={"user_id": b_id}, headers=a)
    request_id = client.get("/social/friends", headers=b).json()["incoming"][0]["id"]
    assert client.post(f"/social/friends/requests/{request_id}/decline", headers=b).status_code == 200
    assert store.read()["friendships"] == []

    # Declined requests can be sent again, then cancelled by the sender only
    client.post("/social/friends/requests", json={"user_id": b_id}, headers=a)
    request_id = client.get("/social/friends", headers=a).json()["outgoing"][0]["id"]
    assert client.delete(f"/social/friends/requests/{request_id}", headers=b).status_code == 403
    assert client.delete(f"/social/friends/requests/{request_id}", headers=a).status_code == 200
    assert store.read()["friendships"] == []


def test_friend_request_edge_cases(client):
    a, a_id = register(client, "a@example.com")
    b, b_id = register(client, "b@example.com")
    assert client.post("/social/friends/requests", json={"user_id": a_id}, headers=a).status_code == 400
    assert client.post("/social/friends/requests", json={"user_id": "user_nobody"}, headers=a).status_code == 404
    assert client.post("/social/friends/requests", json={"user_id": b_id}, headers=a).status_code == 200
    assert client.post("/social/friends/requests", json={"user_id": b_id}, headers=a).status_code == 409

    # Asking someone who already asked you accepts their request
    reverse = client.post("/social/friends/requests", json={"user_id": a_id}, headers=b)
    assert reverse.status_code == 200
    assert reverse.json()["friendship"] == "friends"
    assert len(store.read()["friendships"]) == 1


def test_search_by_name_or_exact_email_never_returns_email(client):
    a, _ = register(client, "ana@example.com", "Ana Lima")
    _, ben_id = register(client, "ben@example.com", "Ben Okafor")
    _, bea_id = register(client, "bea@example.com", "Bea Okafor")

    by_name = client.get("/social/users/search", params={"q": "okaf"}, headers=a)
    assert by_name.status_code == 200
    assert {u["id"] for u in by_name.json()} == {ben_id, bea_id}
    assert all("email" not in u for u in by_name.json())

    by_email = client.get("/social/users/search", params={"q": "BEN@example.com"}, headers=a).json()
    assert [u["id"] for u in by_email] == [ben_id]
    assert client.get("/social/users/search", params={"q": "example.com"}, headers=a).json() == []

    assert client.get("/social/users/search", params={"q": "ana"}, headers=a).json() == []
    assert client.get("/social/users/search", params={"q": "a"}, headers=a).status_code == 400


# --- Visibility ----------------------------------------------------------------------------

@pytest.fixture
def group_trip(client):
    """A trip owned by O with E as an editor. F is a friend of E (not of O); S is a stranger."""
    owner, owner_id = register(client, "owner@example.com", "Olu")
    editor, editor_id = register(client, "editor@example.com", "Eve")
    friend, friend_id = register(client, "friend@example.com", "Fay")
    stranger, _ = register(client, "stranger@example.com", "Sam")
    trip_id = seed_trip(owner_id)
    add_member(trip_id, editor_id, "editor")
    make_friends(editor_id, friend_id)
    return trip_id, {"owner": owner, "editor": editor, "friend": friend, "stranger": stranger}


def _set_privacy(trip_id: str, privacy: str) -> None:
    with store.transaction() as state:
        store.find(state["trips"], trip_id)["privacy"] = privacy


@pytest.mark.parametrize(("privacy", "viewer", "expected"), [
    ("private", "editor", 200), ("private", "friend", 404), ("private", "stranger", 404),
    ("friends", "editor", 200), ("friends", "friend", 200), ("friends", "stranger", 404),
    ("public", "editor", 200), ("public", "friend", 200), ("public", "stranger", 200),
])
def test_shared_trip_visibility(client, group_trip, privacy, viewer, expected):
    trip_id, users = group_trip
    _set_privacy(trip_id, privacy)
    assert client.get(f"/social/trips/{trip_id}", headers=users[viewer]).status_code == expected


def test_full_trip_still_needs_membership(client, group_trip):
    trip_id, users = group_trip
    _set_privacy(trip_id, "public")
    assert client.get(f"/trips/{trip_id}", headers=users["friend"]).status_code == 403
    assert client.get(f"/trips/{trip_id}", headers=users["stranger"]).status_code == 403


def test_shared_trip_leaves_out_private_fields(client, group_trip):
    trip_id, users = group_trip
    seed_hold(trip_id)
    with store.transaction() as state:
        trip = store.find(state["trips"], trip_id)
        trip["days"][0]["items"].append({
            "id": "item_1", "time": "09:00", "title": "Breakfast", "category": "meal", "place_name": "Café",
            "est_cost_usd": 20, "notes": "Confirmation ABC123", "booking_url": "https://example.com",
        })
        trip["feedback"] = {"rating": 5, "what_worked": "secret", "what_didnt": "", "agent_summary": ""}
        state["documents"].append({"id": "doc_1", "trip_id": trip_id, "user_id": "x", "title": "Visa"})

    shared = client.get(f"/social/trips/{trip_id}", headers=users["friend"]).json()
    for key in ("costs", "budget_usd", "booking_links", "documents", "holds", "chat", "goal", "origin",
                "why_it_fits", "changes", "feedback", "food_estimate"):
        assert key not in shared
    item = shared["days"][0]["items"][0]
    assert item == {"id": "item_1", "time": "09:00", "title": "Breakfast", "category": "meal", "place_name": "Café"}
    assert shared["rating"] == 5
    assert all(set(m) == {"user_id", "display_name", "avatar_url"} for m in shared["members"])


def test_only_the_owner_changes_privacy(client, group_trip):
    trip_id, users = group_trip
    assert client.patch(f"/trips/{trip_id}/privacy", json={"privacy": "public"}, headers=users["editor"]).status_code == 403
    assert client.patch(f"/trips/{trip_id}/privacy", json={"privacy": "secret"}, headers=users["owner"]).status_code == 400
    res = client.patch(f"/trips/{trip_id}/privacy", json={"privacy": "public"}, headers=users["owner"])
    assert res.status_code == 200
    assert res.json()["privacy"] == "public"


def test_stranger_profile_lists_only_public_trips(client):
    a, a_id = register(client, "a@example.com", "Ana")
    stranger, _ = register(client, "s@example.com")
    public_trip = seed_trip(a_id, privacy="public")
    seed_trip(a_id, privacy="friends")
    seed_trip(a_id, privacy="private")

    theirs = client.get(f"/social/profile/{a_id}", headers=stranger).json()
    assert [t["id"] for t in theirs["trips"]] == [public_trip]
    assert theirs["stats"]["trips"] == 1
    assert theirs["is_me"] is False

    mine = client.get(f"/social/profile/{a_id}", headers=a).json()
    assert len(mine["trips"]) == 3
    assert mine["is_me"] is True


# --- Posts and feed ------------------------------------------------------------------------

def test_feed_shows_my_posts_and_friends_posts_newest_first(client):
    a, a_id = register(client, "a@example.com")
    b, b_id = register(client, "b@example.com")
    stranger, stranger_id = register(client, "s@example.com")
    make_friends(a_id, b_id)
    trip_a, trip_b = seed_trip(a_id), seed_trip(b_id)
    public_trip = seed_trip(stranger_id, privacy="public")

    mine = client.post(f"/trips/{trip_a}/posts", json={"caption": "mine"}, headers=a).json()
    theirs = client.post(f"/trips/{trip_b}/posts", json={"caption": "theirs"}, headers=b).json()
    assert client.post(f"/trips/{public_trip}/posts", json={"caption": "public"}, headers=stranger).status_code == 200

    feed = client.get("/social/feed", headers=a).json()
    assert [p["id"] for p in feed] == [theirs["id"], mine["id"]]
    assert "costs" not in feed[0]["trip"]
    assert feed[0]["can_delete"] is False and feed[1]["can_delete"] is True

    older = client.get("/social/feed", params={"before": feed[0]["created_at"]}, headers=a).json()
    assert [p["id"] for p in older] == [mine["id"]]

    # Posts follow the trip's privacy: going private hides old posts from friends
    client.patch(f"/trips/{trip_b}/privacy", json={"privacy": "private"}, headers=b)
    assert [p["id"] for p in client.get("/social/feed", headers=a).json()] == [mine["id"]]


def test_posting_rules(client, group_trip):
    trip_id, users = group_trip
    assert client.post(f"/trips/{trip_id}/posts", json={"caption": "x"}, headers=users["stranger"]).status_code == 403
    assert client.post(f"/trips/{trip_id}/posts", json={"caption": "x", "privacy": "public"},
                       headers=users["editor"]).status_code == 403
    assert client.post(f"/trips/{trip_id}/posts", json={"caption": "x" * 501}, headers=users["owner"]).status_code == 400

    post = client.post(f"/trips/{trip_id}/posts", json={"caption": "x", "privacy": "public"}, headers=users["owner"])
    assert post.status_code == 200
    assert post.json()["trip"]["privacy"] == "public"

    _set_privacy(trip_id, "private")
    res = client.post(f"/trips/{trip_id}/posts", json={"caption": "x"}, headers=users["owner"])
    assert res.status_code == 400
    assert res.json()["detail"] == "Private trips can't be posted."

    # The author or the owner can delete; other members can't
    _set_privacy(trip_id, "friends")
    owner_post = client.post(f"/trips/{trip_id}/posts", json={"caption": "y"}, headers=users["owner"]).json()
    editor_post = client.post(f"/trips/{trip_id}/posts", json={"caption": "z"}, headers=users["editor"]).json()
    assert client.delete(f"/posts/{owner_post['id']}", headers=users["editor"]).status_code == 403
    assert client.delete(f"/posts/{editor_post['id']}", headers=users["editor"]).status_code == 200
    assert client.delete(f"/posts/{owner_post['id']}", headers=users["owner"]).status_code == 200


# --- Photos --------------------------------------------------------------------------------

def _upload(client, trip_id, headers, data=JPEG, day="2027-01-12", name="x.jpg"):
    return client.post(f"/trips/{trip_id}/photos", headers=headers,
                       files={"file": (name, data, "image/jpeg")}, data={"day_date": day, "caption": "hi"})


def test_photo_upload_rules(client, group_trip, tmp_store):
    trip_id, users = group_trip
    viewer, viewer_id = register(client, "viewer@example.com")
    add_member(trip_id, viewer_id, "viewer")

    res = _upload(client, trip_id, users["editor"])
    assert res.status_code == 200, res.text
    photo = res.json()
    assert photo["day_date"] == "2027-01-12" and photo["can_delete"] is True
    files = list((tmp_store / "photos" / trip_id).iterdir())
    assert [f.name for f in files] == [f"{photo['id']}.jpg"]

    assert _upload(client, trip_id, viewer).status_code == 403
    assert _upload(client, trip_id, users["editor"], data=b"just some text").status_code == 415
    assert _upload(client, trip_id, users["editor"], day="2030-01-01").status_code == 400
    too_big = b"\xff\xd8\xff" + b"0" * social.MAX_PHOTO_BYTES
    assert _upload(client, trip_id, users["editor"], data=too_big).status_code == 413


def test_photo_files_follow_trip_visibility(client, group_trip):
    trip_id, users = group_trip
    photo = _upload(client, trip_id, users["editor"]).json()
    res = client.get(f"/photos/{photo['id']}/file", headers=users["friend"])
    assert res.status_code == 200
    assert res.content == JPEG
    assert res.headers["content-type"] == "image/jpeg"
    assert client.get(f"/photos/{photo['id']}/file", headers=users["stranger"]).status_code == 404
    assert client.get(f"/photos/{photo['id']}", headers=users["stranger"]).status_code == 404
    assert client.get(f"/trips/{trip_id}/photos", headers=users["friend"]).json()[0]["can_delete"] is False


def test_photo_delete_rules(client, group_trip, tmp_store):
    trip_id, users = group_trip
    other_editor, other_id = register(client, "editor2@example.com")
    add_member(trip_id, other_id, "editor")

    first = _upload(client, trip_id, users["editor"]).json()
    assert client.delete(f"/photos/{first['id']}", headers=other_editor).status_code == 403
    assert client.delete(f"/photos/{first['id']}", headers=users["editor"]).status_code == 200
    assert not (tmp_store / "photos" / trip_id / f"{first['id']}.jpg").exists()

    second = _upload(client, trip_id, users["editor"]).json()
    assert client.delete(f"/photos/{second['id']}", headers=users["owner"]).status_code == 200
    assert store.read()["photos"] == []


def test_deleting_a_trip_removes_its_photos_and_posts(client, group_trip, tmp_store):
    trip_id, users = group_trip
    _upload(client, trip_id, users["editor"])
    client.post(f"/trips/{trip_id}/posts", json={"caption": "x"}, headers=users["owner"])
    assert client.delete(f"/trips/{trip_id}", headers=users["owner"]).status_code == 200
    assert not (tmp_store / "photos" / trip_id).exists()
    state = store.read()
    assert state["photos"] == [] and state["posts"] == []
