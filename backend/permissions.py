"""Who can do what: trip roles for members, and privacy rules for everyone else."""

from fastapi import HTTPException

import store

ROLE_ORDER = {"viewer": 0, "editor": 1, "owner": 2}
PRIVACY_LEVELS = ("private", "friends", "public")


def require_member(state, trip_id, user_id, min_role="viewer"):
    role = store.user_role(state, trip_id, user_id)
    if role is None or ROLE_ORDER.get(role, -1) < ROLE_ORDER[min_role]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return role


def friend_ids(state: dict, uid: str) -> set[str]:
    """Accepted friendships only; pending requests don't grant anything."""
    out = set()
    for f in state["friendships"]:
        if f["status"] != "accepted":
            continue
        if f["requester_id"] == uid:
            out.add(f["addressee_id"])
        elif f["addressee_id"] == uid:
            out.add(f["requester_id"])
    return out


def are_friends(state: dict, a: str, b: str) -> bool:
    return b in friend_ids(state, a)


def member_ids(state: dict, trip_id: str) -> set[str]:
    return {m["user_id"] for m in store.find_memberships(state, trip_id)}


def can_view_trip(state: dict, trip: dict, uid: str) -> bool:
    members = member_ids(state, trip["id"])
    if uid in members:
        return True
    privacy = trip.get("privacy", "friends")
    if privacy == "public":
        return True
    if privacy == "friends":
        # Friends of any traveler: group trips belong to everyone on them
        return bool(friend_ids(state, uid) & members)
    return False
