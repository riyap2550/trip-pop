@AGENTS.md

# TripPop — Project Guide

## Stack

| Layer | Technology |
|-------|-----------|
| Mobile framework | Expo 57 + React Native 0.86 |
| Language | TypeScript 6 (strict mode) |
| Routing | Expo Router (file-based, typed routes) |
| Animations | react-native-reanimated 4 |
| Fonts | Cormorant Garamond (serif headings), system sans for data |
| Backend | FastAPI + Uvicorn (Python) |
| AI | Anthropic SDK (Claude agent for trip planning) |
| Build | EAS Build / bun |

## Folder Structure

```
src/
├── app/                    # Expo Router screens — every file is a route
│   ├── (tabs)/             # Bottom tab navigator
│   │   ├── index.tsx       # "Plan" tab — trip creation wizard
│   │   ├── trips/          # Trip list + detail
│   │   ├── calendar/       # Itinerary calendar view
│   │   ├── deals/          # Price watches & holds
│   │   └── docs/           # Travel document checklist
│   ├── chat/[id].tsx       # Chat modal (talks to Claude agent)
│   ├── edit-trip/[id].tsx  # Trip editor sheet
│   ├── edit-item/[id].tsx  # Itinerary item editor
│   ├── feedback/[id].tsx   # Post-trip rating modal
│   └── profile/            # User settings
├── components/
│   ├── ui/primitives.tsx   # Design system: Screen, Card, Button, Input, Segmented
│   └── ...                 # Feature components (calendar, hold-card, itinerary-item, …)
├── hooks/
│   ├── use-api.ts          # Fetch + focus-refetch + polling
│   ├── use-job.ts          # Polls a background Job until done (1.5s interval)
│   └── agent-activity.tsx  # Context: approval badges, feedback prompts
├── lib/
│   ├── api.ts              # Type-safe fetch wrapper + all endpoint functions
│   ├── data-events.ts      # Pub/sub for cross-screen cache invalidation
│   └── ...                 # dates, calendar, labels, plan-filters utilities
└── constants/
    ├── theme.ts            # Colors (navy/ocean/seafoam/sand), Spacing scale, font names
    └── navigation.ts       # Header style presets

backend/
├── main.py                 # FastAPI routes + async job queue
├── agent.py                # Claude-powered trip planning agent
├── providers.py            # Flight/hotel/booking API integrations
└── watcher.py              # Background price-watch job
```

## Key Patterns

**Data fetching**: `useApi(api.someMethod)` returns `{ data, error, refreshing, refresh }`. Screens own their own data — no shared cache.

**Long tasks**: Claude agent calls return a `Job`. Poll with `useJob(id)` (1.5s) until `status === 'done'`.

**Cross-screen updates**: Call `emitDataChanged()` after mutations; `useApi` listeners refetch automatically.

**Global badges**: `useAgentActivity()` provides `pendingApprovals`, `openDocs`, `tripsAwaitingFeedback`. Polls every 30s.

**No Redux/Zustand** — Context for truly global state (activity badges + theme), local `useState` everywhere else.

## Design System

- **Colors**: `Colors.light.*` / `Colors.dark.*` from `src/constants/theme.ts`. Access via `useTheme()`.
- **Spacing**: `Spacing.half` (2) → `Spacing.six` (64). Never use magic numbers.
- **Typography**: `<ThemedText type="title|heading|accent|small">` — serif for headings, system for data.
- **Styling**: `StyleSheet.create()` only. No CSS-in-JS.

## Naming Conventions

- Component/hook files: `lowercase-kebab-case.tsx`
- Types: `PascalCase`
- Hooks: `use*` prefix
- Screens (in `app/`): `index.tsx` per directory, or `[id].tsx` for dynamic routes

## Backend Notes

- CORS open (all origins) — dev only, tighten before production.
- All AI planning is async: client posts → gets Job ID → polls until done.
- Data persisted in `backend/store.py` (simple JSON file store — no database yet).
