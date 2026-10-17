# Google address search: switching it on

Written 2026-10-18 (D24 Option A, D41 Q16). Public file: it names no server address, no key and no place where a key is kept.

**What it is.** The API can now ask Google for address suggestions while a customer types, turn the suggestion they pick into an address, and turn a map pin into an address (`packages/api/src/services/geo/address-search.service.ts`; POST routes under `/api/v1/geo` with the details in a JSON body, never in the URL). Everything it returns is a prefill: the customer can edit every field before saving. The phone and web app do not call it yet; that is a later batch.

**State on 2026-10-18.** Built and tested with mocked Google answers only. Billing on Ken's Google Cloud project was off, so no real call has worked yet. Until the steps below are done, `GET /api/v1/config` reports `addressSearchAvailable: false` and the app keeps its current picker.

## What Ken does in Google Cloud

1. Turn billing on for the project.
2. Make sure **Places API (New)** and **Geocoding API** are enabled.
3. Make a **server key** for this, separate from the Android map key in the APK. Restrict it to those two APIs. An IP address restriction to the tester server is possible; the address itself is in the private records, not here.
4. Optional but sensible: a budget alert on the project, so Google emails Ken if spending passes an amount he picks. The app's own daily cap (below) is a second guard, not a replacement.

## Switching it on (tester server)

1. Put the key in the server's environment file as `GOOGLE_MAPS_SERVER_KEY=<the key>`. Never put it in the repo, a chat, a commit message or a log. `.env.production.example` keeps the line empty on purpose.
2. Recreate the API container so it reads the file again. Use the release helper for the commit that is already live, not a plain restart: `scripts/server/activate-api-release.sh` from the live checkout, with `ONSERVICE_RELEASE_SHA` set to the full 40-character live commit (the helper refuses anything else, and checks that the live image for that commit is loaded; see `docs/runbooks/tester-server-release.md`, step 2). It only touches the API service and waits for the readiness check. Not yet tried on the server: if Compose reports the API as unchanged, the new value was not picked up; stop and check before doing anything else.
3. Check the public config: `curl -fsS https://app.onservice.ph/api/v1/config` must show `"addressSearchAvailable":true`.
4. Check the admin page: System Settings, category "Dispatch & map". The "Google address search" card must say "Server key: Set" and "Working". If it says "Paused until ...", Google refused a call; the word after "Google answered" says why (for example `REQUEST_DENIED` or `PERMISSION_DENIED` usually means billing or the API is still off, or the key is restricted to the wrong APIs).
5. Signed out, `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' https://app.onservice.ph/api/v1/geo/autocomplete` must answer `401`.

To switch it off without touching the server: set "Address search (Google)" to Disabled in System Settings. Removing the key and recreating the API also switches it off.

## Limits (all editable in System Settings, Dispatch & map)

These are engineering defaults Ken has not set. Each can be changed by a super admin, with a reason, and takes effect within about a minute.

| Setting | Default | What it does |
|---|---|---|
| Address search (Google) | On | Off: no Google calls; the app keeps its picker. With no key it is off anyway. |
| Address suggestions per user per day | 60 | Suggestion lists one user can get per Manila day. |
| Address lookups per user per day | 30 | Chosen suggestions plus map-pin lookups per user per Manila day. |
| Google address calls per day (all users) | 500 | Bill guard: every Google address call, all users together, per Manila day. |
| Address search time limit | 3000 ms | A slower Google call is abandoned and the customer types the address. |
| Address search pause after a Google refusal | 10 minutes | After Google refuses a call, times out or cannot be reached, no calls for this long. |

Over a cap the API answers 429 and the app falls back to typing the address. A cap set to 0 answers 503 ("unavailable") instead. Once the all-users cap is reached, or set to 0, or both per-user caps are 0, `GET /api/v1/config` says `addressSearchAvailable: false` and the status card says so. Counts restart at midnight Manila time.

**How the pause works.** The pause starts when the first refusal (or slow or failed answer) comes back. Calls already on their way to Google at that moment still reach it; the daily caps bound such a burst. One slow answer also pauses search for every user for the pause time.

## What is not checked

- No live call to Google has succeeded. The Philippine address mapping (which Google field holds the barangay, and the Metro Manila province) is written from Google's documents and public examples and is marked UNVERIFIED in the code until real answers are seen.
- Google's prices and free monthly amounts were not checked; read them on the project's billing page.
- The privacy notice does not yet say that typed addresses and map pins are sent to Google. That wording needs the attorney (`LAUNCH-LIMITATIONS.md` section 140).
- Google's terms on using its results with a non-Google map, and on keeping and sharing addresses that started as a Google prefill, are open questions for Ken and the attorney (`LAUNCH-LIMITATIONS.md` section 140).

## For the app batch

The app does not call these routes yet. When it does:

1. Ask for suggestions only after the customer pauses typing (for example 300 ms) and has typed at least 3 characters. Every call counts toward the per-user daily caps, and also toward the app-wide request limit per user (100 requests per 15 minutes by default, admin-editable; `packages/api/src/middleware/rate-limit.middleware.ts`), so a call on every keystroke could lock a customer out of the whole app for a while.
2. Make one session token (a version 4 UUID, 36 characters; the API refuses anything longer) per search, send it with each suggestion call, and end the search with the place call using the same token. Then start a new token. Google bills a search session as one unit only this way.
3. Show search only while `GET /api/v1/config` says `addressSearchAvailable: true`. On a 503, hide search for that screen visit; on a 429, hide it for the rest of the day. In both cases the customer types the address.
4. Send everything in the POST body, with coordinates as JSON numbers and only the documented fields (`q`, `sessionToken`, `lat`, `lng`, `placeId`); any other field is refused with 400. Never put what the customer typed, their pin or a place ID in a web page URL: the web app's address bar ends up in the Referer header and in web server logs.
5. Show Google's attribution (the Google logo, or the words "Google Maps") next to the suggestions, because the web app shows them without a Google map.
6. Treat every returned field as a prefill the customer can edit. Whether a saved address may keep Google's text and coordinates is open (`LAUNCH-LIMITATIONS.md` section 140).
