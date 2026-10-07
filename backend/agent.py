"""Claude-powered agents: goal-based planning, trip chat, feedback, and document checks.

Each agent is a manual tool-use loop over tools implemented in this file. The
agent decides which tools to call and in what order; the server owns anything
that must be trustworthy (prices, booking links, stored state).
"""

import json
import math
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Callable

import anthropic

import providers
import store

MODEL = os.getenv("TRAVEL_AGENT_MODEL", "claude-opus-5-5")
FALLBACK_BETA = "server-side-fallback-2026-07-01"

client = anthropic.Anthropic()

StepCallback = Callable[[str], None]


class AgentError(Exception):
    pass


# Friendly labels shown in the app while the agent works.
STEP_LABELS = {
    "get_travel_profile": "Reading your travel profile",
    "research_destinations": "Researching destinations",
    "add_destination": "Looking up a new destination",
    "quote_trip": "Comparing travel costs",
    "save_itinerary": "Building your itinerary",
    "update_day": "Updating your itinerary",
    "change_trip": "Updating your trip",
    "request_reservation_change": "Preparing a reservation change",
    "update_travel_profile": "Updating your travel profile",
    "record_requirements": "Saving document requirements",
    "web_search": "Checking official entry requirements",
    "code_execution": "Reading official sources",
}

ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "time": {"type": "string", "description": "Local start time, 24h HH:MM"},
        "title": {"type": "string"},
        "category": {"type": "string", "enum": ["activity", "meal", "transport", "lodging", "flight", "free_time"]},
        "est_cost_usd": {"type": "number", "description": "Total for all travelers"},
        "indoor": {"type": "boolean"},
        "place_name": {"type": "string", "description": "Venue or restaurant name, if any"},
        "notes": {"type": "string"},
    },
    "required": ["time", "title", "category", "est_cost_usd", "indoor"],
}


# --- The loop ----------------------------------------------------------------

def run_agent(system: str, prompt: str, tools: list[dict], handlers: dict[str, Callable],
              on_step: StepCallback, effort: str = "medium", max_turns: int = 24) -> str:
    messages: list = [{"role": "user", "content": prompt}]
    for _ in range(max_turns):
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=[FALLBACK_BETA],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": effort},
            cache_control={"type": "ephemeral"},
            system=system,
            tools=tools,
            messages=messages,
        )
        if response.stop_reason == "refusal":
            raise AgentError("The assistant couldn't help with that request. Try rephrasing it.")
        if response.stop_reason == "max_tokens":
            raise AgentError("The assistant's response was cut off. Try a simpler request.")

        messages.append({"role": "assistant", "content": response.content})
        for block in response.content:
            if block.type == "server_tool_use":
                on_step(STEP_LABELS.get(block.name, block.name))

        if response.stop_reason == "pause_turn":
            continue  # server tool still running; resend to let it finish
        if response.stop_reason != "tool_use":
            # Cited answers arrive as several adjacent text blocks; join them seamlessly.
            return "".join(b.text for b in response.content if b.type == "text").strip()

        results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            on_step(STEP_LABELS.get(block.name, block.name))
            try:
                output = handlers[block.name](**block.input)
                results.append({"type": "tool_result", "tool_use_id": block.id,
                                "content": json.dumps(output, default=str)})
            except Exception as exc:  # report to the model so it can correct itself
                results.append({"type": "tool_result", "tool_use_id": block.id,
                                "content": f"Error: {exc}", "is_error": True})
        messages.append({"role": "user", "content": results})
    raise AgentError("The assistant took too many steps. Try a more specific request.")


# --- Shared helpers ------------------------------------------------------------

def _public_profile() -> dict:
    profile = store.read()["profile"]
    return {k: v for k, v in profile.items() if k != "history"}


def _link_for(item: dict, city: str, trip: dict) -> str | None:
    category = item.get("category")
    if category == "activity":
        return providers.activity_link(city, item.get("place_name") or item["title"])
    if category == "meal" and item.get("place_name"):
        return providers.restaurant_link(city, item["place_name"])
    if category == "lodging":
        return providers.hotel_link(city, trip["start_date"], trip["end_date"], trip["travelers"])
    if category == "flight":
        dest = providers.get_destination(trip["destination_id"])
        if not dest.get("iata"):
            return None
        return providers.flight_link(trip["origin"], dest["iata"], trip["start_date"], trip["end_date"], trip["travelers"])
    return None


def _normalize_days(days: list[dict], city: str, trip: dict) -> list[dict]:
    normalized = []
    for day in days:
        items = []
        for raw in sorted(day.get("items", []), key=lambda i: i.get("time", "")):
            item = {**raw, "id": store.new_id("item")}
            item.setdefault("notes", "")
            item["booking_url"] = _link_for(item, city, trip)
            items.append(item)
        normalized.append({"date": day["date"], "theme": day.get("theme", ""), "items": items})
    return sorted(normalized, key=lambda d: d["date"])


def _recompute_costs(trip: dict, flights: float, hotel: float) -> None:
    activities = sum(i["est_cost_usd"] for d in trip["days"] for i in d["items"]
                     if i["category"] in ("activity", "transport", "free_time"))
    meals = sum(i["est_cost_usd"] for d in trip["days"] for i in d["items"] if i["category"] == "meal")
    food = max(meals, trip.get("food_estimate", 0))
    trip["costs"] = {"flights": flights, "hotel": hotel, "food": round(food), "activities": round(activities),
                     "total": round(flights + hotel + food + activities)}


