# TripPop

An AI travel planner for iOS and Android, built with Expo and a Python backend running Claude.

- **Goal-based planning.** Describe a loose goal ("warm, 4 days, under $1,200"). The agent researches destinations, compares costs, and builds a day-by-day itinerary.
- **Background price watcher.** Checks flight and hotel prices on a schedule. It alerts you when a price hits your target or drops well below its recent trend.
- **Auto-hold with approval.** When a deal hits, the agent places a free hold. Nothing is booked until you tap **Approve & book**.
- **Travel profile.** Your budget style, pace, interests, and learned preferences shape every plan.
- **Post-trip feedback.** After a trip, the agent asks how it went and updates your profile on its own.
- **Live re-planning.** Report "it's raining" or "I'm tired" and it re-plans the day. Any reservation change waits for your approval.
- **Documents and deadlines.** Checks passport, visa, and entry rules from official sources using web search, then schedules phone reminders with lead time.
- **Affiliate links.** Flights (Skyscanner), hotels (Booking.com), and activities (GetYourGuide) link out with your partner IDs.

## Run it on the iPhone simulator

You need Xcode (with an iOS simulator), Node, and Python 3.10 or later.

```bash
npm install
npm run backend:setup                     # one time: creates backend/.venv
cp backend/.env.example backend/.env      # then add your ANTHROPIC_API_KEY

npm run backend                           # terminal 1: API on :8000
npx expo start --ios                      # terminal 2: opens the app in the iOS simulator
```

`npx expo start --ios` boots the Xcode simulator, installs Expo Go, and opens the app. Press `i` in the Expo terminal to reopen it and `r` to reload. To use a real phone, scan the QR code with the Camera app. The phone must be on the same Wi-Fi as your Mac.

The app finds the backend automatically through the Expo dev server's host. To point it somewhere else, set `EXPO_PUBLIC_API_URL`.

## How it's built

| Path | What it does |
| --- | --- |
| `backend/agent.py` | Claude agents (planning, re-planning, feedback, documents) with their tools |
| `backend/watcher.py` | Scheduled price checks, alert decisions, holds, trip lifecycle |
| `backend/providers.py` | Destination data, price quotes, affiliate link builders |
| `backend/store.py` | JSON-file storage (`backend/data/state.json`) |
| `src/app/` | Tabs (Plan, Trips, Calendar, Deals, Docs) in `(tabs)/`, plus the Profile sheet |
| `src/hooks/agent-activity.tsx` | Polls for new deals and schedules document reminders as notifications |

## Before going live

- **Prices are simulated.** `providers.quote_flight` and `providers.quote_hotel` return realistic, moving prices, but they aren't real fares. Swap in a real API such as Duffel or Amadeus (flights) or Booking.com or Expedia Rapid (hotels). Keep the same return shape.
- **Holds are simulated.** Approving a hold opens the partner site to finish checkout. For true airline holds, connect a booking API that supports hold orders and store its reference in `hold_reference`.
- **Notifications only work while the app is open.** Deal alerts and reminders appear as local notifications. Delivery when the app is closed needs push notifications, which require a development build (`eas build --profile development`).
- **One user, one file.** Add accounts and a database before shipping to others.
