"""Travel data providers: destinations, flight/hotel prices, and affiliate links.

Quotes are live (Duffel for flights, LiteAPI for hotels; see live.py) when their
keys are set in backend/.env. Otherwise, or if a provider fails, they fall back to
a deterministic simulator built on each destination's typical costs, and the quote's
`source` says which one you got.

Destinations are the built-in catalog below plus any city the planning agent adds
with `add_destination`, which are saved in the store.
"""

import hashlib
import logging
import math
import os
import random
import re
from datetime import date, datetime, timezone
from urllib.parse import quote_plus, urlencode

import live
import store

log = logging.getLogger("providers")

# Average daily high in °C for each month (Jan..Dec), plus typical costs in USD.
DESTINATIONS = {
    "cancun": {"name": "Cancún", "country": "Mexico", "country_code": "MX", "iata": "CUN", "region": "caribbean",
               "temps": [28, 29, 30, 31, 32, 33, 33, 33, 32, 31, 29, 28], "rainy_months": [6, 9, 10],
               "flight_base": 380, "hotel": {"value": 70, "mid": 160, "luxury": 420}, "food_day": 45,
               "vibe": ["beach", "snorkeling", "ruins", "nightlife"]},
    "san_juan": {"name": "San Juan", "country": "Puerto Rico (USA)", "country_code": "PR", "iata": "SJU", "region": "caribbean",
                 "temps": [28, 28, 29, 29, 30, 31, 31, 31, 31, 31, 30, 29], "rainy_months": [8, 9, 10],
                 "flight_base": 340, "hotel": {"value": 90, "mid": 180, "luxury": 400}, "food_day": 55,
                 "vibe": ["beach", "history", "food", "rainforest"]},
    "lisbon": {"name": "Lisbon", "country": "Portugal", "country_code": "PT", "iata": "LIS", "region": "europe",
               "temps": [15, 16, 19, 20, 23, 26, 28, 29, 27, 23, 18, 15], "rainy_months": [11, 12, 1],
               "flight_base": 620, "hotel": {"value": 75, "mid": 150, "luxury": 380}, "food_day": 40,
               "vibe": ["food", "history", "walking", "nightlife", "viewpoints"]},
    "barcelona": {"name": "Barcelona", "country": "Spain", "country_code": "ES", "iata": "BCN", "region": "europe",
                  "temps": [14, 15, 17, 19, 22, 26, 29, 29, 26, 22, 17, 14], "rainy_months": [10, 11],
                  "flight_base": 650, "hotel": {"value": 85, "mid": 170, "luxury": 450}, "food_day": 50,
                  "vibe": ["architecture", "beach", "food", "nightlife", "art"]},
    "athens": {"name": "Athens", "country": "Greece", "country_code": "GR", "iata": "ATH", "region": "europe",
               "temps": [13, 14, 17, 20, 25, 30, 33, 33, 29, 24, 19, 15], "rainy_months": [12, 1],
               "flight_base": 700, "hotel": {"value": 65, "mid": 140, "luxury": 360}, "food_day": 38,
               "vibe": ["history", "food", "islands", "ruins"]},
    "marrakech": {"name": "Marrakech", "country": "Morocco", "country_code": "MA", "iata": "RAK", "region": "africa",
                  "temps": [18, 20, 23, 25, 29, 33, 37, 37, 32, 28, 22, 19], "rainy_months": [],
                  "flight_base": 720, "hotel": {"value": 45, "mid": 110, "luxury": 350}, "food_day": 25,
                  "vibe": ["markets", "culture", "food", "desert"]},
    "honolulu": {"name": "Honolulu", "country": "USA", "country_code": "US", "iata": "HNL", "region": "pacific",
                 "temps": [27, 27, 28, 28, 29, 30, 31, 31, 31, 30, 29, 28], "rainy_months": [12, 1],
                 "flight_base": 690, "hotel": {"value": 150, "mid": 260, "luxury": 550}, "food_day": 70,
                 "vibe": ["beach", "hiking", "surfing", "nature"]},
    "miami": {"name": "Miami", "country": "USA", "country_code": "US", "iata": "MIA", "region": "north_america",
              "temps": [24, 25, 26, 28, 30, 31, 32, 32, 31, 29, 27, 25], "rainy_months": [6, 8, 9],
              "flight_base": 220, "hotel": {"value": 110, "mid": 210, "luxury": 480}, "food_day": 60,
              "vibe": ["beach", "nightlife", "art", "food"]},
    "mexico_city": {"name": "Mexico City", "country": "Mexico", "country_code": "MX", "iata": "MEX", "region": "north_america",
                    "temps": [22, 24, 26, 27, 27, 25, 24, 24, 23, 23, 23, 22], "rainy_months": [6, 7, 8, 9],
                    "flight_base": 330, "hotel": {"value": 50, "mid": 120, "luxury": 320}, "food_day": 30,
                    "vibe": ["food", "museums", "history", "markets"]},
    "tokyo": {"name": "Tokyo", "country": "Japan", "country_code": "JP", "iata": "HND", "region": "asia",
              "temps": [10, 11, 14, 19, 23, 26, 30, 31, 27, 22, 17, 12], "rainy_months": [6, 9],
              "flight_base": 1100, "hotel": {"value": 80, "mid": 170, "luxury": 450}, "food_day": 45,
              "vibe": ["food", "culture", "shopping", "tech"]},
    "bangkok": {"name": "Bangkok", "country": "Thailand", "country_code": "TH", "iata": "BKK", "region": "asia",
                "temps": [32, 33, 34, 35, 34, 33, 33, 32, 32, 32, 32, 31], "rainy_months": [8, 9, 10],
                "flight_base": 980, "hotel": {"value": 35, "mid": 90, "luxury": 260}, "food_day": 20,
                "vibe": ["food", "temples", "markets", "nightlife"]},
    "bali": {"name": "Bali", "country": "Indonesia", "country_code": "ID", "iata": "DPS", "region": "asia",
             "temps": [30, 30, 31, 31, 31, 30, 29, 30, 30, 31, 31, 30], "rainy_months": [12, 1, 2],
             "flight_base": 1150, "hotel": {"value": 40, "mid": 110, "luxury": 330}, "food_day": 22,
             "vibe": ["beach", "temples", "wellness", "surfing"]},
    "cape_town": {"name": "Cape Town", "country": "South Africa", "country_code": "ZA", "iata": "CPT", "region": "africa",
                  "temps": [26, 27, 25, 23, 20, 18, 18, 18, 19, 21, 24, 25], "rainy_months": [6, 7],
                  "flight_base": 1050, "hotel": {"value": 55, "mid": 120, "luxury": 340}, "food_day": 30,
                  "vibe": ["nature", "wine", "hiking", "beach"]},
    "reykjavik": {"name": "Reykjavík", "country": "Iceland", "country_code": "IS", "iata": "KEF", "region": "europe",
                  "temps": [2, 3, 3, 6, 9, 12, 14, 13, 10, 7, 4, 2], "rainy_months": [10, 11, 12],
                  "flight_base": 480, "hotel": {"value": 120, "mid": 220, "luxury": 450}, "food_day": 75,
                  "vibe": ["nature", "northern lights", "hot springs", "hiking"]},
    "montreal": {"name": "Montréal", "country": "Canada", "country_code": "CA", "iata": "YUL", "region": "north_america",
                 "temps": [-5, -3, 3, 11, 19, 24, 26, 25, 20, 13, 6, -2], "rainy_months": [11],
                 "flight_base": 260, "hotel": {"value": 90, "mid": 170, "luxury": 350}, "food_day": 50,
                 "vibe": ["food", "festivals", "history", "walking"]},
}


