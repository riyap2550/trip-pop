"""Live travel data: Duffel (flights), LiteAPI (hotels), Open-Meteo (places and climate).

Each function raises LiveError when a provider is unconfigured, unreachable, or has
nothing to sell, so callers can decide whether to fall back to estimates.
Keys come from backend/.env: DUFFEL_ACCESS_TOKEN and LITEAPI_KEY.
"""

import json
import logging
import os
import re
import ssl
import threading
import time
import unicodedata
from statistics import mean
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import truststore

log = logging.getLogger("live")

# Verify HTTPS against the OS trust store; python.org builds on macOS ship without CA certificates.
_ssl = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

CACHE_SECONDS = 15 * 60  # planning quotes a trip, then re-prices it on save
TEST_AIRLINE = "ZZ"      # Duffel Airways, a fake airline that only exists in test mode
HOTEL_STARS = {"value": 3, "mid": 4, "luxury": 5}

_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


class LiveError(Exception):
    pass


def flights_enabled() -> bool:
    return bool(os.getenv("DUFFEL_ACCESS_TOKEN"))


def hotels_enabled() -> bool:
    return bool(os.getenv("LITEAPI_KEY"))


def _cached(key: str, fn):
    with _cache_lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
    value = fn()
    with _cache_lock:
        _cache[key] = (time.time(), value)
    return value


def _request(url: str, headers: dict | None = None, body: dict | None = None, timeout: float = 30) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = Request(url, data=data, headers={"Accept": "application/json", **(headers or {})})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=timeout, context=_ssl) as res:
            return json.loads(res.read())
    except HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        raise LiveError(f"{req.host} returned {exc.code}: {detail}") from exc
    except (URLError, TimeoutError) as exc:
        raise LiveError(f"Couldn't reach {req.host}: {exc}") from exc