def _create_watches(state: dict, trip: dict, flight: dict | None, hotel: dict | None,
                    flight_target: float | None, hotel_target: float | None) -> None:
    """Watch the prices that exist: no flight watch for ground trips, no hotel watch for day trips."""
    state["watches"] = [w for w in state["watches"] if w.get("trip_id") != trip["id"]]
    base = {"trip_id": trip["id"], "active": True, "created_at": store.now_iso(), "last_alert_price": None}
    if flight:
        state["watches"].append({
            **base, "id": store.new_id("watch"), "kind": "flight",
            "label": f"Flights {flight['route']}",
            "params": {"origin": trip["origin"], "destination_id": trip["destination_id"],
                       "depart": trip["start_date"], "return_date": trip["end_date"], "travelers": trip["travelers"]},
            "target_price": round(flight_target or flight["price_per_person"] * 0.92),
            "price_unit": "per person",
            "price_source": flight["source"],
            "history": [{"t": store.now_iso(), "price": flight["price_per_person"]}],
            "booking_url": flight["booking_url"],
        })
    if hotel:
        state["watches"].append({
            **base, "id": store.new_id("watch"), "kind": "hotel",
            "label": f"{hotel['style'].title()} hotel in {hotel['destination']}",
            "params": {"destination_id": trip["destination_id"], "checkin": trip["start_date"],
                       "checkout": trip["end_date"], "style": hotel["style"], "travelers": trip["travelers"]},
            "target_price": round(hotel_target or hotel["nightly"] * 0.92),
            "price_unit": "per night",
            "price_source": hotel["source"],
            "history": [{"t": store.now_iso(), "price": hotel["nightly"]}],
            "booking_url": hotel["booking_url"],
        })


# --- Goal-based planning ----------------------------------------------------------

PLAN_SYSTEM = """You are the planning agent in a travel app. The traveler states a loose goal, such as "warm, 4 days, under $1,200", and you turn it into a complete, bookable trip on your own.

Don't ask clarifying questions. Make sensible assumptions and mention the important ones in your final summary.

How to work:
1. Read the traveler's profile first. Their budget style, pace, interests, dislikes, and learned notes should shape every choice, so they never have to repeat themselves.
2. Research destinations that fit the goal's weather, budget, and the traveler's interests. research_destinations only covers cities the app already knows. If the traveler names a place that isn't there, or a great fit is missing, add it with add_destination. Any city in the world with an airport nearby can be added, so never turn a request down because a city isn't listed.
3. Get quotes for your two or three strongest candidates with quote_trip before choosing, and compare total cost against the budget. A quote with source "live" is a real current price. A quote with source "simulated" is an estimate, so say the price is estimated in your summary.
4. Build a day-by-day itinerary for the winner and save it with save_itinerary. Include the outbound and return travel as items, plus the hotel check-in on overnight trips. If the saved total is over budget, change something (cheaper hotel style, fewer paid activities, or a different destination) and save again with the same trip_id.

Planning rules:
- The goal often comes from filters in the app, as lines like "Trip type:", "Destination:", "Travelers:", "Budget:", "Dates:", and "Vibe:". Treat each one as a requirement. Use exact dates as given. Plan at the named destination. If the destination is open, choose one that fits.
- Shape the whole trip around the trip type. For example, a girls' trip means shareable rooms, brunch, group-friendly nightlife, and photo spots. A family trip means kid-friendly activities and an easier pace. A honeymoon means romance and a nicer hotel.
- Day trips: when the Dates line says a day trip, or the goal says day trip or same day, plan out and back in one day with no hotel. Use the same date for start_date and end_date, put exactly one day in days, and add no lodging items (the server rejects them). Pick a place within a few hours' travel each way so most of the day is spent there, and end with the trip home in the evening. For anything that isn't worth a flight, such as a train, bus, ferry, or drive, use travel_mode "ground": no flight is quoted, so add the outbound and return legs as transport items with realistic cost estimates (fares, tolls, parking, or a rental). Ground trips start from the traveler's home city, the city of their home airport. Plan 4 to 6 items with realistic travel time between them.
- The budget covers everything: travel, hotel (overnight trips only), food, and activities for all travelers. Assume one traveler unless the goal says otherwise.
- Fly from the profile's home airport unless the goal names another origin.
- If the goal gives no dates, start the trip 4 to 8 weeks from today. Prices are better with lead time.
- Match the traveler's pace: relaxed means 2 or 3 planned items a day, balanced means 3 or 4, and packed means 5 or more. Meals count.
- Mark each item indoor or outdoor accurately. Live re-planning relies on it when the weather turns.
- Set watch targets that would make the trip meaningfully cheaper. They drive price alerts.

Your final reply appears on a phone screen. Nothing has been purchased, so say you planned the trip, never that you booked it. In 3 to 5 plain sentences, give the destination, the dates, the estimated total against the budget, why it fits this traveler, and any key assumption. Don't use markdown headings or lists."""


