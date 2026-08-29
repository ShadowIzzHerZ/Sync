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

## Live Access & Local Development

### Live Deployment
The application is deployed and accessible directly at:
- **Production URL:** [https://main.d1imzj8qyjdhxb.amplifyapp.com/](https://main.d1imzj8qyjdhxb.amplifyapp.com/)

### Running Locally
Because the app uses native ES modules and service workers, it must be served over HTTP (not directly via `file://`).

Using Python:
```bash
# Python 3
python -m http.server 5173
