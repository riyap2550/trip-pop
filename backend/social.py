"""Social: friends, the feed, trip privacy, and per-day trip photos.

Non-members only ever see trips through the helpers here, which copy over an explicit allowlist of
fields. Money, documents, chat, the planning prompt, notes and member details never leave this module."""

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

import store
from auth import get_current_user
from permissions import PRIVACY_LEVELS, can_view_trip, friend_ids, require_member

router = APIRouter()

MAX_CAPTION = 500
MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_PHOTOS_PER_TRIP = 300
SEARCH_LIMIT = 20


def photos_dir() -> Path:
    # Computed on each call so tests that move DATA_FILE also move the photos
    return store.DATA_FILE.parent / "photos"


def _now() -> str:
    # Microseconds keep the feed's ordering and `before` paging stable for posts made in the same second
    return datetime.now(timezone.utc).isoformat()


# --- Output shapes ---------------------------------------------------------------------------

def _user(state: dict, uid: str) -> dict | None:
    return next((u for u in state["users"] if u["id"] == uid), None)


def _name(state: dict, uid: str) -> str:
    user = _user(state, uid)
    return (user or {}).get("display_name") or "Traveler"


def _friendship(state: dict, a: str, b: str) -> dict | None:
    return next((f for f in state["friendships"]
                 if {f["requester_id"], f["addressee_id"]} == {a, b}), None)


def _friendship_status(state: dict, viewer_id: str, other_id: str) -> tuple[str, str | None]:
    f = _friendship(state, viewer_id, other_id)
    if not f:
        return "none", None
    if f["status"] == "accepted":
        return "friends", None
    return ("outgoing" if f["requester_id"] == viewer_id else "incoming"), f["id"]


def _user_card(state: dict, viewer_id: str, uid: str) -> dict:
    """Never includes email: search can find people by it, but nothing ever shows it."""
    friendship, request_id = _friendship_status(state, viewer_id, uid)
    return {"id": uid, "display_name": _name(state, uid), "friendship": friendship, "request_id": request_id}


def _is_trip_owner(state: dict, trip_id: str, uid: str) -> bool:
    return store.user_role(state, trip_id, uid) == "owner"


def _trip_photos(state: dict, trip_id: str) -> list[dict]:
    return sorted((p for p in state["photos"] if p["trip_id"] == trip_id),
                  key=lambda p: (p["day_date"], p["created_at"]))


def _photo_out(state: dict, photo: dict, viewer_id: str) -> dict:
    return {
        "id": photo["id"],
        "trip_id": photo["trip_id"],
        "day_date": photo["day_date"],
        "caption": photo.get("caption", ""),
        "created_at": photo["created_at"],
        "width": photo.get("width"),
        "height": photo.get("height"),
        "uploader": {"id": photo["uploader_user_id"], "display_name": _name(state, photo["uploader_user_id"])},
        "can_delete": viewer_id == photo["uploader_user_id"] or _is_trip_owner(state, photo["trip_id"], viewer_id),
    }


def _trip_summary(state: dict, trip: dict, viewer_id: str) -> dict:
    members = store.find_memberships(state, trip["id"])
    photos = _trip_photos(state, trip["id"])
    owner_id = trip.get("owner_user_id") or ""
    return {
        "id": trip["id"],
        "title": trip["title"],
        "destination": trip.get("destination", ""),
        "country": trip.get("country", ""),
        "start_date": trip["start_date"],
        "end_date": trip["end_date"],
        "status": trip["status"],
        "privacy": trip.get("privacy", "friends"),
        "rating": (trip.get("feedback") or {}).get("rating"),  # the stars only, never the written feedback
        "owner": {"id": owner_id, "display_name": _name(state, owner_id)},
        "members_count": len(members),
        "photos_count": len(photos),
        "cover_photo_id": photos[0]["id"] if photos else None,
        "viewer_is_member": any(m["user_id"] == viewer_id for m in members),
    }


def _shared_trip(state: dict, trip: dict, viewer_id: str) -> dict:
    return {
        **_trip_summary(state, trip, viewer_id),
        "summary": trip.get("summary", ""),
        "days": [{"date": d["date"], "theme": d.get("theme", ""),
                  "items": [{"id": i["id"], "time": i.get("time", ""), "title": i["title"],
                             "category": i.get("category", "activity"), "place_name": i.get("place_name")}
                            for i in d.get("items", [])]}
                 for d in trip.get("days", [])],
        "members": [{"user_id": m["user_id"], "display_name": _name(state, m["user_id"])}
                    for m in store.find_memberships(state, trip["id"])],
        "photos": [_photo_out(state, p, viewer_id) for p in _trip_photos(state, trip["id"])],
    }