def all_destinations() -> dict:
    return {**store.read()["destinations"], **DESTINATIONS}


def get_destination(dest_id: str) -> dict:
    dest = all_destinations().get(dest_id)
    if not dest:
        raise ValueError(f"Unknown destination_id '{dest_id}'. Use a destination_id from research_destinations, "
                         "or add the city with add_destination first.")
    return dest


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", live._ascii(text).lower()).strip("_")


def add_destination(city: str, country: str, known_for: list[str], typical_flight_usd: float,
                    hotel_nightly_usd: dict, food_per_day_usd: float, airport_code: str | None = None) -> dict:
    """Add any city to the catalog. Location, airport, and climate are looked up; costs are the caller's estimates."""
    place = live.geocode(city, country)
    dest_id = _slug(f"{place['name']} {place['country_code']}")
    existing = all_destinations().get(dest_id)
    if existing:
        return {"destination_id": dest_id, **existing}

    iata = live.find_airport(place["name"], place["country_code"]) or (airport_code or "").upper()
    if not re.fullmatch(r"[A-Z]{3}", iata):
        iata = None  # no airport: fine for trips reached by train, bus, or car (travel_mode 'ground')
    weather = live.climate(place["lat"], place["lon"], date.today().year - 1)
    dest = {"name": place["name"], "country": place["country"], "country_code": place["country_code"],
            "iata": iata, "region": "custom", **weather,
            "flight_base": typical_flight_usd,
            "hotel": {s: hotel_nightly_usd.get(s) or hotel_nightly_usd.get("mid", 150) for s in ("value", "mid", "luxury")},
            "food_day": food_per_day_usd, "vibe": known_for, "added_at": store.now_iso()}
    with store.transaction() as state:
        state["destinations"][dest_id] = dest
    return {"destination_id": dest_id, **dest}


