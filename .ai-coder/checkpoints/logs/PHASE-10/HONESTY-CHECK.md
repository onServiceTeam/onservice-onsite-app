# Phase 10 — Honesty Check (Real-Time Dispatch Console)

## Mandate
Build the missing dispatch console — a real-time view of every active booking with provider locations on a map, plus wire socket.io to admin pages so dashboard, dispute queue, and booking list update without manual refresh.

## What was actually delivered

### Backend (packages/api)
- `src/services/socket.service.ts` — APPENDED only:
  - admin role auto-joins `admin:global` room on socket connection
  - `emitAdminEvent(event, data)` exported helper
  - `ADMIN_EVENTS` const with all 9 documented event names
  - `_setIoForTest(io)` test helper
  - No existing lines removed; messaging/chat behavior byte-identical
- `src/services/booking.service.ts` — 2 best-effort emit hooks (try/catch + logger.warn):
  - `createBooking` → emits `BOOKING_CREATED`
  - `transitionBookingStatus` → emits `BOOKING_STATUS_CHANGED`
- `src/services/dispute.service.ts` — 1 emit hook:
  - `fileDispute` → emits `DISPUTE_FILED`
- `__tests__/socket-admin.test.ts` (246 LOC, 14 tests): emitAdminEvent target/payload, no-op when io null, ADMIN_EVENTS keys+values, admin-role joins admin:global, non-admin does not.

### Admin frontend (apps/admin)
- `src/lib/use-admin-socket.ts` (132 LOC): singleton socket, generic `useAdminSocketEvent<T>`, `useAdminSocketStatus`. Reads JWT from `localStorage.admin_token` (matches `lib/api.ts` convention).
- `src/pages/DispatchConsolePage.tsx` (472 LOC): Leaflet/OSM map, status-colored booking markers, online provider markers, side panel with bookings list + alert tail. Filters: city/status/service. Live counters. Alerts tail listens to `alert:new`.
- `src/App.tsx`: lazy DispatchConsolePage + `<Route path="/dispatch">`.
- `src/components/Sidebar.tsx`: "Dispatch" entry between Bookings and Catalog with `Activity` icon.
- `src/pages/BookingsPage.tsx`: `useAdminSocketEvent('booking:status_changed')` → invalidates `['adminBookings']`.
- `src/pages/DisputesPage.tsx`: `useAdminSocketEvent('dispute:filed')` → invalidates `['adminDisputes']`.
- `src/pages/DashboardPage.tsx`: `useAdminSocketEvent('alert:new')` → invalidates `['dashboard-alerts']`.
- `package.json`: added `socket.io-client@4.8.1`, `leaflet@1.9.4`, `react-leaflet@4.2.1`, `@types/leaflet@1.9.12` (all `--legacy-peer-deps`).

## What was NOT delivered (carried forward)
- **City-scoped admin rooms (`admin:city:<id>`)** — only the global room is implemented. City-scoped admin role doesn't exist in this DB yet.
- **`alert:new` emit hook** — no service yet emits this event. Frontend listens, but the firehose is empty until a future phase wires alerts (e.g. SLA breach detector).
- **`booking:gps_update`** — no service emits; would require provider mobile to ship GPS pings to a new endpoint.
- **`provider:online`/`provider:offline`** — no presence tracker yet.
- **Reassign/Cancel/Message buttons in side panel** are `window.alert('Phase 10 stub: ...')` per spec; real wiring belongs to Phase 11+.
- **Map tile provider** uses public OSM. Mapbox/Maptiler API key not added; OSM is fine for low traffic but fair-use for production.
- **Provider list endpoint** `GET /admin/providers?online=true` may not exist; the page handles 404 by showing empty marker layer.

## Sacred-file touches
- `socket.service.ts` — APPEND-ONLY. Verified by reading the diff: 0 deletions, only additions after the existing exports.
- `booking.service.ts`, `dispute.service.ts` — additive try/catch hooks at success paths only. Money math unaffected.
- `App.tsx`, `Sidebar.tsx`, `BookingsPage.tsx`, `DisputesPage.tsx`, `DashboardPage.tsx` — small additive edits (≤10 lines each) for socket invalidation.

## Money math
None changed. All emit hooks fire AFTER the original return path in their respective service functions.

## Verification
- `packages/api` tsc / eslint / jest: 749/749 pass (was 735; +14 socket-admin tests).
- `apps/admin` tsc / eslint / build: success (DispatchConsolePage chunk 172.74 kB, gzip 54.06 kB).
- repo-root `npm run lint`: clean (`exit 0`).