def _post_out(state: dict, post: dict, trip: dict, viewer_id: str) -> dict:
    return {
        "id": post["id"],
        "caption": post.get("caption", ""),
        "created_at": post["created_at"],
        "author": {"id": post["author_user_id"], "display_name": _name(state, post["author_user_id"])},
        "trip": _trip_summary(state, trip, viewer_id),
        "photos": [_photo_out(state, p, viewer_id) for p in _trip_photos(state, trip["id"])[:4]],
        "can_delete": viewer_id == post["author_user_id"] or _is_trip_owner(state, trip["id"], viewer_id),
    }


def _visible_trip_or_404(state: dict, trip_id: str, uid: str) -> dict:
    # 404 rather than 403, so a trip someone can't see doesn't reveal that it exists
    trip = store.find(state["trips"], trip_id)
    if not trip or not can_view_trip(state, trip, uid):
        raise HTTPException(404, "Trip not found")
    return trip


# --- Privacy -------------------------------------------------------------------------------

class PrivacyIn(BaseModel):
    privacy: str


@router.patch("/trips/{trip_id}/privacy")
def update_privacy(trip_id: str, body: PrivacyIn, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        require_member(state, trip_id, current_user["id"], "owner")
        if body.privacy not in PRIVACY_LEVELS:
            raise HTTPException(400, "Privacy must be private, friends or public.")
        trip = store.find(state["trips"], trip_id)
        if not trip:
            raise HTTPException(404, "Trip not found")
        trip["privacy"] = body.privacy
        return trip


# --- People and friends ----------------------------------------------------------------------

@router.get("/social/users/search")
def search_users(q: str = "", current_user: dict = Depends(get_current_user)):
    query = q.strip().lower()
    if len(query) < 2:
        raise HTTPException(400, "Type at least 2 characters.")
    state = store.read()
    uid = current_user["id"]
    # Names match on any part; emails only on the whole address, so search can't be used to list them
    found = [u for u in state["users"]
             if u["id"] != uid and (query in (u.get("display_name") or "").lower() or u["email"].lower() == query)]
    return [_user_card(state, uid, u["id"]) for u in found[:SEARCH_LIMIT]]


@router.get("/social/friends")
def list_friends(current_user: dict = Depends(get_current_user)):
    state = store.read()
    uid = current_user["id"]
    friends, incoming, outgoing = [], [], []
    for f in state["friendships"]:
        if uid not in (f["requester_id"], f["addressee_id"]):
            continue
        other = f["addressee_id"] if f["requester_id"] == uid else f["requester_id"]
        if f["status"] == "accepted":
            friends.append({**_user_card(state, uid, other), "since": f.get("responded_at") or f["created_at"]})
        else:
            request = {"id": f["id"], "user": _user_card(state, uid, other), "created_at": f["created_at"]}
            (outgoing if f["requester_id"] == uid else incoming).append(request)
    friends.sort(key=lambda c: c["display_name"].lower())
    return {"friends": friends, "incoming": incoming, "outgoing": outgoing}


class FriendRequestIn(BaseModel):
    user_id: str


@router.post("/social/friends/requests")
def send_friend_request(body: FriendRequestIn, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    if body.user_id == uid:
        raise HTTPException(400, "You can't add yourself.")
    with store.transaction() as state:
        if not _user(state, body.user_id):
            raise HTTPException(404, "User not found")
        existing = _friendship(state, uid, body.user_id)
        if existing and existing["status"] == "accepted":
            raise HTTPException(409, "You're already friends.")
        if existing and existing["requester_id"] == uid:
            raise HTTPException(409, "You've already sent a request.")
        if existing:
            # They asked first, so asking back means yes
            existing.update(status="accepted", responded_at=_now())
        else:
            state["friendships"].append({
                "id": store.new_id("fr"), "requester_id": uid, "addressee_id": body.user_id,
                "status": "pending", "created_at": _now(), "responded_at": None,
            })
        return _user_card(state, uid, body.user_id)


def _pending_request(state: dict, request_id: str) -> dict:
    f = store.find(state["friendships"], request_id)
    if not f or f["status"] != "pending":
        raise HTTPException(404, "Request not found")
    return f


@router.post("/social/friends/requests/{request_id}/accept")
def accept_friend_request(request_id: str, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        f = _pending_request(state, request_id)
        if f["addressee_id"] != current_user["id"]:
            raise HTTPException(403, "Only the person who was asked can accept.")
        f.update(status="accepted", responded_at=_now())
        return _user_card(state, current_user["id"], f["requester_id"])


@router.post("/social/friends/requests/{request_id}/decline")
def decline_friend_request(request_id: str, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        f = _pending_request(state, request_id)
        if f["addressee_id"] != current_user["id"]:
            raise HTTPException(403, "Only the person who was asked can decline.")
        # Deleted rather than marked, so the other person can ask again later
        state["friendships"].remove(f)
    return {"ok": True}


@router.delete("/social/friends/requests/{request_id}")
def cancel_friend_request(request_id: str, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        f = _pending_request(state, request_id)
        if f["requester_id"] != current_user["id"]:
            raise HTTPException(403, "Only the person who sent a request can cancel it.")
        state["friendships"].remove(f)
    return {"ok": True}


@router.delete("/social/friends/{user_id}")
def remove_friend(user_id: str, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        f = _friendship(state, current_user["id"], user_id)
        if not f or f["status"] != "accepted":
            raise HTTPException(404, "You're not friends.")
        state["friendships"].remove(f)
    return {"ok": True}


# --- Profiles, shared trips, feed ------------------------------------------------------------

@router.get("/social/profile/{user_id}")
def social_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    state = store.read()
    uid = current_user["id"]
    if not _user(state, user_id):
        raise HTTPException(404, "User not found")
    their_trip_ids = {m["trip_id"] for m in state["memberships"] if m["user_id"] == user_id}
    trips = [t for t in state["trips"] if t["id"] in their_trip_ids and can_view_trip(state, t, uid)]
    trips.sort(key=lambda t: t["start_date"], reverse=True)
    summaries = [_trip_summary(state, t, uid) for t in trips]
    friendship, request_id = _friendship_status(state, uid, user_id)
    return {
        "user": {"id": user_id, "display_name": _name(state, user_id)},
        "is_me": user_id == uid,
        "friendship": "none" if user_id == uid else friendship,
        "request_id": request_id,
        "stats": {
            "trips": len(summaries),
            "countries": len({t["country"] for t in summaries if t["country"]}),
            "friends": len(friend_ids(state, user_id)),
            "photos": sum(t["photos_count"] for t in summaries),
        },
        "trips": summaries,
    }


@router.get("/social/trips/{trip_id}")
def shared_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    state = store.read()
    trip = _visible_trip_or_404(state, trip_id, current_user["id"])
    return _shared_trip(state, trip, current_user["id"])


@router.get("/social/feed")
def feed(before: str | None = None, limit: int = 20, current_user: dict = Depends(get_current_user)):
    state = store.read()
    uid = current_user["id"]
    authors = friend_ids(state, uid) | {uid}
    trips = {t["id"]: t for t in state["trips"]}
    out = []
    for post in sorted(state["posts"], key=lambda p: p["created_at"], reverse=True):
        if before and post["created_at"] >= before:
            continue
        trip = trips.get(post["trip_id"])
        # Posts follow the trip's current privacy, so making a trip private hides its old posts too
        if post["author_user_id"] not in authors or not trip or not can_view_trip(state, trip, uid):
            continue
        out.append(_post_out(state, post, trip, uid))
        if len(out) >= max(1, min(limit, 50)):
            break
    return out


class PostIn(BaseModel):
    caption: str = ""
    privacy: str | None = None


@router.post("/trips/{trip_id}/posts")
def create_post(trip_id: str, body: PostIn, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    caption = body.caption.strip()
    if len(caption) > MAX_CAPTION:
        raise HTTPException(400, f"Captions can be up to {MAX_CAPTION} characters.")
    with store.transaction() as state:
        role = require_member(state, trip_id, uid)
        trip = store.find(state["trips"], trip_id)
        if not trip:
            raise HTTPException(404, "Trip not found")
        privacy = trip.get("privacy", "friends")
        if body.privacy is not None and body.privacy != privacy:
            if role != "owner":
                raise HTTPException(403, "Only the trip's owner can change who sees it.")
            if body.privacy not in PRIVACY_LEVELS:
                raise HTTPException(400, "Privacy must be private, friends or public.")
            privacy = body.privacy
        if privacy == "private":
            raise HTTPException(400, "Private trips can't be posted.")
        trip["privacy"] = privacy
        post = {"id": store.new_id("post"), "trip_id": trip_id, "author_user_id": uid,
                "caption": caption, "created_at": _now()}
        state["posts"].append(post)
        return _post_out(state, post, trip, uid)


@router.delete("/posts/{post_id}")
def delete_post(post_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    with store.transaction() as state:
        post = store.find(state["posts"], post_id)
        if not post:
            raise HTTPException(404, "Post not found")
        if post["author_user_id"] != uid and not _is_trip_owner(state, post["trip_id"], uid):
            raise HTTPException(403, "Only the author or the trip's owner can delete this post.")
        state["posts"].remove(post)
    return {"ok": True}


# --- Photos ----------------------------------------------------------------------------------
# Stored on local disk next to state.json. Dev only: no thumbnails, no cloud storage yet.

def _image_type(head: bytes) -> tuple[str, str] | None:
    """Trust the file's magic bytes, never the client's filename or content type."""
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg", "image/jpeg"
    if head.startswith(b"\x89PNG"):
        return "png", "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp", "image/webp"
    return None


# A plain `def`, so FastAPI runs it in a thread and the blocking file I/O doesn't stall the event loop
@router.post("/trips/{trip_id}/photos")
def upload_photo(trip_id: str, file: UploadFile = File(...), day_date: str = Form(...), caption: str = Form(""),
                 width: int | None = Form(None), height: int | None = Form(None),
                 current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    with store.transaction() as state:
        require_member(state, trip_id, uid, "editor")
        trip = store.find(state["trips"], trip_id)
        if not trip:
            raise HTTPException(404, "Trip not found")
        if day_date not in {d["date"] for d in trip.get("days", [])}:
            raise HTTPException(400, "That day isn't part of this trip.")
        if sum(1 for p in state["photos"] if p["trip_id"] == trip_id) >= MAX_PHOTOS_PER_TRIP:
            raise HTTPException(400, f"A trip can have up to {MAX_PHOTOS_PER_TRIP} photos.")
        data = file.file.read(MAX_PHOTO_BYTES + 1)
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(413, "Photos can be up to 10 MB.")
        kind = _image_type(data[:12])
        if not kind:
            raise HTTPException(415, "Only JPEG, PNG and WebP photos are supported.")
        ext, content_type = kind
        photo_id = store.new_id("photo")
        filename = f"{photo_id}.{ext}"
        folder = photos_dir() / trip_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / filename).write_bytes(data)
        photo = {
            "id": photo_id, "trip_id": trip_id, "day_date": day_date, "uploader_user_id": uid,
            "filename": filename, "content_type": content_type, "caption": caption.strip()[:MAX_CAPTION],
            "width": width, "height": height, "created_at": _now(),
        }
        state["photos"].append(photo)
        return _photo_out(state, photo, uid)


@router.get("/trips/{trip_id}/photos")
def list_trip_photos(trip_id: str, current_user: dict = Depends(get_current_user)):
    state = store.read()
    _visible_trip_or_404(state, trip_id, current_user["id"])
    return [_photo_out(state, p, current_user["id"]) for p in _trip_photos(state, trip_id)]


def _visible_photo_or_404(state: dict, photo_id: str, uid: str) -> dict:
    photo = store.find(state["photos"], photo_id)
    trip = store.find(state["trips"], photo["trip_id"]) if photo else None
    if not photo or not trip or not can_view_trip(state, trip, uid):
        raise HTTPException(404, "Photo not found")
    return photo


@router.get("/photos/{photo_id}")
def get_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    state = store.read()
    return _photo_out(state, _visible_photo_or_404(state, photo_id, current_user["id"]), current_user["id"])


@router.get("/photos/{photo_id}/file")
def get_photo_file(photo_id: str, current_user: dict = Depends(get_current_user)):
    photo = _visible_photo_or_404(store.read(), photo_id, current_user["id"])
    path = photos_dir() / photo["trip_id"] / photo["filename"]
    if not path.is_file():
        raise HTTPException(404, "Photo not found")
    return FileResponse(path, media_type=photo["content_type"], headers={"Cache-Control": "private, max-age=86400"})


@router.delete("/photos/{photo_id}")
def delete_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    with store.transaction() as state:
        photo = store.find(state["photos"], photo_id)
        if not photo:
            raise HTTPException(404, "Photo not found")
        if photo["uploader_user_id"] != uid and not _is_trip_owner(state, photo["trip_id"], uid):
            raise HTTPException(403, "Only whoever added this photo or the trip's owner can delete it.")
        state["photos"].remove(photo)
    (photos_dir() / photo["trip_id"] / photo["filename"]).unlink(missing_ok=True)
    return {"ok": True}