def _plan_tools() -> list[dict]:
    return [
        {"name": "get_travel_profile",
         "description": "Get the traveler's saved profile: home airport, passport, budget style, pace, interests, dislikes, and notes learned from past trips.",
         "input_schema": {"type": "object", "properties": {}}},
        {"name": "research_destinations",
         "description": "Screen the destinations the app already knows by travel month and filters. Returns average daily high (°C), rainy season, and typical (estimated, not live) round-trip flight price per person from the origin, hotel nightly rates by style, and daily food cost. Use quote_trip for real prices.",
         "input_schema": {"type": "object", "properties": {
             "month": {"type": "integer", "minimum": 1, "maximum": 12},
             "min_temp_c": {"type": "number", "description": "Minimum average daily high. Use about 26 for 'warm' and 29 for 'hot'."},
             "max_temp_c": {"type": "number"},
             "interests": {"type": "array", "items": {"type": "string"}},
             "max_flight_price": {"type": "number", "description": "Max round-trip flight per person, USD"},
             "origin": {"type": "string", "description": "IATA airport code"},
         }, "required": ["month"]}},
        {"name": "add_destination",
         "description": "Add any city to the app so it can be quoted and saved. The server finds its location, airport, and a year of weather history. You supply cost estimates, which are only used for screening and as a fallback when live prices are unavailable. Returns the new destination_id. iata is null when the place has no airport, so plan it with travel_mode 'ground'.",
         "input_schema": {"type": "object", "properties": {
             "city": {"type": "string", "description": "City name, e.g. 'Chicago'"},
             "country": {"type": "string", "description": "Country name, e.g. 'United States'"},
             "known_for": {"type": "array", "items": {"type": "string"}, "description": "3 to 5 short tags, e.g. 'food', 'architecture'"},
             "typical_flight_usd": {"type": "number", "description": "Typical round-trip economy fare per person from the traveler's home airport. Use 0 for a place reached by ground."},
             "hotel_nightly_usd": {"type": "object", "description": "Typical nightly room rate by style",
                                   "properties": {"value": {"type": "number"}, "mid": {"type": "number"}, "luxury": {"type": "number"}},
                                   "required": ["value", "mid", "luxury"]},
             "food_per_day_usd": {"type": "number", "description": "Typical food spend per person per day"},
             "airport_code": {"type": "string", "description": "Nearest IATA airport code, used if the server can't find one. Omit for ground-only places."},
         }, "required": ["city", "country", "known_for", "typical_flight_usd", "hotel_nightly_usd", "food_per_day_usd"]}},
        {"name": "quote_trip",
         "description": "Get current flight and hotel prices for specific dates, plus an estimated food cost. Each quote's source is 'live' (real current price) or 'simulated' (estimate). For a day trip, pass the same date as depart_date and return_date: no hotel is quoted. Use it to compare candidate destinations.",
         "input_schema": {"type": "object", "properties": {
             "destination_id": {"type": "string"},
             "origin": {"type": "string", "description": "IATA airport code"},
             "depart_date": {"type": "string", "description": "YYYY-MM-DD"},
             "return_date": {"type": "string", "description": "YYYY-MM-DD"},
             "travelers": {"type": "integer", "minimum": 1},
             "hotel_style": {"type": "string", "enum": ["value", "mid", "luxury"], "description": "Ignored for day trips"},
             "travel_mode": {"type": "string", "enum": ["flight", "ground"],
                             "description": "flight (default) quotes round-trip flights. ground skips flights for trips reached by train, bus, ferry, or car."},
         }, "required": ["destination_id", "origin", "depart_date", "return_date", "travelers"]}},
        {"name": "save_itinerary",
         "description": "Save the complete trip. The server re-prices flights and hotel, attaches booking links, starts price watches, and returns the cost breakdown. For a day trip, set start_date equal to end_date and put one day in days. Pass trip_id to overwrite a trip you already saved in this session.",
         "input_schema": {"type": "object", "properties": {
             "trip_id": {"type": "string"},
             "title": {"type": "string", "description": "Short title, e.g. 'Four sunny days in Cancún'"},
             "goal": {"type": "string", "description": "The traveler's original goal, verbatim"},
             "destination_id": {"type": "string"},
             "origin": {"type": "string"},
             "start_date": {"type": "string"},
             "end_date": {"type": "string"},
             "travelers": {"type": "integer", "minimum": 1},
             "hotel_style": {"type": "string", "enum": ["value", "mid", "luxury"], "description": "Ignored for day trips"},
             "travel_mode": {"type": "string", "enum": ["flight", "ground"],
                             "description": "flight (default) or ground. With ground, add transport items with cost estimates."},
             "budget_usd": {"type": "number"},
             "summary": {"type": "string", "description": "2 or 3 sentences on the trip"},
             "why_it_fits": {"type": "string", "description": "How the plan reflects the goal and the profile"},
             "flight_target_price": {"type": "number", "description": "Alert when the per-person flight drops to this price"},
             "hotel_target_nightly": {"type": "number", "description": "Alert when the hotel nightly rate drops to this price"},
             "days": {"type": "array", "items": {"type": "object", "properties": {
                 "date": {"type": "string"}, "theme": {"type": "string"},
                 "items": {"type": "array", "items": ITEM_SCHEMA}},
                 "required": ["date", "items"]}},
         }, "required": ["title", "goal", "destination_id", "origin", "start_date", "end_date", "travelers",
                         "budget_usd", "summary", "why_it_fits", "days"]}},
    ]


def _quote_trip(destination_id, origin, depart_date, return_date, travelers, hotel_style="mid",
                travel_mode="flight"):
    """Price a trip. Same-day dates make it a day trip with no hotel; ground travel has no flight quote."""
    dest = providers.get_destination(destination_id)
    day_trip = depart_date == return_date
    flight = None
    if travel_mode == "flight":
        if not dest.get("iata"):
            raise ValueError(f"{dest['name']} has no airport. Use travel_mode 'ground' and add transport items.")
        flight = providers.quote_flight(origin, destination_id, depart_date, return_date, travelers)
    hotel = None if day_trip else providers.quote_hotel(destination_id, depart_date, return_date, hotel_style, travelers)
    days = max((date.fromisoformat(return_date) - date.fromisoformat(depart_date)).days, 1)
    food = dest["food_day"] * days * travelers
    result = {"flight": flight, "hotel": hotel, "food_estimate": food, "day_trip": day_trip,
              "total_before_activities": (flight["total"] if flight else 0) + (hotel["total"] if hotel else 0) + food}
    notes = []
    if day_trip:
        notes.append("Day trip: no hotel is included.")
    if flight is None:
        notes.append("Ground travel: no flight is included. Add the outbound and return legs as transport items "
                     "with your own cost estimates.")
    if notes:
        result["note"] = " ".join(notes)
    return result


def _check_day_trip(days: list[dict], start_date: str) -> None:
    """A day trip is a single day with no overnight stay. Errors go back to the agent so it can fix them."""
    if any(d["date"] != start_date for d in days):
        raise ValueError("A day trip has one day. Use start_date as the only date in days.")
    if any(i.get("category") == "lodging" for d in days for i in d.get("items", [])):
        raise ValueError("A day trip has no overnight stay. Remove the lodging items.")


