# Zen — Judge Prep

A study sheet, not a spec. Read this once before you demo and you should be
able to answer almost anything thrown at you. It's organized as: pitch →
demo script → **architecture (how it's actually wired together)** → how
each feature works → hard questions with real answers → what's deliberately
not built and why.

---

## 1. The 30-second pitch

> Zen is a civic issue reporter. A citizen photographs a pothole, overflowing
> bin, or dead streetlight; the app suggests a category and estimates
> severity **on-device**, drops a GPS pin at their real location, and puts it
> on a live public map. Every report is tied to a real signed-in account —
> no anonymous spam. Reports of the same issue within 15 meters
> automatically merge into one ticket instead of cluttering the map with
> duplicates, and anyone passing by can one-tap confirm "still an issue"
> to keep it prioritized. It works offline — a report drafted with no
> signal queues on the device and submits itself the moment you're back
> online.

If they only remember one sentence: **"It turns a phone photo into a
verified, deduplicated, trackable civic ticket — and it doesn't fall over
when you lose signal."**

---

## 2. Suggested live demo script (~3 minutes)

1. **Landing page** (`#/`) — show the pitch page, point out it's not just a
   login wall; it explains the product first.
2. **Sign up** with a real email/password — say out loud: *"this account
   requirement is the anti-fake-report mechanism, not just friction."*
3. **Report an issue**: click "+ Report an issue" →
   - Upload a photo → point out the **on-device AI suggestion** banner
     (category + confidence) and the **severity badge** appearing within a
     second, no network round-trip.
   - Note the location picker already has a pin dropped — **it asked for
     your location automatically** and you can still drag it anywhere.
   - Submit.
4. **Map view** — the new pin appears immediately with a status badge and
   "X minutes ago" timestamp.
5. **Submit a second report of the same issue** near the same spot → show
   the toast: *"Someone nearby already reported this — added your
   confirmation instead of a duplicate pin."* Point at the card: **"Reported
   2× · 1 confirmation"** instead of two separate pins.
6. **Tap "Still an issue?"** on someone else's report — one-tap crowd
   confirmation, disabled after you've done it once.
7. **Turn off Wi-Fi / airplane mode, submit a report** → it doesn't fail,
   it saves with a "saved offline, will sync automatically" toast and a
   **pending-sync pill** in the top bar. Turn Wi-Fi back on → it submits
   itself within seconds, no user action needed.
8. **Feedback page** — star rating + free text, quick showing of a
   secondary, less flashy but real feature.

That sequence hits: auth, AI, severity, geolocation, clustering,
crowdsourcing, and offline — the whole feature set — in under 3 minutes.

---

## 3. Architecture — how everything is actually wired together

This is the section to reread if a judge says "walk me through what
actually happens" or "show me the code" — every file/function named here
is real and exists exactly as described.

### 3.1 System diagram

```
┌────────────────────────────────────────────────────────────────────┐
│ BROWSER                                                             │
│                                                                      │
│ index.html                                                          │
│   loads css/styles.css, Google Fonts, Leaflet's CSS, then:          │
│   <script type="module" src="js/main.js">                          │
│                                                                      │
│ js/main.js  (the only entry point — everything starts here)         │
│   ├─ js/config.js        → builds the ONE Supabase client (used     │
│   │                         by every other file that talks to the   │
│   │                         backend)                                │
│   ├─ js/auth.js          → signup/login/session helpers             │
│   ├─ js/api.js           → EVERY database/storage read+write in the │
│   │                         app goes through this one file          │
│   ├─ js/state.js         → in-memory store: current session,        │
│   │                         profile, categories, loaded reports     │
│   ├─ js/offlineQueue.js  → IndexedDB queue + auto-flush on reconnect│
│   └─ js/router.js        → reads the URL hash, decides which view   │
│         to render, and re-renders when auth state actually changes  │
│         │                                                           │
│         ├─ js/views/landingView.js   → "/" when signed out          │
│         ├─ js/views/authView.js      → "/login", "/signup"          │
│         ├─ js/views/shell.js         → topbar/nav, wraps every      │
│         │                              signed-in page                │
│         ├─ js/views/mapView.js       → "/map" (the default)         │
│         │     └─ js/views/reportModal.js  → the "report an issue"   │
│         │           form, opened on top of the map                  │
│         │           ├─ js/imageRecognition.js (MobileNet, runs      │
│         │           │     entirely in-browser, no network call)     │
│         │           └─ js/confirmDialog.js, js/toast.js,            │
│         │                 js/animations.js (shared UI plumbing)     │
│         ├─ js/views/myReportsView.js → "/reports"                   │
│         └─ js/views/feedbackView.js  → "/feedback"                  │
│                                                                      │
│ service-worker.js — registered once by main.js, lives outside the   │
│   module graph above; only intercepts requests for the app's own    │
│   files (never Supabase or map-tile requests) so the app shell loads│
│   even with no signal                                                │
└────────────────────────────────────────────────────────────────────┘
        │                         │                          │
        │ supabase-js             │ Leaflet                  │ TensorFlow.js +
        │ (from esm.sh)           │ (from unpkg)              │ MobileNet (esm.sh)
        ▼                         ▼                          ▼
┌──────────────────────┐  ┌───────────────────┐   (runs fully client-side —
│ Supabase              │  │ OpenStreetMap      │    nothing sent anywhere
│  • Auth (users)       │  │ tile servers       │    for this step)
│  • Postgres + PostGIS │  └───────────────────┘
│    tables: profiles,  │
│    categories,        │
│    reports,           │
│    report_confirmations,
│    feedback           │
│    + report_tickets   │  (a VIEW, not a table — see 3.3)
│  • Storage: the       │
│    report-photos      │
│    bucket             │
└──────────────────────┘
```

**Nothing runs on a server we control.** The "backend" is entirely
Supabase (managed Postgres/Auth/Storage) plus static files served from a
folder — there is no custom API server. If asked "where's your backend
code," the honest answer is: *the business logic that has to be
trustworthy (who can insert what, where duplicates merge) lives in
Postgres itself — Row Level Security policies and triggers — precisely so
it can't be bypassed by a client that skips the UI.*

### 3.2 File-by-file map

| File | Responsibility |
|---|---|
| `index.html` | The only HTML page. Loads fonts, Leaflet's CSS, our CSS, then `main.js` as a module. |
| `js/main.js` | Boots the app: gets the current session, wires the router, registers the service worker, starts the offline-queue auto-flush, and re-renders on real login/logout (not on every silent token refresh — see 3.6). |
| `js/config.js` | Creates the single `supabase` client instance every other file imports. Holds the project URL + publishable key (safe to be public — it's the anon key, restricted entirely by RLS). |
| `js/state.js` | A plain object + subscriber list — the app's in-memory state (no Redux/etc., the app is small enough not to need it). |
| `js/api.js` | The data layer. Every `select`/`insert`/`update`/`delete` against Supabase lives here, nowhere else. |
| `js/auth.js` | Sign up, sign in, sign out, "wait for the profile row the database trigger creates." |
| `js/router.js` | Hash-based router (`#/map`, `#/reports`, etc.). Decides logged-in vs. logged-out view. |
| `js/offlineQueue.js` | IndexedDB-backed queue for reports submitted with no connection; flushes on load and on the `online` event. |
| `js/imageRecognition.js` | On-device MobileNet classification + the severity heuristic. No imports from `api.js` — it never touches the network. |
| `js/animations.js` | Every Anime.js animation in the app, centralized, including the `withTimeout()` safety net (3.7). |
| `js/confirmDialog.js` | The in-app replacement for `window.confirm()`, used for delete confirmations. |
| `js/toast.js` | Toast notifications. |
| `js/timeAgo.js` | "5 minutes ago" formatting + a 30-second ticker that keeps them fresh on screen. |
| `js/views/*.js` | One file per screen (landing, auth, map, report modal, my reports, feedback) plus `shell.js` for the shared topbar/nav. |
| `service-worker.js` | Precaches the app's own files so the shell loads offline. Explicitly ignores Supabase and map-tile requests — those still need a live connection. |

### 3.3 The database layer, precisely

- **`profiles`** — one row per user, `role` column (`citizen`/`staff`/`admin`). Created automatically by a trigger on `auth.users` insert — the app never inserts a profile row itself.
- **`categories`** — admin-managed list (Pothole, Garbage/Sanitation, Streetlight, Water/Drainage, Other).
- **`reports`** — the raw table. Every submission lands here, including duplicates. Key columns: `reporter_id`, `category_id`, `lat`/`lng`, a **generated** `location geography` column computed from `lat`/`lng`, `status`, `severity`/`severity_label`, and `cluster_id`.
- **`report_confirmations`** — one row per (report, user) "still an issue?" tap. Unique constraint stops double-confirming.
- **`report_tickets`** — a **view**, not a table: `select * from reports where id = cluster_id`, plus computed `duplicate_count` and `confirmation_count`. This is what the map and "Nearby reports" list actually query — it's already deduplicated. **"My reports" deliberately queries the raw `reports` table instead**, because a report that got merged into someone else's cluster is still something *you* reported, even though it's not a cluster master and therefore wouldn't appear in the view.
- All of it sits under **Row Level Security**. The rule that matters most for "no fake reports": the insert policy on `reports` requires `reporter_id = auth.uid()` — checked by Postgres itself, not the app.

### 3.4 Trace: what happens when you submit a report (online)

1. `reportModal.js` builds `reportData` from the form (category, description, lat/lng, and whatever `imageRecognition.js` produced).
2. `api.js`'s `uploadReportPhoto(userId, file)` uploads the photo to the `report-photos` Storage bucket, path-prefixed by the user's own ID (a storage policy only lets you write inside your own folder).
3. `api.js`'s `createReport({...})` inserts into `reports`.
4. **Before the row is written**, a Postgres trigger (`assign_report_cluster`) runs: it looks for an existing, non-resolved report in the *same category* within **15 meters** using `ST_DWithin` on the geography point built straight from the submitted `lat`/`lng`. If it finds one, the new row's `cluster_id` is set to that match's cluster — it becomes a duplicate, not a new pin. If not, `cluster_id` is set to its own `id` — it becomes a new cluster's master.
5. `createReport` then re-queries `report_tickets` for that `cluster_id` and returns `{ ticket, merged }` — `merged` is `true` if step 4 found a match.
6. `mapView.js` gets that result: if `merged`, the toast says *"someone nearby already reported this"* and the **existing** pin's `duplicate_count` just goes up; if not, a brand-new pin drops on the map with a bounce animation.

### 3.5 Trace: what happens when you submit a report offline

1. `reportModal.js`'s submit handler checks `navigator.onLine` (and separately catches network-shaped errors even if that check was wrong — e.g. a request that starts while online but fails mid-flight).
2. If offline: `offlineQueue.js`'s `queuePendingReport({...photoBlob: file})` stores the **entire submission, including the photo as a Blob**, in IndexedDB. Nothing touches Supabase yet.
3. The topbar's pending-sync pill (`shell.js`, subscribed via `onQueueChange`) updates immediately to show the queued count.
4. The moment the browser fires an `online` event (or the app is freshly loaded while already online), `startAutoFlush` in `main.js` calls `flushPendingReports`, which replays each queued item through the *exact same* `uploadReportPhoto` + `createReport` calls a normal online submission uses — so it goes through the identical clustering logic, RLS checks, everything. On success, the item is deleted from IndexedDB and a toast confirms it synced.

### 3.6 Trace: why the app doesn't rebuild itself on every token refresh

Supabase's `onAuthStateChange` fires for far more than login/logout — it
also fires on silent access-token refreshes (roughly hourly) and once
right after you subscribe to it. `main.js` explicitly checks whether the
**signed-in user actually changed** before re-rendering; if it's the same
user, it just updates the stored session token and returns. This mattered
in practice: an early version re-rendered on every such event, which
could tear down the Leaflet map mid-interaction. Worth mentioning if asked
about state-management decisions — it wasn't accidental, it was a bug we
found and fixed.

### 3.7 Trace: what protects the app if an animation never finishes

Every modal close and toast dismissal in the app is *supposed* to be
driven by an Anime.js animation finishing. But animations run on
`requestAnimationFrame`, which some browser conditions can stall (a
backgrounded tab, a device sleeping mid-transition). If that promise never
resolves, naively `await`-ing it before removing a modal from the DOM
would leave it stuck open forever. `animations.js` exports a
`withTimeout()` helper that races the real animation against a timeout, so
cleanup always happens even in the worst case — we hit this exact failure
mode during testing and hardened it rather than shipping the fragile
version.

### 3.8 If a judge says "show me the code" — where to click

| Topic | Open this |
|---|---|
| "No fake reports" enforcement | Supabase dashboard → Table Editor → `reports` → RLS policies (or `js/api.js`'s `createReport`) |
| Clustering logic | The `assign_report_cluster` Postgres function (Database → Functions in the Supabase dashboard) |
| Image recognition | `js/imageRecognition.js` |
| Offline queue | `js/offlineQueue.js` |
| The report form itself | `js/views/reportModal.js` |
| Routing / page structure | `js/router.js` |

---

## 4. How each feature actually works (so you can explain, not just demo)

### Authentication & "no fake reports"
- Supabase Auth, email + password. Every `reports` row requires
  `reporter_id = auth.uid()` — enforced by a **Postgres Row Level Security
  policy**, not a client-side check. Even a malicious actor calling the API
  directly, bypassing the UI entirely, cannot insert a report attributed to
  someone else or with no owner at all.
- Roles: `citizen` (default) / `staff` / `admin`, stored in a `profiles`
  table. `staff`/`admin` can change status or moderate any report; citizens
  can only manage their own.

### On-device image recognition
- Runs **MobileNet** (TensorFlow.js) fully in the browser — the photo never
  leaves the device for this step.
- **Honest scope**: MobileNet is a general 1000-class ImageNet classifier,
  not a model trained on potholes. We map the subset of its labels that
  plausibly correspond to civic infrastructure (manhole cover, trash can,
  traffic light, drain, etc.) onto our five categories, and fall back to
  "pick manually" when nothing matches well. If a judge asks "does it
  actually detect potholes" — the honest answer is *"it detects
  plausible-looking categories from a general object classifier and gets
  out of the way when it isn't confident; a production version would need
  a model fine-tuned on a labeled pothole/civic-issue dataset, which needs
  data we don't have."*

### Severity estimate
- A **canvas-based heuristic**, not a measurement: it looks at how much of
  the photo is a large dark/shadowed void (proxy for a deep hole) and how
  visually "rough" the frame is (contrast, proxy for cracking/debris).
  Produces Low/Medium/High.
- **Say this plainly if asked**: recovering a real pothole width/depth from
  a single 2D photo with no reference object is not a solved problem
  without a second camera angle or a known-size reference in frame. We
  built an honest triage signal instead of pretending to measure something
  we can't.

### Geospatial clustering (the deduplication engine)
- Postgres + PostGIS. Every `reports` row has a `cluster_id`. A
  `BEFORE INSERT` trigger checks: is there an existing, non-resolved report
  of the **same category** within **15 meters** (`ST_DWithin` on a
  `geography` point)? If yes, the new report's `cluster_id` points at that
  existing report instead of itself — it becomes a duplicate, not a new pin.
- A view (`report_tickets`) exposes one row per cluster — its "master"
  report — with a live `duplicate_count` and `confirmation_count`. The map
  and list read from this view, so duplicates never appear as separate pins.
- **Why 15 meters and category-scoped?** Tight enough that two different
  issues on the same block don't merge, loose enough to absorb GPS drift
  (consumer GPS is commonly ±5–10m). Category-scoped so a pothole and a
  streetlight outage at the same corner don't collapse into one ticket.

### Crowdsourced confirmation
- A `report_confirmations` table, one row per (report, user), unique
  constraint prevents the same person confirming twice. RLS: anyone
  authenticated can insert their own confirmation; nobody can insert one
  for someone else.

### Offline-first capture
- **Not** the Background Sync API (`SyncManager`) — deliberately. That API
  is Chromium-only and doesn't exist on Safari/iOS, and a civic reporter
  used on a phone has to work there too.
- Instead: if a submission can't reach the network, the whole thing
  (photo included, as a Blob) is stored in **IndexedDB**. It's flushed
  automatically on app load and again every time the browser fires an
  `online` event. Less magical than Background Sync, but it actually works
  cross-browser.
- A service worker also precaches the app shell (HTML/CSS/JS) so the app
  itself isn't a blank white screen with no signal — only report **data**
  needs a live connection, the app **shell** doesn't.

### "Time since reported"
- Plain relative-time formatting ("5 minutes ago"), refreshed every 30
  seconds on-screen, with the exact timestamp available on hover — small,
  but it's what makes the map feel alive rather than static.

---

## 5. Tech stack, and why

| Choice | Why |
|---|---|
| **Supabase** (Postgres + Auth + Storage) | One managed backend gets you a real relational database with **PostGIS built in** (needed for clustering), row-level security for the "no fake reports" guarantee, and file storage for photos — without standing up separate services. |
| **Leaflet + OpenStreetMap** | Free, no API key, no billing account needed — important for a hackathon judged on what actually runs, not what needs someone's credit card. |
| **Vanilla JS, native ES modules, no bundler** | This was actually an environment constraint (no Node/npm available where this was built), turned into a deliberate architecture: zero build step, the app runs by pointing any static file server at the folder. The code is still organized like a real app — a data layer (`api.js`), a router, per-view modules, a shared state store — not a pile of scripts. If asked "why not React," the honest answer is environment, but the follow-up is "and it turned out fine — there's no virtual DOM overhead for a UI this size, and there's nothing to `npm install` for a judge to run it." |
| **TensorFlow.js + MobileNet** | Free, no API key, runs entirely client-side — no server-side inference cost or latency, no photo ever needs to leave the device just to get a category guess. |
| **Anime.js** | Centralizes all motion in one file instead of scattered CSS transitions, so entrances/exits/toasts share one consistent feel. |

---

## 6. Hard questions, answered

**"How do you actually stop someone from spamming fake reports?"**
Three layers: (1) every report requires a real authenticated account,
enforced at the database level via RLS, not just the UI; (2) duplicate
reports of the same issue don't create noise — they merge into one ticket
and just raise its confidence; (3) crowdsourced confirmation means a fake
or stale report just... doesn't get confirmed by anyone else nearby.

**"Is the AI real or just for show?"**
It's real, on-device inference — but it's honestly scoped. It's a general
object classifier repurposed for category suggestion, not a custom-trained
pothole-detection model, and the severity score is a transparent image
heuristic, not a physical measurement. We'd rather say that plainly than
oversell it.

**"What happens to the data if someone deletes the 'main' report in a
cluster?"** We actually hit this as a real bug while testing: deleting a
cluster's master report was orphaning its duplicates and confirmations.
Fixed with a trigger that promotes the next-oldest report in the cluster
to master and re-points its confirmations before the row is gone — so a
cluster survives its original reporter deleting their submission.

**"Does this scale / what breaks at city scale?"** The clustering query is
a radius search on an indexed geography column — that scales fine into the
hundreds of thousands of rows with a GiST index (already in place). What
we'd add next for real scale: pagination/viewport-based loading on the map
(right now it loads all open tickets), and the ward-routing layer below.

**"Why didn't you build [ward routing / hazard-avoidance routing /
before-after photo verification / drive-by accelerometer detection / the
analytics dashboard]?"** These were explicitly descoped for this round,
each for a concrete reason, not laziness:
  - **Ward/jurisdiction routing** needs real municipal GIS boundary data for
    a specific city — we didn't have a dataset to point at honestly.
  - **Drive-by accelerometer detection** needs a native app; a browser tab
    only gets motion-sensor access while open and in the foreground, so
    true background detection isn't achievable as a web app.
  - **Before/after photo verification, the analytics dashboard, and
    hazard-avoidance routing** were prioritized below auth, clustering, and
    offline support for this pass — they're on the roadmap (see below), not
    abandoned.

**"What was the hardest bug you hit building this?"** Two, both from
Postgres trigger semantics, both caught by actually testing against the
live database instead of trusting the code: (1) `GENERATED` columns
compute *after* `BEFORE INSERT` triggers run, so a first version of the
clustering trigger compared against a column that was still `NULL` and
silently never clustered anything; (2) a `BEFORE DELETE` trigger updating
sibling rows conflicted with Postgres's own bulk-delete mechanics — fixed
by splitting the logic across `BEFORE`/`AFTER` triggers based on which
table each part touches. Section 3.4–3.7 above walks through these and a
couple of others in more depth in case they ask for specifics.

**"Could someone see other people's data they shouldn't?"** No — every
table has RLS. Citizens can only update/delete their own reports; profiles
are only visible to their owner or staff/admin; categories are
admin-managed. This was verified with the Supabase security linter, not
just assumed.

---

## 7. Roadmap (say this if asked "what's next")

1. Municipal ward/jurisdiction auto-routing once real GIS boundary data is
   available — auto-assign each report to the responsible department.
2. Before/after photo verification on resolve (perceptual similarity check
   before auto-closing a ticket).
3. A public transparency dashboard: SLA/turnaround tracking, a
   recurring-issue heatmap, CSV/GeoJSON export.
4. Hazard-avoidance routing (OSRM-based) for cyclists/two-wheelers to route
   around dense pothole clusters.
5. A native companion app specifically to unlock passive drive-by damage
   detection, which the web platform can't do in the background.

---

## 8. Quick-reference numbers

- Cluster radius: **15 meters**, same-category only.
- Severity: **3 levels** (Low/Medium/High) from a photo darkness+contrast
  heuristic.
- Roles: **citizen / staff / admin**.
- Categories seeded: Pothole, Garbage/Sanitation, Streetlight,
  Water/Drainage, Other.
- Offline queue: IndexedDB, flushed on load + on the browser's `online`
  event.
