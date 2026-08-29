# Zen

A civic-issue reporter: citizens sign in, drop a photo + GPS pin for a
pothole/garbage/streetlight/etc. issue, and see everyone's reports on a
shared map with live status and "time since reported."

## Stack

No build step — plain HTML/CSS/JS using native ES modules, loaded straight
from CDN (`esm.sh`, `unpkg`) at runtime. This was a deliberate choice: this
environment has no Node/npm available, so a Vite/React toolchain wasn't an
option. Everything is otherwise organized like a normal small app (`js/`
split into a data layer, views, router, and a shared state store).

- **Auth + database + photo storage:** Supabase (project `Hackathon`,
  already provisioned by your team — see `js/config.js` for the URL/key).
- **Map:** Leaflet + OpenStreetMap tiles (no API key needed).
- **Image recognition:** MobileNet (TensorFlow.js) running fully on-device
  in the browser to suggest a category from the photo. See the comment at
  the top of `js/imageRecognition.js` for the honest scope of what this
  does and doesn't detect.
- **Animation:** Anime.js v3, centralized in `js/animations.js`.
- **Offline:** a service worker (`service-worker.js`) precaches the app
  shell, and an IndexedDB queue (`js/offlineQueue.js`) lets a report be
  drafted with no signal and syncs it automatically once you're back
  online. See "Automated detection & clustering" below for scope notes.

## Running it

ES modules require a real HTTP origin (not `file://`). From this folder:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## What's in the database

Built on top of the existing `Hackathon` Supabase project's `profiles` /
`categories` tables (roles: `citizen` / `staff` / `admin`). Added:

- `reports` — one row per citizen report (photo, description, category,
  lat/lng + a generated PostGIS `geography` point, status, the on-device AI
  label if one was produced, and who/when).
- `feedback` — free-text app feedback with an optional 1–5 star rating.
- A `report-photos` storage bucket (public read, write scoped to the
  uploader's own folder).

RLS enforces the "no fake reports" requirement at the database level, not
just in the UI: a report can only be inserted with `reporter_id = auth.uid()`,
so every pin is cryptographically tied to a logged-in account. Anyone can
edit/delete their own report; `staff`/`admin` accounts can also update
status (open → in progress → resolved) or moderate/delete any report.

Also added:

- `reports.severity` / `severity_label` — an on-device heuristic (dark-area
  ratio + local contrast from the photo), not a measured dimension. See the
  comment in `js/imageRecognition.js` for the honest scope.
- `reports.cluster_id` + a `before insert` trigger (`assign_report_cluster`)
  — reports within 15m of an existing open report in the same category are
  folded into that report's cluster instead of becoming a new pin. A
  `before delete` trigger reassigns a cluster's master (and its
  confirmations) to the next-oldest member if the master itself is deleted,
  so a cluster can't be orphaned.
- `report_confirmations` — one-tap "still an issue?" confirmations against
  a cluster's master report (unique per user, so it can't be spammed).
- `report_tickets` — a `security_invoker` view exposing one row per cluster
  (its master report) with `duplicate_count`/`confirmation_count`. The map
  and "Nearby reports" list read from this view; "My reports" reads the raw
  `reports` table instead, since a citizen's own submission that got merged
  into someone else's cluster wouldn't be a view row (only masters are).

## Automated detection & clustering — scope notes

This build intentionally covers a subset of a larger feature spec (severity
scoring, clustering, crowdsourced confirmation, offline capture). Left out,
with the reason:

- **Passive drive-by (accelerometer) detection** — not attempted. A browser
  tab can read `DeviceMotion` only while open and foregrounded; true
  background sensing needs a native app.
- **Ward/jurisdiction auto-routing** — not attempted. Needs real municipal
  ward boundary GeoJSON for a specific city, which wasn't available.
- **Before/after photo similarity check on resolve** — not attempted this
  round.
- **Hazard-avoidance routing / public analytics dashboard** — not attempted
  this round.

## Known pre-existing items in the shared project (not introduced by this
build, flagged for the team)

- `public.spatial_ref_sys` (from PostGIS) has RLS disabled — a Supabase
  linter default warning, harmless read-only reference data, but worth a
  conscious decision from whoever owns that migration.
- The `postgis` extension lives in the `public` schema rather than a
  dedicated schema — Supabase recommends moving it, but that's a
  project-wide change outside this feature's scope.
- Leaked-password protection (HaveIBeenPwned checking) is off in Auth
  settings — a one-toggle fix in the dashboard, not something the tools
  available here can flip.