def _ascii(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


def _same_place(a: str, b: str) -> bool:
    """Whether two place names match: all the words of one appear in the other ("New York" ~ "New York City").
    Lookup services fuzzy-match, so a search for "Sleepy Hollow" can return "Bath" first."""
    words = lambda t: set(re.sub(r"[^a-z0-9]+", " ", _ascii(t).lower()).split())
    wa, wb = words(a), words(b)
    return bool(wa) and bool(wb) and (wa <= wb or wb <= wa)


def to_usd(amount: float, currency: str) -> float:
    if currency == "USD":
        return amount
    rates = _cached(f"fx:{currency}", lambda: _request(
        f"https://api.frankfurter.dev/v1/latest?{urlencode({'base': currency, 'symbols': 'USD'})}")["rates"])
    if "USD" not in rates:
        raise LiveError(f"No exchange rate for {currency}")
    return amount * rates["USD"]


# --- Flights (Duffel) ------------------------------------------------------------

def _duffel(path: str, body: dict | None = None, timeout: float = 30) -> dict:
    if not flights_enabled():
        raise LiveError("DUFFEL_ACCESS_TOKEN isn't set")
    headers = {"Authorization": f"Bearer {os.environ['DUFFEL_ACCESS_TOKEN']}", "Duffel-Version": "v2"}
    return _request(f"https://api.duffel.com{path}", headers, body, timeout)


def cheapest_round_trip(origin: str, dest_iata: str, depart: str, return_date: str, travelers: int) -> dict:
    """Cheapest economy round trip for all travelers, in USD."""
    def search():
        body = {"data": {
            "slices": [{"origin": origin, "destination": dest_iata, "departure_date": depart[:10]},
                       {"origin": dest_iata, "destination": origin, "departure_date": return_date[:10]}],
            "passengers": [{"type": "adult"} for _ in range(travelers)],
            "cabin_class": "economy",
        }}
        offers = _duffel("/air/offer_requests?return_offers=true&supplier_timeout=15000", body, timeout=45)
        offers = [o for o in offers["data"]["offers"] if o["owner"]["iata_code"] != TEST_AIRLINE]
        if not offers:
            raise LiveError(f"No flights found for {origin}-{dest_iata} on those dates")
        priced = [(to_usd(float(o["total_amount"]), o["total_currency"]), o) for o in offers]
        total, best = min(priced, key=lambda p: p[0])
        return {"total": round(total), "airline": best["owner"]["name"],
                "stops": max(len(s["segments"]) - 1 for s in best["slices"])}
    return _cached(f"flight:{origin}:{dest_iata}:{depart}:{return_date}:{travelers}", search)


def find_airport(city: str, country_code: str | None = None) -> str | None:
    """IATA code for a city (metro code like CHI when one exists), or None when it has no airport of its own."""
    try:
        places = _duffel(f"/places/suggestions?{urlencode({'query': city})}")["data"]
    except LiveError as exc:
        log.warning("airport lookup failed for %s: %s", city, exc)
        return None
    if country_code:
        places = [p for p in places if p.get("iata_country_code") == country_code.upper()]
    # Only airports actually in this city. Never fall back to a lookalike name or another country.
    places = [p for p in places if _same_place(p.get("city_name") or p.get("name") or "", city)]
    for kind in ("city", "airport"):
        match = next((p for p in places if p["type"] == kind), None)
        if match:
            return match["iata_code"]
    return None


# --- Hotels (LiteAPI) -------------------------------------------------------------

def hotel_room(city: str, country_code: str, checkin: str, checkout: str, style: str) -> dict:
    """Best-matching hotel for one room of two adults for the whole stay, in USD."""
    if not hotels_enabled():
        raise LiveError("LITEAPI_KEY isn't set")

    def search(name: str) -> dict:
        body = {"cityName": name, "countryCode": country_code.upper(), "checkin": checkin[:10],
                "checkout": checkout[:10], "currency": "USD", "guestNationality": "US",
                "occupancies": [{"adults": 2}], "limit": 50, "maxRatesPerHotel": 1}
        try:
            return _request("https://api.liteapi.travel/v3.0/hotels/rates",
                            {"X-API-Key": os.environ["LITEAPI_KEY"]}, body, timeout=45)
        except LiveError as exc:
            if " 400: " in str(exc) or " 404: " in str(exc):  # no availability or unknown city
                return {"data": []}
            raise

    def lookup():
        res = search(city)
        if not res.get("data") and _ascii(city) != city:
            res = search(_ascii(city))
        info = {h["id"]: h for h in res.get("hotels", [])}
        options = []
        for hotel in res.get("data", []):
            prices = [to_usd(r["offerRetailRate"]["amount"], r["offerRetailRate"]["currency"])
                      for r in hotel["roomTypes"] if r.get("offerRetailRate")]
            if prices:
                meta = info.get(hotel["hotelId"], {})
                options.append({"price": min(prices), "name": meta.get("name"),
                                "stars": meta.get("stars") or 0, "rating": meta.get("rating") or 0})
        if not options:
            raise LiveError(f"No hotel availability in {city} for those dates")
        well_rated = [o for o in options if o["rating"] >= 7] or options
        target = HOTEL_STARS.get(style, 4)
        best = min(well_rated, key=lambda o: (abs(o["stars"] - target), o["price"]))
        return {"total": round(best["price"]), "name": best["name"], "stars": best["stars"]}

    return _cached(f"hotel:{city}:{country_code}:{checkin}:{checkout}:{style}", lookup)


# --- Places and climate (Open-Meteo, no key needed) ----------------------------------

def geocode(city: str, country: str | None = None) -> dict:
    city = city.split(",")[0].strip()  # "Sleepy Hollow, New York" -> the search wants just the name
    res = _request(f"https://geocoding-api.open-meteo.com/v1/search?{urlencode({'name': city, 'count': 10})}")
    results = [r for r in res.get("results") or [] if _same_place(r["name"], city)]
    if country:
        wanted = country.lower()
        results = [r for r in results
                   if wanted in (r.get("country", "").lower(), r.get("country_code", "").lower())] or results
    if not results:
        raise LiveError(f"Couldn't find a place called {city}. Try a nearby larger town.")
    best = results[0]
    return {"name": best["name"], "country": best.get("country", country or ""),
            "country_code": best.get("country_code", ""), "lat": best["latitude"], "lon": best["longitude"]}


def climate(lat: float, lon: float, year: int) -> dict:
    """Average daily high (°C) per month and the rainiest months, from one year of history."""
    params = {"latitude": lat, "longitude": lon, "start_date": f"{year}-01-01", "end_date": f"{year}-12-31",
              "daily": "temperature_2m_max,precipitation_sum", "timezone": "auto"}
    daily = _request(f"https://archive-api.open-meteo.com/v1/archive?{urlencode(params)}")["daily"]
    highs: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    rain = {m: 0.0 for m in range(1, 13)}
    for day, high, precip in zip(daily["time"], daily["temperature_2m_max"], daily["precipitation_sum"]):
        month = int(day[5:7])
        if high is not None:
            highs[month].append(high)
        rain[month] += precip or 0
    wettest = sorted(rain, key=rain.get, reverse=True)[:3]
    return {"temps": [round(mean(highs[m])) if highs[m] else 0 for m in range(1, 13)],
            "rainy_months": sorted(m for m in wettest if rain[m] >= 100)}