def _seed(*parts) -> int:
    return int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:12], 16)


def _parse(d: str) -> date:
    return date.fromisoformat(d[:10])


def _season_factor(dest: dict, when: date) -> float:
    """Peak (warmest or holiday) months cost more."""
    month = when.month
    peak = 1.25 if month in (6, 7, 8, 12) else 1.0
    return peak * (0.9 if month in dest["rainy_months"] else 1.0)


def _drift(key: str, now: datetime) -> float:
    """Simulated market movement: a slow wave plus hourly noise and occasional dips."""
    hours = now.timestamp() / 3600
    wave = 0.08 * math.sin(hours / 9 + (_seed(key) % 100))
    rng = random.Random(_seed(key, int(hours * 12)))  # changes every 5 minutes
    noise = rng.uniform(-0.04, 0.04)
    dip = -0.18 if rng.random() < 0.07 else 0.0
    return 1 + wave + noise + dip


def _simulated_flight(origin: str, dest_id: str, dest: dict, depart: str, return_date: str,
                      now: datetime) -> int:
    distance_adj = 0.85 + (_seed(origin, dest_id) % 30) / 100  # 0.85..1.15 per origin
    days_out = max((_parse(depart) - now.date()).days, 0)
    urgency = 1.35 if days_out < 14 else 1.1 if days_out < 30 else 1.0
    key = f"flight:{origin}:{dest_id}:{depart}:{return_date}"
    per_person = dest["flight_base"] * distance_adj * urgency * _season_factor(dest, _parse(depart)) * _drift(key, now)
    return round(per_person)


def quote_flight(origin: str, dest_id: str, depart: str, return_date: str, travelers: int = 1,
                 now: datetime | None = None, live_only: bool = False) -> dict:
    """Round-trip economy quote. With live_only, raise live.LiveError instead of falling back to an estimate."""
    dest = get_destination(dest_id)
    now = now or datetime.now(timezone.utc)
    quote = {
        "kind": "flight",
        "route": f"{origin}-{dest['iata']}",
        "depart": depart,
        "return": return_date,
        "currency": "USD",
        "booking_url": flight_link(origin, dest["iata"], depart, return_date, travelers),
    }
    try:
        found = live.cheapest_round_trip(origin, dest["iata"], depart, return_date, travelers)
        per_person = round(found["total"] / travelers)
        quote.update(source="live", airline=found["airline"], stops_each_way=found["stops"])
    except live.LiveError as exc:
        if live_only:
            raise
        if live.flights_enabled():
            log.warning("live flight quote failed, using an estimate: %s", exc)
        per_person = _simulated_flight(origin, dest_id, dest, depart, return_date, now)
        quote["source"] = "simulated"
    return {**quote, "price_per_person": per_person, "total": per_person * travelers}