def _save_itinerary(created: list[str], **trip_in) -> dict:
    dest_id = trip_in["destination_id"]
    dest = providers.get_destination(dest_id)
    trip_in.setdefault("hotel_style", "mid")  # unused for day trips
    travel_mode = trip_in.get("travel_mode", "flight")
    if trip_in["start_date"] == trip_in["end_date"]:
        _check_day_trip(trip_in["days"], trip_in["start_date"])
    quote = _quote_trip(dest_id, trip_in["origin"], trip_in["start_date"], trip_in["end_date"],
                        trip_in["travelers"], trip_in["hotel_style"], travel_mode)
    flight, hotel = quote["flight"], quote["hotel"]

    with store.transaction() as state:
        existing = store.find(state["trips"], trip_in.get("trip_id") or "")
        trip = existing or {"id": store.new_id("trip"), "created_at": store.now_iso(), "status": "planned",
                            "changes": [], "feedback": None}
        trip.update({k: trip_in[k] for k in ("title", "goal", "destination_id", "origin", "start_date", "end_date",
                                              "travelers", "hotel_style", "budget_usd", "summary", "why_it_fits")})
        trip["destination"] = dest["name"]
        trip["country"] = dest["country"]
        trip["travel_mode"] = travel_mode
        trip["days"] = _normalize_days(trip_in["days"], dest["name"], trip)

        trip["food_estimate"] = quote["food_estimate"]
        _recompute_costs(trip, flight["total"] if flight else 0, hotel["total"] if hotel else 0)
        total = trip["costs"]["total"]
        trip["booking_links"] = {"flight": flight["booking_url"] if flight else None,
                                 "hotel": hotel["booking_url"] if hotel else None}

        if not existing:
            state["trips"].insert(0, trip)
        _create_watches(state, trip, flight, hotel,
                        trip_in.get("flight_target_price"), trip_in.get("hotel_target_nightly"))

    if trip["id"] not in created:
        created.append(trip["id"])
    return {"trip_id": trip["id"], "costs": trip["costs"], "budget_usd": trip["budget_usd"],
            "over_budget_by": max(round(total - trip["budget_usd"]), 0)}


def plan_trip(goal: str, on_step: StepCallback) -> dict:
    created: list[str] = []
    handlers = {
        "get_travel_profile": _public_profile,
        "research_destinations": providers.research_destinations,
        "add_destination": providers.add_destination,
        "quote_trip": _quote_trip,
        "save_itinerary": lambda **kw: _save_itinerary(created, **kw),
    }
    prompt = f"Today is {date.today().isoformat()}.\n\nMy goal: {goal}"
    summary = run_agent(PLAN_SYSTEM, prompt, _plan_tools(), handlers, on_step, effort="high")
    if not created:
        raise AgentError(summary or "The assistant didn't produce an itinerary. Try adding more detail to your goal.")
    return {"trip_id": created[-1], "summary": summary}


# --- Editing a saved trip ---------------------------------------------------------------
# Shared by the app's manual editors and the chat agent, so both change a trip the same way.

class NotFound(LookupError):
    pass


TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
CATEGORIES = ("activity", "meal", "transport", "lodging", "flight", "free_time")
PRICED_SEPARATELY = ("flight", "lodging")  # costed from live quotes, so an item's own cost is ignored
MAX_TRIP_NIGHTS = 30
MAX_TRAVELERS = 12


def _find_trip(state: dict, trip_id: str) -> dict:
    trip = store.find(state["trips"], trip_id)
    if not trip:
        raise NotFound("Trip not found")
    return trip


def _require_editable(trip: dict) -> None:
    if trip["status"] in ("completed", "awaiting_feedback"):
        raise ValueError("This trip is over, so it can't be changed.")


def _find_day(trip: dict, day_date: str) -> dict:
    day = next((d for d in trip["days"] if d["date"] == day_date), None)
    if day is None:
        raise NotFound(f"No itinerary day {day_date}")
    return day


def _clean_item_fields(fields: dict, category: str) -> dict:
    """Validate the fields a traveler typed for an itinerary item. Only the fields present are returned."""
    out: dict = {}
    if "time" in fields:
        time = str(fields["time"]).strip()
        if not TIME_RE.match(time):
            raise ValueError("Time must look like 14:30.")
        out["time"] = time
    if "title" in fields:
        title = str(fields["title"]).strip()
        if not title:
            raise ValueError("Give the item a title.")
        out["title"] = title[:200]
    if "place_name" in fields:
        out["place_name"] = str(fields["place_name"]).strip()[:200]
    if "notes" in fields:
        out["notes"] = str(fields["notes"]).strip()[:1000]
    if "indoor" in fields:
        out["indoor"] = bool(fields["indoor"])
    if "est_cost_usd" in fields and category not in PRICED_SEPARATELY:
        cost = float(fields["est_cost_usd"])
        if not math.isfinite(cost) or cost < 0:
            raise ValueError("Cost must be zero or more.")
        out["est_cost_usd"] = round(cost, 2)
    return out


def _refresh_costs(trip: dict) -> None:
    _recompute_costs(trip, trip["costs"]["flights"], trip["costs"]["hotel"])


def edit_item(trip_id: str, day_date: str, item_id: str, fields: dict) -> dict:
    with store.transaction() as state:
        trip = _find_trip(state, trip_id)
        _require_editable(trip)
        day = _find_day(trip, day_date)
        item = next((i for i in day["items"] if i["id"] == item_id), None)
        if item is None:
            raise NotFound("Item not found")
        item.update(_clean_item_fields(fields, item["category"]))
        item["booking_url"] = _link_for(item, trip["destination"], trip)
        day["items"].sort(key=lambda i: i["time"])
        _refresh_costs(trip)
        return trip


def add_item(trip_id: str, day_date: str, fields: dict) -> dict:
    category = fields.get("category")
    if category not in CATEGORIES:
        raise ValueError("Pick what kind of item this is.")
    if not fields.get("title") or not fields.get("time"):
        raise ValueError("An item needs a time and a title.")
    with store.transaction() as state:
        trip = _find_trip(state, trip_id)
        _require_editable(trip)
        day = _find_day(trip, day_date)
        if category == "lodging" and trip["start_date"] == trip["end_date"]:
            raise ValueError("A day trip has no overnight stay.")
        item = {"id": store.new_id("item"), "category": category, "indoor": False, "est_cost_usd": 0, "notes": "",
                **_clean_item_fields(fields, category)}
        item["booking_url"] = _link_for(item, trip["destination"], trip)
        day["items"].append(item)
        day["items"].sort(key=lambda i: i["time"])
        _refresh_costs(trip)
        return trip


