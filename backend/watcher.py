"""Background price watcher and trip lifecycle.

Runs on a schedule without being prompted. Each tick it:
- re-prices every active flight/hotel watch and decides whether the new price
  is worth an alert (hit the target, or an unusual dip versus the recent trend);
- on an alert, notifies the traveler. It never places a hold on its own;
- expires stale holds and moves trips through planned → in_progress → awaiting_feedback.
"""

import asyncio
import logging
import os
from datetime import date, datetime, timedelta, timezone
from statistics import mean

import live
import providers
import store

log = logging.getLogger("watcher")
# Live providers rate-limit and prices move slowly, so check hourly when they're connected.
_DEFAULT_INTERVAL = "3600" if live.flights_enabled() or live.hotels_enabled() else "300"
INTERVAL_SECONDS = int(os.getenv("WATCH_INTERVAL_SECONDS", _DEFAULT_INTERVAL))
HISTORY_LIMIT = 200
TREND_WINDOW = 24       # recent checks used for the trend baseline
DIP_THRESHOLD = 0.12    # alert if this far below the recent average...
MIN_HISTORY_FOR_TREND = 6
REPEAT_GUARD = 0.03     # ...and at least 3% better than the last alert
HOLD_HOURS = 24


def current_price(watch: dict) -> float:
    """Re-price a watch. When its provider is live, never mix in estimates: they'd look like price swings."""
    p = watch["params"]
    if watch["kind"] == "flight":
        return providers.quote_flight(p["origin"], p["destination_id"], p["depart"], p["return_date"], p["travelers"],
                                      live_only=live.flights_enabled())["price_per_person"]
    return providers.quote_hotel(p["destination_id"], p["checkin"], p["checkout"], p["style"], p["travelers"],
                                 live_only=live.hotels_enabled())["nightly"]


def _is_live(watch: dict) -> bool:
    return live.flights_enabled() if watch["kind"] == "flight" else live.hotels_enabled()


def rebase_to_live(watch: dict, price: float) -> None:
    """A watch started on estimates just got its first live price. Estimates and live prices aren't
    comparable, so restart the history and scale the target by the same ratio instead of alerting."""
    last = watch["history"][-1]["price"] if watch["history"] else price
    watch["target_price"] = round(watch["target_price"] * price / last) if last else watch["target_price"]
    watch["history"] = [{"t": store.now_iso(), "price": price}]
    watch["last_alert_price"] = None
    watch["last_checked"] = store.now_iso()
    watch["price_source"] = "live"


def evaluate(watch: dict, price: float) -> str | None:
    """Return a human-readable reason to alert, or None."""
    past = [h["price"] for h in watch["history"][-TREND_WINDOW:]]
    last_alert = watch.get("last_alert_price")
    if last_alert is not None and price > last_alert * (1 - REPEAT_GUARD):
        return None  # already told them about a price this good
    if price <= watch["target_price"]:
        return f"Hit your target of ${watch['target_price']:,.0f} {watch['price_unit']}."
    if len(past) >= MIN_HISTORY_FOR_TREND:
        avg = mean(past)
        if price <= avg * (1 - DIP_THRESHOLD) and price <= min(past):
            pct = round((1 - price / avg) * 100)
            return f"{pct}% below its recent average (${avg:,.0f}) and the lowest price we've seen."
    return None


def place_hold(state: dict, watch: dict, price: float, reason: str) -> dict:
    trip = store.find(state["trips"], watch["trip_id"]) or {}
    travelers = watch["params"].get("travelers", 1)
    if watch["kind"] == "flight":
        details = f"Round trip {watch['params']['depart']} → {watch['params']['return_date']}, {travelers} traveler(s)."
        total = price * travelers
    else:
        nights = (date.fromisoformat(watch["params"]["checkout"]) - date.fromisoformat(watch["params"]["checkin"])).days
        details = f"{nights} nights from {watch['params']['checkin']}, free cancellation."
        total = price * max(nights, 1)
    hold = {
        "id": store.new_id("hold"), "kind": watch["kind"], "watch_id": watch["id"], "trip_id": watch["trip_id"],
        "title": f"{watch['label']} for {trip.get('title', 'your trip')}", "details": details,
        "reason": reason, "price": round(total), "unit_price": price, "status": "pending_approval",
        "created_at": store.now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=HOLD_HOURS)).isoformat(timespec="seconds"),
        "booking_url": watch["booking_url"],
        # Replace with the provider's hold/reservation reference once a live booking API is connected.
        "hold_reference": None, "simulated": True,
    }
    state["holds"].insert(0, hold)
    return hold


def advance_trip_statuses(state: dict, today: date | None = None) -> bool:
    """Move trips along planned → in_progress → awaiting_feedback by date. Returns True if any changed.

    A trip is over the day after its end date, which is when the app asks for feedback.
    """
    today = today or date.today()
    changed = False
    for trip in state["trips"]:
        start, end = date.fromisoformat(trip["start_date"]), date.fromisoformat(trip["end_date"])
        status = trip["status"]
        if status in ("planned", "booked") and start <= today <= end:
            trip["status"] = "in_progress"
        if trip["status"] in ("planned", "booked", "in_progress") and end < today:
            trip["status"] = "awaiting_feedback"
            trip["ended_at"] = store.now_iso()
        changed |= trip["status"] != status
    return changed


def tick() -> dict:
    alerts = 0
    now = datetime.now(timezone.utc)
    with store.transaction() as state:
        advance_trip_statuses(state)

        active_trips = {t["id"] for t in state["trips"] if t["status"] in ("planned", "booked")}
        for watch in state["watches"]:
            if not watch["active"] or watch["trip_id"] not in active_trips:
                continue
            try:
                price = current_price(watch)
            except (live.LiveError, ValueError) as exc:
                log.warning("skipping %s this round: %s", watch["label"], exc)
                continue
            if _is_live(watch) and watch.get("price_source") != "live":
                rebase_to_live(watch, price)
                continue
            reason = evaluate(watch, price)
            watch["history"] = (watch["history"] + [{"t": store.now_iso(), "price": price}])[-HISTORY_LIMIT:]
            watch["last_checked"] = store.now_iso()
            if reason:
                watch["last_alert_price"] = price
                state["alerts"].insert(0, {
                    "id": store.new_id("alert"), "watch_id": watch["id"], "trip_id": watch["trip_id"],
                    "hold_id": None, "title": f"Price drop: {watch['label']}",
                    "body": f"Now ${price:,.0f} {watch['price_unit']}. {reason}",
                    "created_at": store.now_iso(), "read": False,
                })
                alerts += 1

        for hold in state["holds"]:
            if hold["status"] == "pending_approval" and datetime.fromisoformat(hold["expires_at"]) < now:
                hold["status"] = "expired"
        state["alerts"] = state["alerts"][:100]
    return {"alerts_created": alerts, "checked_at": store.now_iso()}


async def run_forever() -> None:
    while True:
        try:
            result = await asyncio.to_thread(tick)
            if result["alerts_created"]:
                log.info("price watcher created %s alert(s)", result["alerts_created"])
        except Exception:
            log.exception("price watcher tick failed")
        await asyncio.sleep(INTERVAL_SECONDS)