def quote_hotel(dest_id: str, checkin: str, checkout: str, style: str = "mid", travelers: int = 1,
                now: datetime | None = None, live_only: bool = False) -> dict:
    """Hotel quote for the stay. With live_only, raise live.LiveError instead of falling back to an estimate."""
    dest = get_destination(dest_id)
    now = now or datetime.now(timezone.utc)
    style = style if style in dest["hotel"] else "mid"
    nights = max((_parse(checkout) - _parse(checkin)).days, 1)
    rooms = math.ceil(travelers / 2)
    quote = {
        "kind": "hotel",
        "destination": dest["name"],
        "checkin": checkin,
        "checkout": checkout,
        "style": style,
        "nights": nights,
        "rooms": rooms,
        "currency": "USD",
        "booking_url": hotel_link(dest["name"], checkin, checkout, travelers),
    }
    try:
        if not dest.get("country_code"):
            raise live.LiveError(f"No country code for {dest['name']}")
        found = live.hotel_room(dest["name"], dest["country_code"], checkin, checkout, style)
        nightly = round(found["total"] / nights)
        quote.update(source="live", hotel_name=found["name"], stars=found["stars"])
    except live.LiveError as exc:
        if live_only:
            raise
        if live.hotels_enabled():
            log.warning("live hotel quote failed, using an estimate: %s", exc)
        key = f"hotel:{dest_id}:{checkin}:{checkout}:{style}"
        nightly = round(dest["hotel"][style] * _season_factor(dest, _parse(checkin)) * _drift(key, now))
        quote.update(source="simulated", free_cancellation=True)
    return {**quote, "nightly": nightly, "total": nightly * nights * rooms}


def research_destinations(month: int, min_temp_c: float | None = None, max_temp_c: float | None = None,
                          interests: list[str] | None = None, max_flight_price: float | None = None,
                          origin: str = "JFK") -> list[dict]:
    """Fast screening over every known destination using typical-cost estimates, not live prices."""
    results = []
    now = datetime.now(timezone.utc)
    probe_day = date(date.today().year + (1 if month < date.today().month else 0), month, 15).isoformat()
    for dest_id, d in all_destinations().items():
        temp = d["temps"][month - 1]
        if min_temp_c is not None and temp < min_temp_c:
            continue
        if max_temp_c is not None and temp > max_temp_c:
            continue
        flight_estimate = _simulated_flight(origin, dest_id, d, probe_day, probe_day, now)
        if max_flight_price is not None and flight_estimate > max_flight_price:
            continue
        overlap = sorted(set(interests or []) & set(d["vibe"]))
        results.append({
            "destination_id": dest_id,
            "name": d["name"],
            "country": d["country"],
            "avg_high_c": temp,
            "rainy_season": month in d["rainy_months"],
            "typical_round_trip_flight": flight_estimate,
            "hotel_nightly": d["hotel"],
            "food_per_day": d["food_day"],
            "known_for": d["vibe"],
            "matches_interests": overlap,
        })
    results.sort(key=lambda r: (-len(r["matches_interests"]), r["typical_round_trip_flight"]))
    return results


# --- Affiliate links -------------------------------------------------------
# Set these in backend/.env once you're approved for each program. Parameter
# names follow each program's public deep-link format; confirm them against
# your partner dashboard before launch.

def _yymmdd(d: str) -> str:
    return _parse(d).strftime("%y%m%d")


def flight_link(origin: str, dest_iata: str, depart: str, return_date: str, travelers: int = 1) -> str:
    base = f"https://www.skyscanner.com/transport/flights/{origin.lower()}/{dest_iata.lower()}/{_yymmdd(depart)}/{_yymmdd(return_date)}/"
    params = {"adultsv2": travelers}
    if aid := os.getenv("SKYSCANNER_ASSOCIATE_ID"):
        params["associateid"] = aid
    return f"{base}?{urlencode(params)}"


def hotel_link(city: str, checkin: str, checkout: str, travelers: int = 1) -> str:
    params = {"ss": city, "checkin": checkin[:10], "checkout": checkout[:10], "group_adults": travelers}
    if aid := os.getenv("BOOKING_AFFILIATE_ID"):
        params["aid"] = aid
    return f"https://www.booking.com/searchresults.html?{urlencode(params)}"


def activity_link(city: str, activity: str) -> str:
    params = {"q": f"{activity} {city}"}
    if pid := os.getenv("GETYOURGUIDE_PARTNER_ID"):
        params["partner_id"] = pid
    return f"https://www.getyourguide.com/s/?{urlencode(params)}"


def restaurant_link(city: str, name: str) -> str:
    return f"https://www.google.com/maps/search/{quote_plus(name + ' ' + city)}"