def delete_item(trip_id: str, day_date: str, item_id: str) -> dict:
    with store.transaction() as state:
        trip = _find_trip(state, trip_id)
        _require_editable(trip)
        day = _find_day(trip, day_date)
        if not any(i["id"] == item_id for i in day["items"]):
            raise NotFound("Item not found")
        day["items"] = [i for i in day["items"] if i["id"] != item_id]
        _refresh_costs(trip)
        return trip


def validate_trip_changes(trip: dict, changes: dict) -> dict:
    """Check requested changes to a trip's basics. Returns only the ones that actually change something."""
    _require_editable(trip)
    clean: dict = {}
    if "title" in changes:
        title = str(changes["title"]).strip()
        if not title:
            raise ValueError("Give the trip a title.")
        clean["title"] = title[:120]
    if "budget_usd" in changes:
        budget = float(changes["budget_usd"])
        if not math.isfinite(budget) or budget <= 0:
            raise ValueError("Budget must be more than zero.")
        clean["budget_usd"] = round(budget)
    if "travelers" in changes:
        travelers = int(changes["travelers"])
        if not 1 <= travelers <= MAX_TRAVELERS:
            raise ValueError(f"Travelers must be between 1 and {MAX_TRAVELERS}.")
        clean["travelers"] = travelers
    if "start_date" in changes or "end_date" in changes:
        try:
            start = date.fromisoformat(str(changes.get("start_date", trip["start_date"]))[:10])
            end = date.fromisoformat(str(changes.get("end_date", trip["end_date"]))[:10])
        except ValueError:
            raise ValueError("Dates must look like 2026-11-14.") from None
        if end < start:
            raise ValueError("The trip can't end before it starts.")
        if (end - start).days > MAX_TRIP_NIGHTS:
            raise ValueError(f"Trips can be at most {MAX_TRIP_NIGHTS} nights.")
        today = date.today()
        already_started = trip["status"] == "in_progress" and start.isoformat() == trip["start_date"]
        if end < today or (start < today and not already_started):
            raise ValueError("Pick dates that haven't passed yet.")
        clean["start_date"], clean["end_date"] = start.isoformat(), end.isoformat()
    return {k: v for k, v in clean.items() if v != trip.get(k)}


def _remap_days(trip: dict, start: str, end: str) -> dict:
    """Move the itinerary onto new dates. Arrival stays first and departure stays last: extra days are added
    and dropped days are removed in between. Only turning a trip into a day trip, or a day trip into an
    overnight one, moves the return flight."""
    old = sorted(trip["days"], key=lambda d: d["date"])
    new_count = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    open_days = lambda n: [{"theme": "Open day", "items": []} for _ in range(n)]
    flights = lambda day: sorted((i for i in day["items"] if i["category"] == "flight"), key=lambda i: i["time"])
    dropped: list[dict] = []

    if len(old) >= 2 and new_count >= 2:
        middle = old[1:-1]
        keep = middle[:new_count - 2]
        dropped = middle[new_count - 2:]
        days = [old[0], *keep, *open_days(new_count - 2 - len(keep)), old[-1]]
    elif len(old) >= 2:  # becoming a day trip: no overnight stay, and the return flight comes along
        back = flights(old[-1])
        first = {**old[0], "items": [i for i in old[0]["items"] if i["category"] != "lodging"] + back}
        dropped = [*old[1:-1], {**old[-1], "items": [i for i in old[-1]["items"] if i not in back]}]
        days = [first]
    elif new_count >= 2:  # a day trip becoming overnight: the return flight moves to the last day
        back = flights(old[0])[-1:] if len(flights(old[0])) > 1 else []
        first = {**old[0], "items": [i for i in old[0]["items"] if i not in back]}
        last = {"theme": "Departure day" if back else "Open day", "items": back}
        days = [first, *open_days(new_count - 2), last]
    else:
        days = old or open_days(1)

    days = [{**d, "date": (date.fromisoformat(start) + timedelta(days=n)).isoformat()} for n, d in enumerate(days)]
    for day in days:
        day["items"].sort(key=lambda i: i["time"])
    trip["days"] = days
    return {"added_days": max(new_count - len(old), 0), "dropped_days": len(dropped),
            "dropped_items": sum(len(d["items"]) for d in dropped)}


def _day_label(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d.strftime('%b')} {d.day}"


