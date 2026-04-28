# Gate 3 — Pre-mortem (Phase 10)

## Production failure scenarios

1. **Socket reconnect storm** — if API restarts, all admin clients reconnect at once. Mitigation: socket.io built-in exponential backoff + the singleton hook means each client opens at most one socket.
2. **Stale `admin:global` membership** — abandoned tabs hold sockets indefinitely. Mitigation: `pingTimeout` from existing `platformConfig.socketPingTimeoutMs` cleans them up.
3. **Map tile rate limiting** — public OSM has fair-use limits. If admin team grows, switch to Mapbox/Maptiler.
4. **Leaflet default marker icons broken in Vite** — handled with explicit `L.Icon.Default.mergeOptions` patch in DispatchConsolePage.
5. **emit before io initialized** — `emitAdminEvent` is `io?.to(...)` so it's a no-op when null. Tested.
6. **Booking create succeeds but emit throws** — wrapped in try/catch + logger.warn; original booking returned to caller normally.
7. **Browser tab opens DispatchConsolePage but no `/admin/bookings?status=active` endpoint exists** — page handles fetch error gracefully (shows 0-marker map).
8. **Admin token rotation** — useAdminSocket subscribes to `useAuthStore.isAuthenticated` and tears down/recreates the socket if the user logs out. New token next login → next `getAdminSocket()` reads it.
9. **CORS** — existing socket.service.ts CORS uses `process.env.APP_URL`. Admin web origin must match this in prod or websocket handshake fails.
