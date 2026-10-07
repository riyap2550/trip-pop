# TripPop — Product Backlog

## P1 — Login & Authentication

**Goal**: Users can create accounts and securely access their trips across devices and sessions.

**Scope**:
- Email/password sign-up and login (Expo SecureStore for token)
- OAuth social login (Google, Apple — required for App Store)
- JWT-based auth header on all API requests
- Backend: user table, password hashing, token issue/refresh/revoke
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

## P3 — Social Sharing (Itineraries, Photos, Feedback)

**Goal**: Users can share completed or planned trips publicly or with friends, attach photos, and leave/read feedback for destinations.

**Scope**:
- "Share trip" generates a public read-only link (`trippop://trips/public/[id]`)
- Photo attachments on itinerary items (Expo ImagePicker + cloud storage)
- Community feedback/reviews per destination (aggregate ratings from `feedback` submissions)
- In-app social feed: "Friends recently went to…"
- Deep-link preview cards (Open Graph meta for web share)
- Privacy controls: public / friends-only / private per trip

**Why P3**: Drives organic growth and retention via social proof once the core planning loop is solid.