def update_trip(trip_id: str, changes: dict, on_step: StepCallback = lambda _step: None) -> dict:
    """Change a trip's title, budget, travelers, or dates. Dates and travelers re-price flights and hotel,
    and new dates move the itinerary onto the new days."""
    trip = _find_trip(store.read(), trip_id)
    try:
        changes = validate_trip_changes(trip, changes)
    except ValueError as exc:
        raise AgentError(str(exc)) from exc
    if not changes:
        return {"trip_id": trip_id, "summary": "Nothing to change.", "schedule_changed": False}

    start = changes.get("start_date", trip["start_date"])
    end = changes.get("end_date", trip["end_date"])
    travelers = changes.get("travelers", trip["travelers"])
    reschedule = "start_date" in changes or "end_date" in changes
    reprice = reschedule or "travelers" in changes

    quote = None
    if reprice:
        on_step("Comparing travel costs")
        try:
            quote = _quote_trip(trip["destination_id"], trip["origin"], start, end, travelers,
                                trip.get("hotel_style", "mid"), trip.get("travel_mode", "flight"))
        except ValueError as exc:
            raise AgentError(str(exc)) from exc

    remap: dict = {}
    with store.transaction() as state:
        t = _find_trip(state, trip_id)
        for key in ("title", "budget_usd"):
            if key in changes:
                t[key] = changes[key]
        if quote:
            if reschedule:
                remap = _remap_days(t, start, end)
            t.update(start_date=start, end_date=end, travelers=travelers)
            flight, hotel = quote["flight"], quote["hotel"]
            t["food_estimate"] = quote["food_estimate"]
            _recompute_costs(t, flight["total"] if flight else 0, hotel["total"] if hotel else 0)
            t["booking_links"] = {"flight": flight["booking_url"] if flight else None,
                                  "hotel": hotel["booking_url"] if hotel else None}
            for day in t["days"]:
                for item in day["items"]:
                    item["booking_url"] = _link_for(item, t["destination"], t)
            _create_watches(state, t, flight, hotel, None, None)  # price alerts restart from the new prices
            for hold in state["holds"]:  # holds were for the old dates and travelers
                if hold.get("trip_id") == trip_id and hold["kind"] in ("flight", "hotel") \
                        and hold["status"] == "pending_approval":
                    hold["status"] = "expired"

        parts = []
        if "title" in changes:
            parts.append("Renamed the trip.")
        if reschedule:
            parts.append(f"Moved to {_day_label(start)}" + (f" – {_day_label(end)}" if end != start else "") + ".")
        if "travelers" in changes:
            parts.append(f"Now {travelers} traveler{'s' if travelers > 1 else ''}.")
        if remap.get("added_days"):
            n = remap["added_days"]
            parts.append(f"Added {n} open day{'s' if n > 1 else ''} for you to fill.")
        if remap.get("dropped_days"):
            n, k = remap["dropped_days"], remap["dropped_items"]
            parts.append(f"Removed {n} day{'s' if n > 1 else ''} that no longer fit"
                         + (f", with {k} planned item{'s' if k > 1 else ''}." if k else "."))
        if quote and quote["hotel"] and reschedule and not any(
                i["category"] == "lodging" for d in t["days"] for i in d["items"]):
            parts.append("Your hotel check-in isn't in the plan yet. Add it whenever you like.")
        if quote:
            parts.append(f"Re-priced: about ${t['costs']['total']:,} of your ${t['budget_usd']:,} budget.")
        if "budget_usd" in changes:
            parts.append(f"Budget is now ${t['budget_usd']:,}.")
        summary = " ".join(parts)
        if quote or "budget_usd" in changes:
            t["changes"].insert(0, {"at": store.now_iso(), "date": t["start_date"], "reason": "You edited the trip",
                                    "summary": summary})
        result = {"trip_id": trip_id, "summary": summary, "schedule_changed": reschedule, "costs": t["costs"],
                  "budget_usd": t["budget_usd"], "over_budget_by": max(t["costs"]["total"] - t["budget_usd"], 0),
                  **remap}
    return result


# --- Chatting with the agent about a saved trip ----------------------------------------

CHAT_HISTORY_LIMIT = 60      # messages kept per trip
CHAT_PROMPT_MESSAGES = 12    # recent messages the agent sees

CHAT_SYSTEM = """You are the travel agent in a travel app, chatting with a traveler about a trip they've already planned. They might want to swap something they don't like, move their dates, cut costs, add something, or react to what's happening on the trip, such as the weather, tiredness, a closure, or a delay. Make the change for them.

How to work:
- Read the itinerary and the conversation, then act. Only ask a question when the request is truly ambiguous. Otherwise make a sensible choice and say what you chose.
- Change only what the request calls for. Keep everything else exactly as it is. On a trip that's underway, keep items that already happened (before the current local time).
- For changes within a day, call update_day with that day's complete list of items. It replaces the day, so include the items you're keeping.
- For dates, number of travelers, budget, or title, call change_trip. It re-prices flights and hotel and moves the itinerary onto the new dates. If the trip got longer, the new days start empty: fill them with update_day.
- For a different destination or a very different trip, research and quote alternatives, add a city with add_destination if it's missing, then rebuild the trip with save_itinerary, which overwrites this trip. Mention how the price changes.
- Rain calls for indoor alternatives. Tiredness calls for fewer items, less walking, and more rest. Keep costs near the original unless asked otherwise, respect the traveler's profile, and say so when a change pushes the trip over budget.
- If a changed item had a reservation, such as a paid tour, a table, or a ticket, call request_reservation_change. The traveler approves each change in the app, so never say a reservation was changed, only that a change is ready to approve.
- Nothing is purchased through this app, so never say you booked anything.

Your reply appears in a chat on a phone screen. Keep it short and friendly: 1 to 4 plain sentences on what you changed and why, plus one suggestion or question only if it helps. Don't use markdown, headings, or lists."""

CHAT_TOOLS = [
    {"name": "update_day",
     "description": "Replace the full list of items for one date of the trip. Include items you are keeping unchanged.",
     "input_schema": {"type": "object", "properties": {
         "date": {"type": "string"},
         "theme": {"type": "string"},
         "items": {"type": "array", "items": ITEM_SCHEMA},
         "change_summary": {"type": "string", "description": "One sentence describing the change"},
     }, "required": ["date", "items", "change_summary"]}},
    {"name": "change_trip",
     "description": "Change the trip's dates, number of travelers, budget, or title. Dates and travelers re-price flights and hotel. New dates move the itinerary: extra days start empty and the return flight moves to the last day. Pass only what changes.",
     "input_schema": {"type": "object", "properties": {
         "start_date": {"type": "string", "description": "YYYY-MM-DD"},
         "end_date": {"type": "string", "description": "YYYY-MM-DD"},
         "travelers": {"type": "integer", "minimum": 1},
         "budget_usd": {"type": "number"},
         "title": {"type": "string"},
     }}},
    {"name": "request_reservation_change",
     "description": "Prepare a change to an existing reservation (cancel, reschedule, or book a replacement). It waits for the traveler's approval.",
     "input_schema": {"type": "object", "properties": {
         "item_title": {"type": "string"},
         "action": {"type": "string", "enum": ["cancel", "reschedule", "new_booking"]},
         "details": {"type": "string"},
         "cost_change_usd": {"type": "number", "description": "Positive if it costs more, negative for a refund"},
     }, "required": ["item_title", "action", "details", "cost_change_usd"]}},
    # Rebuilding the trip somewhere else: the same tools the planner uses.
    *[t for t in _plan_tools() if t["name"] != "get_travel_profile"],
]


def log_chat(trip_id: str, role: str, text: str) -> None:
    with store.transaction() as state:
        trip = store.find(state["trips"], trip_id)
        if trip:
            entry = {"role": role, "text": text, "at": store.now_iso()}
            trip["chat"] = (trip.get("chat", []) + [entry])[-CHAT_HISTORY_LIMIT:]


