# TripPop — Product Backlog

## P1 — Login & Authentication — **Done**

**Goal**: Users can create accounts and securely access their trips across devices and sessions.

**Scope**:
- Email/password sign-up and login (Expo SecureStore for token)
- ~~OAuth social login (Google, Apple — required for App Store)~~ *Deferred (Apple Sign In will be required before an App Store release if any third-party login is added)*
- JWT-based auth header on all API requests
- Backend: user table, password hashing, token issue/refresh/revoke
  - Client refreshes on 401 with token rotation (single-flight, so concurrent requests share one refresh)
  - All routes require auth except register/login/refresh/health/invite preview
- Route protection: redirect unauthenticated users to `/login`
- Profile screen wired to real user data (display name, avatar)

**Why P1**: Without auth, trips are device-local only. Blocks all social and multi-device features.

---

## P2 — Group Trips with Shared Calendar

**Goal**: Multiple travelers can co-plan a trip, see each other's additions to the itinerary, and coordinate on a shared calendar.

**Scope**:
- Create a trip and invite collaborators by a link and sending it to their number
- Real-time (or near-real-time) itinerary sync across devices
- Permission model: owner vs. viewer vs. editor roles
- Conflict UI: show who edited an item and when
- Shared calendar view highlights each collaborator's added items
- Push notifications when a collaborator makes a change
- Backend: trip membership table, event-sourced itinerary updates

**Why P2**: Core social hook of the app — solo planning is table stakes, group planning is the differentiator.

---

## P3 — Social Sharing (Itineraries, Photos, Feedback) — **In progress (partially done)**

**Goal**: Users can share completed or planned trips publicly or with friends, attach photos, and leave/read feedback for destinations.

**Done**:
- Friends: search by name or exact email, requests (accept/decline/cancel), remove
- Privacy controls: public / friends-only / private per trip (default friends; "friends" means friends of any traveler; owner changes it)
- In-app social feed: posts from you and your friends, following each trip's current privacy
- Social profiles with visible trips and stats; read-only shared trip view with no costs, notes, documents or chat
- "Share trip" sheet: post to feed, or share a plain-text summary outside TripPop
- Per-day trip photos (Expo ImagePicker), stored on the backend's local disk for dev

**Still open**:
- Cloud storage for photos (plus server-side thumbnails) before production
- Public web link with Open Graph preview cards (replaces the `trippop://trips/public/[id]` idea: app links aren't tappable in chat apps)
- Community feedback/reviews per destination (aggregate ratings from `feedback` submissions)

**Why P3**: Drives organic growth and retention via social proof once the core planning loop is solid.
