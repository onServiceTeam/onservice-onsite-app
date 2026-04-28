# Gate 3 — Future Bugs (Phase 10)

1. **Reassign/Cancel/Message buttons are `window.alert` stubs** per phase spec. Real wiring needs Phase 11+ flows.
2. **No `alert:new` emitter** — alerts tail is empty until a future SLA-breach detector is wired.
3. **No `booking:gps_update` emitter** — no provider GPS ping endpoint or worker yet.
4. **No `provider:online`/`provider:offline` emitter** — no presence tracker.
5. **City-scoped admin rooms missing** — only `admin:global`. Adding city scope requires a `city_admin` role + per-user city_id column.
6. **Map tile provider is public OSM** — production should use Mapbox/Maptiler API key.
7. **`/admin/providers?online=true` endpoint may not exist** — page tolerates 404 with empty marker layer.
8. **Socket payloads contain bare IDs** — admin UI must independently fetch full booking/provider details on click. No batched detail fetch yet.
9. **Race between socket invalidation and current fetch** — TanStack Query handles this naturally but very rapid event bursts may cause flicker; consider `setQueryData` patches in a polish phase.
10. **Leaflet bundle size** — DispatchConsolePage chunk is 172.74 kB (gzip 54.06 kB). If many admin pages adopt maps, hoist to a shared chunk.