def chat_trip(trip_id: str, message: str, local_time: str | None, on_step: StepCallback) -> dict:
    trip = store.find(store.read()["trips"], trip_id)
    if not trip:
        raise AgentError("Trip not found.")
    before = (trip["destination_id"], trip["start_date"], trip["end_date"])

    def update_day(date, items, change_summary, theme=None):
        with store.transaction() as state:
            t = _find_trip(state, trip_id)
            day = next((d for d in t["days"] if d["date"] == date), None)
            if day is None:
                raise ValueError(f"No itinerary day {date}. Valid dates: {[d['date'] for d in t['days']]}")
            if t["start_date"] == t["end_date"]:
                _check_day_trip([{"date": date, "items": items}], date)
            day["items"] = _normalize_days([{"date": date, "items": items}], t["destination"], t)[0]["items"]
            if theme:
                day["theme"] = theme
            _refresh_costs(t)
            t["changes"].insert(0, {"at": store.now_iso(), "date": date, "reason": message, "summary": change_summary})
        return {"ok": True}

    def request_reservation_change(item_title, action, details, cost_change_usd):
        with store.transaction() as state:
            hold = {"id": store.new_id("hold"), "kind": "change", "trip_id": trip_id, "status": "pending_approval",
                    "title": f"{action.replace('_', ' ').title()}: {item_title}", "details": details,
                    "price": cost_change_usd, "created_at": store.now_iso(),
                    "expires_at": (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(timespec="seconds"),
                    "booking_url": providers.activity_link(trip["destination"], item_title)}
            state["holds"].insert(0, hold)
        return {"hold_id": hold["id"], "status": "pending_approval"}

    def rebuild_trip(**trip_in):
        result = _save_itinerary([], **{**trip_in, "trip_id": trip_id})  # always overwrites this trip
        with store.transaction() as state:
            t = _find_trip(state, trip_id)
            t["changes"].insert(0, {"at": store.now_iso(), "date": t["start_date"], "reason": message,
                                    "summary": f"Rebuilt the trip: {t['title']}"})
        return result

    today = date.today().isoformat()
    if trip["start_date"] <= today <= trip["end_date"]:
        when = f"The trip is underway. Current local time at the destination: {local_time or 'unknown'} (today is {today})."
    else:
        when = (f"Today is {today}. The trip is {trip['start_date']} to {trip['end_date']} and isn't underway, "
                "so treat reports about the weather or how they feel as what-ifs.")
    compact = {k: trip.get(k) for k in ("title", "destination", "start_date", "end_date", "travelers", "budget_usd",
                                        "costs", "hotel_style", "travel_mode")}
    compact["days"] = [{"date": d["date"], "theme": d.get("theme", ""),
                        "items": [{k: v for k, v in i.items() if k not in ("id", "booking_url")} for i in d["items"]]}
                       for d in trip["days"]]
    earlier = trip.get("chat", [])[:-1][-CHAT_PROMPT_MESSAGES:]  # the last entry is this message
    transcript = "\n".join(f"{'Traveler' if m['role'] == 'user' else 'You'}: {m['text']}" for m in earlier) or "(none yet)"
    prompt = (f"{when}\n\nTraveler profile:\n{json.dumps(_public_profile())}\n\n"
              f"Trip:\n{json.dumps(compact)}\n\nConversation so far:\n{transcript}\n\n"
              f"Traveler's new message: {message}")
    handlers = {
        "update_day": update_day,
        "change_trip": lambda **changes: update_trip(trip_id, changes),
        "request_reservation_change": request_reservation_change,
        "research_destinations": providers.research_destinations,
        "add_destination": providers.add_destination,
        "quote_trip": _quote_trip,
        "save_itinerary": rebuild_trip,
    }
    reply = run_agent(CHAT_SYSTEM, prompt, CHAT_TOOLS, handlers, on_step) or "Done. Take a look at your itinerary."
    log_chat(trip_id, "assistant", reply)

    after = store.find(store.read()["trips"], trip_id)
    changed = (after["destination_id"], after["start_date"], after["end_date"]) != before
    return {"trip_id": trip_id, "summary": reply, "schedule_changed": changed}


# --- Post-trip feedback ------------------------------------------------------------

FEEDBACK_SYSTEM = """You maintain a traveler's long-term profile in a travel app. Every future trip is planned from this profile, so it should reflect how this person actually likes to travel.

You'll get a finished trip and the traveler's feedback on it. Work out what it reveals about their preferences for budget, pace, activities, food, and lodging, then call update_travel_profile once with the changes.

- Only record things the feedback supports. Don't overfit to a single remark. Prefer a specific, durable note ("prefers boutique hotels near the old town") over a vague one.
- Adjust budget_style, typical_daily_budget, or pace only when the feedback clearly points that way.
- Remove interests that the feedback contradicts.

Your final reply appears on a phone screen. In 1 or 2 plain sentences, tell the traveler what you learned and how it will change future plans."""

FEEDBACK_TOOLS = [
    {"name": "update_travel_profile",
     "description": "Apply learned changes to the traveler's profile. Omit fields that shouldn't change.",
     "input_schema": {"type": "object", "properties": {
         "budget_style": {"type": "string", "enum": ["value", "mid", "luxury"]},
         "typical_daily_budget": {"type": "number", "description": "USD per person per day, excluding flights"},
         "pace": {"type": "string", "enum": ["relaxed", "balanced", "packed"]},
         "add_interests": {"type": "array", "items": {"type": "string"}},
         "remove_interests": {"type": "array", "items": {"type": "string"}},
         "add_dislikes": {"type": "array", "items": {"type": "string"}},
         "add_notes": {"type": "array", "items": {"type": "string"}},
         "reason": {"type": "string", "description": "Why, citing the feedback"},
     }, "required": ["reason"]}},
]


def apply_profile_update(reason: str, source: str, budget_style=None, typical_daily_budget=None, pace=None,
                         add_interests=(), remove_interests=(), add_dislikes=(), add_notes=()) -> dict:
    with store.transaction() as state:
        p = state["profile"]
        changes = []
        for field, value in (("budget_style", budget_style), ("typical_daily_budget", typical_daily_budget), ("pace", pace)):
            if value is not None and p.get(field) != value:
                changes.append(f"{field}: {p.get(field)} → {value}")
                p[field] = value
        lower = lambda xs: [x.strip().lower() for x in xs if x.strip()]
        removed = set(lower(remove_interests))
        p["interests"] = [i for i in p["interests"] if i not in removed] + \
                         [i for i in lower(add_interests) if i not in p["interests"]]
        p["dislikes"] += [d for d in lower(add_dislikes) if d not in p["dislikes"]]
        p["learned_notes"] += [n for n in add_notes if n not in p["learned_notes"]]
        changes += [f"+interest {i}" for i in lower(add_interests)] + [f"-interest {i}" for i in removed]
        changes += [f"+dislike {d}" for d in lower(add_dislikes)] + [f"+note {n}" for n in add_notes]
        p["history"].insert(0, {"at": store.now_iso(), "source": source, "reason": reason, "changes": changes})
        return {"ok": True, "changes": changes}


def process_feedback(trip_id: str, feedback: dict, on_step: StepCallback) -> dict:
    state = store.read()
    trip = store.find(state["trips"], trip_id)
    if not trip:
        raise AgentError("Trip not found.")
    compact = {k: trip.get(k) for k in ("title", "destination", "start_date", "end_date", "costs", "hotel_style", "days", "changes")}
    prompt = (f"Current profile:\n{json.dumps(_public_profile())}\n\n"
              f"Finished trip:\n{json.dumps(compact)}\n\n"
              f"Traveler feedback:\n{json.dumps(feedback)}")
    handlers = {"update_travel_profile": lambda **kw: apply_profile_update(source=f"feedback on {trip['title']}", **kw)}
    summary = run_agent(FEEDBACK_SYSTEM, prompt, FEEDBACK_TOOLS, handlers, on_step)
    with store.transaction() as state:
        t = store.find(state["trips"], trip_id)
        t["feedback"] = {**feedback, "submitted_at": store.now_iso(), "agent_summary": summary}
        t["status"] = "completed"
    return {"trip_id": trip_id, "summary": summary}


# --- Documents and deadlines ------------------------------------------------------------

DOCS_SYSTEM = """You check travel document and entry requirements for a traveler's upcoming trip in a travel app.

Use web search to confirm current requirements from official sources, such as government travel advisories, embassy sites, and the destination's immigration authority. Check:
- Passport validity rules, such as months of validity required beyond the stay and blank pages. Compare them against the traveler's passport expiry if it's known.
- Whether a visa, eVisa, or electronic travel authorization (ETA/ETIAS/ESTA-style) is needed for this nationality and trip length, and how long it takes to get.
- Other entry rules worth acting on, such as required vaccinations, arrival forms, or proof of onward travel.

Then call record_requirements once with every item. For each one, set a deadline (the last safe date to have it done) and a lead_time_days (how many days before that deadline the traveler should be reminded so they can act comfortably). Include items that need no action with action_required false, so the traveler can see they were checked.

Your final reply appears on a phone screen. In 1 to 3 plain sentences, name anything urgent first."""


def check_documents(trip_id: str, on_step: StepCallback) -> dict:
    state = store.read()
    trip = store.find(state["trips"], trip_id)
    if not trip:
        raise AgentError("Trip not found.")
    profile = state["profile"]

    def record_requirements(requirements: list[dict]):
        docs = []
        today = date.today()
        for r in requirements:
            deadline = date.fromisoformat(r["deadline"][:10]) if r.get("deadline") else date.fromisoformat(trip["start_date"])
            remind = deadline - timedelta(days=int(r.get("lead_time_days") or 0))
            urgent = r.get("action_required", True) and remind <= today
            docs.append({
                "id": store.new_id("doc"), "trip_id": trip_id, "title": r["title"], "detail": r.get("detail", ""),
                "category": r.get("category", "other"), "action_required": r.get("action_required", True),
                "deadline": deadline.isoformat(),
                "remind_at": (max(remind, today) + timedelta(days=1 if urgent else 0)).isoformat() + "T09:00:00",
                "urgent": urgent, "source_url": r.get("source_url"), "done": False,
            })
        with store.transaction() as s:
            s["documents"] = [d for d in s["documents"] if d["trip_id"] != trip_id] + docs
            t = store.find(s["trips"], trip_id)
            t["documents_checked_at"] = store.now_iso()
        return {"saved": len(docs)}

    tools = [
        {"type": "web_search_20260209", "name": "web_search", "max_uses": 6},
        {"name": "record_requirements",
         "description": "Save the full list of document and entry requirements for this trip.",
         "input_schema": {"type": "object", "properties": {"requirements": {"type": "array", "items": {
             "type": "object", "properties": {
                 "title": {"type": "string"},
                 "detail": {"type": "string", "description": "What to do and how, in one or two sentences"},
                 "category": {"type": "string", "enum": ["passport", "visa", "entry", "health", "insurance", "other"]},
                 "action_required": {"type": "boolean"},
                 "deadline": {"type": "string", "description": "YYYY-MM-DD"},
                 "lead_time_days": {"type": "integer", "minimum": 0},
                 "source_url": {"type": "string"},
             }, "required": ["title", "detail", "category", "action_required", "deadline", "lead_time_days"]}}},
             "required": ["requirements"]}},
    ]
    prompt = (f"Today is {date.today().isoformat()}.\n"
              f"Traveler nationality (passport): {profile.get('passport_country') or 'unknown'}\n"
              f"Passport expiry: {profile.get('passport_expiry') or 'unknown (tell them to check it)'}\n"
              f"Destination: {trip['destination']}, {trip['country']}\n"
              f"Dates: {trip['start_date']} to {trip['end_date']}, flying from {trip['origin']}")
    summary = run_agent(DOCS_SYSTEM, prompt, tools, {"record_requirements": record_requirements}, on_step)
    return {"trip_id": trip_id, "summary": summary}
