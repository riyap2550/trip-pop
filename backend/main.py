"""TripPop API. Run with: .venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000"""

import asyncio
import logging
import secrets
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import anthropic  # noqa: E402
from fastapi import Depends, FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import agent  # noqa: E402
import store  # noqa: E402
import watcher  # noqa: E402
from auth import (  # noqa: E402
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    verify_password,
)
import push  # noqa: E402

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("api")

ROLE_ORDER = {"viewer": 0, "editor": 1, "owner": 2}


def _require_member(state, trip_id, user_id, min_role="viewer"):
    from store import user_role
    role = user_role(state, trip_id, user_id)
    if role is None or ROLE_ORDER.get(role, -1) < ROLE_ORDER[min_role]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return role


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(watcher.run_forever())
    yield
    task.cancel()


app = FastAPI(title="Travel Agent", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# --- Background jobs -------------------------------------------------------------
# Agent runs take a while, so the app starts a job and polls it for progress.

executor = ThreadPoolExecutor(max_workers=4)
jobs: dict[str, dict] = {}


def start_job(kind: str, fn, *args, then=None) -> dict:
    job = {"id": store.new_id("job"), "kind": kind, "status": "running", "steps": [], "result": None, "error": None}
    jobs[job["id"]] = job

    def on_step(label: str):
        if not job["steps"] or job["steps"][-1] != label:
            job["steps"].append(label)

    def run():
        try:
            job["result"] = fn(*args, on_step)
            job["status"] = "done"
            if then:
                then(job)
        except agent.AgentError as exc:
            job.update(status="error", error=str(exc))
        except anthropic.AuthenticationError:
            job.update(status="error", error="The Anthropic API key in backend/.env is invalid.")
        except anthropic.RateLimitError:
            job.update(status="error", error="The AI service is busy. Try again in a minute.")
        except anthropic.APIConnectionError:
            job.update(status="error", error="Couldn't reach the AI service. Check the server's internet connection.")
        except anthropic.APIStatusError as exc:
            log.exception("agent job %s failed", job["id"])
            job.update(status="error", error=f"AI service error ({exc.status_code}). Try again.")
        except Exception:
            log.exception("agent job %s failed", job["id"])
            job.update(status="error", error="Something went wrong. Check the backend logs.")

    executor.submit(run)
    return job


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    return jobs[job_id]


# --- Auth -------------------------------------------------------------------------------

class RegisterIn(BaseModel):
    email: str
    password: str
    display_name: str = ""


class LoginIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str


def _user_public(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user.get("display_name", ""),
        "avatar_url": user.get("avatar_url"),
    }


def _make_token_record(token: str, user_id: str) -> dict:
    expires_at = (datetime.utcnow() + timedelta(days=30)).isoformat()
    return {"token": token, "user_id": user_id, "expires_at": expires_at, "revoked": False}


@app.post("/auth/register")
def auth_register(body: RegisterIn):
    with store.transaction() as state:
        email_lower = body.email.strip().lower()
        if any(u["email"].lower() == email_lower for u in state["users"]):
            raise HTTPException(400, "An account with that email already exists.")
        uid = "user_" + secrets.token_hex(8)
        user = {
            "id": uid,
            "email": body.email.strip(),
            "display_name": body.display_name.strip(),
            "avatar_url": None,
            "password_hash": hash_password(body.password),
            "created_at": datetime.utcnow().isoformat(),
        }
        state["users"].append(user)
        at = create_access_token(uid)
        rt = create_refresh_token()
        state["refresh_tokens"].append(_make_token_record(rt, uid))
    return {"access_token": at, "refresh_token": rt, "user": _user_public(user)}


@app.post("/auth/login")
def auth_login(body: LoginIn):
    state = store.read()
    email_lower = body.email.strip().lower()
    user = next((u for u in state["users"] if u["email"].lower() == email_lower), None)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password.")
    at = create_access_token(user["id"])
    rt = create_refresh_token()
    with store.transaction() as s:
        s["refresh_tokens"].append(_make_token_record(rt, user["id"]))
    return {"access_token": at, "refresh_token": rt, "user": _user_public(user)}


@app.post("/auth/refresh")
def auth_refresh(body: RefreshIn):
    now = datetime.utcnow()
    with store.transaction() as state:
        record = next((r for r in state["refresh_tokens"] if r["token"] == body.refresh_token), None)
        if not record:
            raise HTTPException(401, "Refresh token not found.")
        if record["revoked"]:
            raise HTTPException(401, "Refresh token has been revoked.")
        if datetime.fromisoformat(record["expires_at"]) < now:
            raise HTTPException(401, "Refresh token has expired.")
        user_id = record["user_id"]
        user = next((u for u in state["users"] if u["id"] == user_id), None)
        if not user:
            raise HTTPException(401, "User not found.")
        record["revoked"] = True
        at = create_access_token(user_id)
        new_rt = create_refresh_token()
        state["refresh_tokens"].append(_make_token_record(new_rt, user_id))
    return {"access_token": at, "refresh_token": new_rt, "user": _user_public(user)}


@app.post("/auth/logout")
def auth_logout(body: LogoutIn, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        for record in state["refresh_tokens"]:
            if record["token"] == body.refresh_token:
                record["revoked"] = True
    return {"ok": True}


@app.get("/auth/me")
def auth_me(current_user: dict = Depends(get_current_user)):
    return _user_public(current_user)


# --- Planning, editing, chat, feedback, documents ---------------------------------------

class PlanIn(BaseModel):
    goal: str


class TripPatch(BaseModel):
    title: str | None = None
    budget_usd: float | None = None
    travelers: int | None = None
    start_date: str | None = None
    end_date: str | None = None


class ItemIn(BaseModel):
    category: str | None = None  # only when adding
    time: str | None = None
    title: str | None = None
    place_name: str | None = None
    est_cost_usd: float | None = None
    notes: str | None = None
    indoor: bool | None = None


class ChatIn(BaseModel):
    message: str
    local_time: str | None = None


class FeedbackIn(BaseModel):
    rating: int
    what_worked: str = ""
    what_didnt: str = ""


@app.post("/plan")
def plan(body: PlanIn, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    author_name = current_user.get("display_name", "")

    def check_docs_after(job):
        # Kick off the document check as soon as the trip exists.
        docs_job = start_job("documents", agent.check_documents, job["result"]["trip_id"])
        job["result"]["documents_job_id"] = docs_job["id"]

    return start_job("plan", agent.plan_trip, body.goal, user_id, author_name, then=check_docs_after)


def _check_docs_if_rescheduled(job):
    """New dates or a new destination change what documents are needed and when, so check them again."""
    if job["result"].get("schedule_changed"):
        docs_job = start_job("documents", agent.check_documents, job["result"]["trip_id"])
        job["result"]["documents_job_id"] = docs_job["id"]


def _edit(fn, *args):
    """Run a trip edit, turning its errors into HTTP responses."""
    try:
        return fn(*args)
    except agent.NotFound as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.patch("/trips/{trip_id}")
def patch_trip(trip_id: str, body: TripPatch, current_user: dict = Depends(get_current_user)):
    """Edit a trip's title, budget, travelers, or dates. Runs as a job because new dates re-price the trip."""
    with store.transaction() as state:
        _require_member(state, trip_id, current_user["id"], min_role="editor")
    trip = _trip_or_404(trip_id)
    changes = _edit(agent.validate_trip_changes, trip, body.model_dump(exclude_none=True))
    return start_job("edit", agent.update_trip, trip_id, changes, then=_check_docs_if_rescheduled)


@app.post("/trips/{trip_id}/days/{day}/items")
def add_item(trip_id: str, day: str, body: ItemIn, current_user: dict = Depends(get_current_user)):
    with store.transaction() as check_state:
        _require_member(check_state, trip_id, current_user["id"], min_role="editor")
    item_title = body.title or "item"
    result = _edit(agent.add_item, trip_id, day, body.model_dump(exclude_none=True))
    with store.transaction() as state:
        # Find the newly-added item (last in day)
        trip_obj = store.find(state["trips"], trip_id)
        day_obj = next((d for d in trip_obj["days"] if d["date"] == day), None) if trip_obj else None
        item_id = day_obj["items"][-1]["id"] if day_obj and day_obj["items"] else None
        event = {
            "id": store.new_id("evt"),
            "trip_id": trip_id,
            "at": datetime.utcnow().isoformat(),
            "action": "add",
            "item_id": item_id,
            "day_date": day,
            "author_user_id": current_user["id"],
            "author_name": current_user.get("display_name", "Someone"),
            "summary": f"Added '{item_title}'"
        }
        state["itinerary_events"].append(event)
        trip_events = [e for e in state["itinerary_events"] if e["trip_id"] == trip_id]
        if len(trip_events) > 500:
            oldest = sorted(trip_events, key=lambda e: e["at"])[0]
            state["itinerary_events"].remove(oldest)
    push.notify_trip_collaborators(
        store.read(), trip_id, current_user["id"],
        "Itinerary updated", f"{current_user.get('display_name', 'Someone')} added '{item_title}'"
    )
    return result


@app.patch("/trips/{trip_id}/days/{day}/items/{item_id}")
def patch_item(trip_id: str, day: str, item_id: str, body: ItemIn, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        _require_member(state, trip_id, current_user["id"], min_role="editor")
    result = _edit(agent.edit_item, trip_id, day, item_id, body.model_dump(exclude_none=True, exclude={"category"}))
    item_title = body.title or item_id
    with store.transaction() as state:
        event = {
            "id": store.new_id("evt"),
            "trip_id": trip_id,
            "at": datetime.utcnow().isoformat(),
            "action": "edit",
            "item_id": item_id,
            "day_date": day,
            "author_user_id": current_user["id"],
            "author_name": current_user.get("display_name", "Someone"),
            "summary": f"Edited '{item_title}'"
        }
        state["itinerary_events"].append(event)
        trip_events = [e for e in state["itinerary_events"] if e["trip_id"] == trip_id]
        if len(trip_events) > 500:
            oldest = sorted(trip_events, key=lambda e: e["at"])[0]
            state["itinerary_events"].remove(oldest)
    push.notify_trip_collaborators(
        store.read(), trip_id, current_user["id"],
        "Itinerary updated", f"{current_user.get('display_name', 'Someone')} edited '{item_title}'"
    )
    return result


@app.delete("/trips/{trip_id}/days/{day}/items/{item_id}")
def remove_item(trip_id: str, day: str, item_id: str, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        _require_member(state, trip_id, current_user["id"], min_role="editor")
        # Find item title before deletion
        trip_obj = store.find(state["trips"], trip_id)
        day_obj = next((d for d in trip_obj["days"] if d["date"] == day), None) if trip_obj else None
        item_obj = next((i for i in day_obj["items"] if i["id"] == item_id), None) if day_obj else None
        item_title = item_obj["title"] if item_obj else item_id
    result = _edit(agent.delete_item, trip_id, day, item_id)
    with store.transaction() as state:
        event = {
            "id": store.new_id("evt"),
            "trip_id": trip_id,
            "at": datetime.utcnow().isoformat(),
            "action": "delete",
            "item_id": item_id,
            "day_date": day,
            "author_user_id": current_user["id"],
            "author_name": current_user.get("display_name", "Someone"),
            "summary": f"Removed '{item_title}'"
        }
        state["itinerary_events"].append(event)
        trip_events = [e for e in state["itinerary_events"] if e["trip_id"] == trip_id]
        if len(trip_events) > 500:
            oldest = sorted(trip_events, key=lambda e: e["at"])[0]
            state["itinerary_events"].remove(oldest)
    push.notify_trip_collaborators(
        store.read(), trip_id, current_user["id"],
        "Itinerary updated", f"{current_user.get('display_name', 'Someone')} removed '{item_title}'"
    )
    return result


@app.post("/trips/{trip_id}/chat")
def chat(trip_id: str, body: ChatIn):
    trip = _trip_or_404(trip_id)
    message = body.message.strip()
    if not message:
        raise HTTPException(400, "Type a message first.")
    if trip["status"] in ("completed", "awaiting_feedback"):
        raise HTTPException(400, "This trip is over, so it can't be changed.")
    agent.log_chat(trip_id, "user", message[:2000])
    return start_job("chat", agent.chat_trip, trip_id, message[:2000], body.local_time, then=_check_docs_if_rescheduled)


@app.post("/trips/{trip_id}/feedback")
def feedback(trip_id: str, body: FeedbackIn):
    _trip_or_404(trip_id)
    return start_job("feedback", agent.process_feedback, trip_id, body.model_dump())


@app.post("/trips/{trip_id}/documents/check")
def check_documents(trip_id: str):
    _trip_or_404(trip_id)
    return start_job("documents", agent.check_documents, trip_id)


# --- Trips ---------------------------------------------------------------------------

def _trip_or_404(trip_id: str) -> dict:
    trip = store.find(store.read()["trips"], trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    return trip


def _read_with_current_statuses() -> dict:
    """Read state with trip statuses brought up to date, so a finished trip shows as done right away
    instead of waiting for the watcher's next run."""
    state = store.read()
    if any(t["status"] in ("planned", "booked", "in_progress") for t in state["trips"]):
        with store.transaction() as fresh:
            if watcher.advance_trip_statuses(fresh):
                state = fresh
    return state


@app.get("/trips")
def list_trips(current_user: dict = Depends(get_current_user)):
    state = _read_with_current_statuses()
    uid = current_user["id"]
    member_trip_ids = {m["trip_id"] for m in state.get("memberships", []) if m["user_id"] == uid}
    return [t for t in state["trips"] if t.get("owner_user_id") == uid or t["id"] in member_trip_ids]


@app.get("/trips/{trip_id}")
def get_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    state = _read_with_current_statuses()
    _require_member(state, trip_id, current_user["id"], min_role="viewer")
    trip = store.find(state["trips"], trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    members = store.find_memberships(state, trip_id)
    role = store.user_role(state, trip_id, current_user["id"])
    return {**trip,
            "documents": [d for d in state["documents"] if d["trip_id"] == trip_id],
            "holds": [h for h in state["holds"] if h.get("trip_id") == trip_id],
            "membership": {"role": role, "members_count": len(members)}}


@app.post("/trips/{trip_id}/end")
def end_trip(trip_id: str):
    """Mark a trip as finished now, so the feedback loop starts (the watcher does this automatically after end_date)."""
    with store.transaction() as state:
        trip = store.find(state["trips"], trip_id)
        if not trip:
            raise HTTPException(404, "Trip not found")
        if trip["status"] != "completed":
            trip["status"] = "awaiting_feedback"
            trip.setdefault("ended_at", store.now_iso())
            trip.pop("feedback_snoozed_until", None)  # ending it on purpose means they're ready to rate it
        return trip


FEEDBACK_SNOOZE_HOURS = 24


@app.post("/trips/{trip_id}/feedback/snooze")
def snooze_feedback(trip_id: str):
    """'Maybe later' on the feedback prompt: don't ask about this trip again for a day."""
    with store.transaction() as state:
        trip = store.find(state["trips"], trip_id)
        if not trip:
            raise HTTPException(404, "Trip not found")
        until = datetime.now(timezone.utc) + timedelta(hours=FEEDBACK_SNOOZE_HOURS)
        trip["feedback_snoozed_until"] = until.isoformat(timespec="seconds")
        return trip


@app.delete("/trips/{trip_id}")
def delete_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        _require_member(state, trip_id, current_user["id"], min_role="owner")
        state["trips"] = [t for t in state["trips"] if t["id"] != trip_id]
        for key in ("watches", "alerts", "holds", "documents"):
            state[key] = [x for x in state[key] if x.get("trip_id") != trip_id]
        state["memberships"] = [m for m in state["memberships"] if m["trip_id"] != trip_id]
        state["itinerary_events"] = [e for e in state["itinerary_events"] if e["trip_id"] != trip_id]
    return {"ok": True}


# --- Group trips: members, invites, events -----------------------------------------------

class InviteIn(BaseModel):
    phone_number: str
    role: str = "viewer"


class MemberRolePatch(BaseModel):
    role: str


class PushTokenIn(BaseModel):
    token: str
    platform: str


@app.get("/trips/{trip_id}/members")
def list_members(trip_id: str, current_user: dict = Depends(get_current_user)):
    state = store.read()
    _require_member(state, trip_id, current_user["id"], min_role="viewer")
    return store.find_memberships(state, trip_id)


@app.post("/trips/{trip_id}/invites")
def create_invite(trip_id: str, body: InviteIn, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        _require_member(state, trip_id, current_user["id"], min_role="owner")
        trip = store.find(state["trips"], trip_id)
        if not trip:
            raise HTTPException(404, "Trip not found")
        token = secrets.token_hex(16)
        url = f"trippop://invite/{token}"
        invite = {
            "id": store.new_id("inv"),
            "token": token,
            "trip_id": trip_id,
            "inviter_user_id": current_user["id"],
            "phone_number": body.phone_number,
            "role": body.role,
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(hours=48)).isoformat(),
            "used": False,
        }
        state["invite_tokens"].append(invite)
    print(f"[INVITE SMS STUB] Send to {body.phone_number}: {url}")
    return {"url": url, "token": token}


@app.get("/invites/{token}")
def get_invite(token: str):
    state = store.read()
    invite = next((i for i in state.get("invite_tokens", []) if i["token"] == token), None)
    if not invite:
        raise HTTPException(404, "Invite not found")
    trip = store.find(state["trips"], invite["trip_id"])
    inviter = next((u for u in state["users"] if u["id"] == invite["inviter_user_id"]), None)
    expired = invite.get("used", False) or datetime.utcnow().isoformat() > invite["expires_at"]
    return {
        "trip_id": invite["trip_id"],
        "trip_title": trip["title"] if trip else "",
        "inviter_name": inviter.get("display_name", "") if inviter else "",
        "role": invite["role"],
        "expired": expired,
    }


@app.post("/invites/{token}/accept")
def accept_invite(token: str, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        invite = next((i for i in state.get("invite_tokens", []) if i["token"] == token), None)
        if not invite:
            raise HTTPException(404, "Invite not found")
        if invite.get("used"):
            raise HTTPException(400, "Invite has already been used")
        if datetime.utcnow().isoformat() > invite["expires_at"]:
            raise HTTPException(400, "Invite has expired")
        trip_id = invite["trip_id"]
        already = store.user_role(state, trip_id, current_user["id"])
        if not already:
            state["memberships"].append({
                "id": store.new_id("mem"),
                "trip_id": trip_id,
                "user_id": current_user["id"],
                "role": invite["role"],
                "invited_by_user_id": invite["inviter_user_id"],
                "joined_at": datetime.utcnow().isoformat(),
                "display_name": current_user.get("display_name", ""),
                "avatar_url": current_user.get("avatar_url"),
            })
        invite["used"] = True
    return {"trip_id": trip_id}


@app.delete("/trips/{trip_id}/members/{user_id}")
def remove_member(trip_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        _require_member(state, trip_id, current_user["id"], min_role="owner")
        state["memberships"] = [
            m for m in state["memberships"]
            if not (m["trip_id"] == trip_id and m["user_id"] == user_id)
        ]
    return {"ok": True}


@app.patch("/trips/{trip_id}/members/{user_id}")
def update_member_role(trip_id: str, user_id: str, body: MemberRolePatch, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        _require_member(state, trip_id, current_user["id"], min_role="owner")
        member = next(
            (m for m in state["memberships"] if m["trip_id"] == trip_id and m["user_id"] == user_id),
            None
        )
        if not member:
            raise HTTPException(404, "Member not found")
        member["role"] = body.role
    return {"ok": True}


@app.get("/trips/{trip_id}/events")
def get_trip_events(trip_id: str, current_user: dict = Depends(get_current_user)):
    state = store.read()
    _require_member(state, trip_id, current_user["id"], min_role="viewer")
    events = [e for e in state.get("itinerary_events", []) if e["trip_id"] == trip_id]
    events_sorted = sorted(events, key=lambda e: e["at"], reverse=True)
    return events_sorted[:50]


@app.post("/users/push-token")
def register_push_token(body: PushTokenIn, current_user: dict = Depends(get_current_user)):
    with store.transaction() as state:
        existing = next((pt for pt in state.get("push_tokens", []) if pt["user_id"] == current_user["id"]), None)
        if existing:
            existing["token"] = body.token
            existing["platform"] = body.platform
            existing["updated_at"] = datetime.utcnow().isoformat()
        else:
            state["push_tokens"].append({
                "user_id": current_user["id"],
                "token": body.token,
                "platform": body.platform,
                "updated_at": datetime.utcnow().isoformat(),
            })
    return {"ok": True}


# --- Deals: watches, alerts, holds --------------------------------------------------------

@app.get("/deals")
def deals():
    state = store.read()
    trips = {t["id"]: t["title"] for t in state["trips"]}
    watches = [{**w, "trip_title": trips.get(w["trip_id"]), "history": w["history"][-30:]} for w in state["watches"]]
    return {"watches": watches, "alerts": state["alerts"][:30], "holds": state["holds"][:30]}


class WatchPatch(BaseModel):
    target_price: float | None = None
    active: bool | None = None


@app.patch("/watches/{watch_id}")
def update_watch(watch_id: str, body: WatchPatch):
    with store.transaction() as state:
        watch = store.find(state["watches"], watch_id)
        if not watch:
            raise HTTPException(404, "Watch not found")
        if body.target_price is not None:
            watch["target_price"] = body.target_price
            watch["last_alert_price"] = None
        if body.active is not None:
            watch["active"] = body.active
        return watch


@app.post("/watcher/run")
def run_watcher_now():
    return watcher.tick()


def _decide_hold(hold_id: str, approve: bool) -> dict:
    with store.transaction() as state:
        hold = store.find(state["holds"], hold_id)
        if not hold:
            raise HTTPException(404, "Hold not found")
        if hold["status"] != "pending_approval":
            raise HTTPException(409, f"This hold is already {hold['status'].replace('_', ' ')}.")
        hold["status"] = "approved" if approve else "declined"
        hold["decided_at"] = store.now_iso()
        trip = store.find(state["trips"], hold.get("trip_id") or "")
        if approve and trip and hold["kind"] in ("flight", "hotel"):
            trip.setdefault("approved", {})[hold["kind"]] = {"price": hold["price"], "hold_id": hold_id}
            if {"flight", "hotel"} <= set(trip["approved"]) and trip["status"] == "planned":
                trip["status"] = "booked"
        for alert in state["alerts"]:
            if alert.get("hold_id") == hold_id:
                alert["read"] = True
        return hold


@app.post("/holds/{hold_id}/approve")
def approve_hold(hold_id: str):
    return _decide_hold(hold_id, True)


@app.post("/holds/{hold_id}/decline")
def decline_hold(hold_id: str):
    return _decide_hold(hold_id, False)


@app.post("/alerts/read")
def mark_alerts_read():
    with store.transaction() as state:
        for alert in state["alerts"]:
            alert["read"] = True
    return {"ok": True}


# --- Documents -----------------------------------------------------------------------------

@app.get("/documents")
def documents():
    state = store.read()
    trips = {t["id"]: t for t in state["trips"]}
    docs = [{**d, "trip_title": trips[d["trip_id"]]["title"], "trip_start": trips[d["trip_id"]]["start_date"]}
            for d in state["documents"] if d["trip_id"] in trips]
    return sorted(docs, key=lambda d: (d["done"], not d["action_required"], d["deadline"]))


class DocPatch(BaseModel):
    done: bool


@app.patch("/documents/{doc_id}")
def update_document(doc_id: str, body: DocPatch):
    with store.transaction() as state:
        doc = store.find(state["documents"], doc_id)
        if not doc:
            raise HTTPException(404, "Document not found")
        doc["done"] = body.done
        return doc


# --- Profile ---------------------------------------------------------------------------------

class ProfilePatch(BaseModel):
    name: str | None = None
    home_airport: str | None = None
    passport_country: str | None = None
    passport_expiry: str | None = None
    budget_style: str | None = None
    typical_daily_budget: float | None = None
    pace: str | None = None
    interests: list[str] | None = None
    dislikes: list[str] | None = None
    learned_notes: list[str] | None = None


@app.get("/profile")
def get_profile():
    return store.read()["profile"]


@app.patch("/profile")
def update_profile(body: ProfilePatch):
    with store.transaction() as state:
        changes = body.model_dump(exclude_unset=True)
        if "home_airport" in changes and changes["home_airport"]:
            changes["home_airport"] = changes["home_airport"].strip().upper()
        state["profile"].update(changes)
        return state["profile"]


@app.get("/health")
def health():
    return {"ok": True, "model": agent.MODEL, "watch_interval_seconds": watcher.INTERVAL_SECONDS}
