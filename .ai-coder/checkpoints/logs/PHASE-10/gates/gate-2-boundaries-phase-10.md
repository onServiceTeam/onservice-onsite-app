# Gate 2 — Boundaries (Phase 10)

## Trust boundaries

| Boundary | Where | Validation |
|---|---|---|
| Browser → socket.io server | `io.use` JWT verify (existing logic, unchanged) | Rejects missing token, invalid signature, `pre_auth_2fa` and `refresh` token types. |
| Socket → admin room | new join in `connection` handler | Only `admin` or `super_admin` role joins `admin:global`. Non-admin sockets cannot listen to admin events. |
| Admin event payloads | `emitAdminEvent(event, data)` | Caller's responsibility — service hooks send only IDs, status strings, money totals. NO PII (no addresses, no full names, no phone). |
| Frontend → admin socket | `getAdminSocket()` reads `localStorage.admin_token` | Token expiry handled by server-side `io.use` rejection. |
| Service emit hook → io | each is wrapped in try/catch | Failure logged at warn; never throws back to caller. |

## SQL injection
N/A — no new SQL this phase.

## Data exposure
- `booking:created` payload: `{id, status, customerId, providerId, totalCentavos}` — IDs only, no PII.
- `booking:status_changed` payload: `{id, oldStatus, newStatus}` — IDs only.
- `dispute:filed` payload: `{id, bookingId, status}` — IDs only.

If admin socket is intercepted by a customer/provider role attempting to MITM or replay, the `io.use` middleware rejects the connection before it can join `admin:global`.

## Sacred files
- `socket.service.ts` — verified diff is APPEND-ONLY (0 deletions). Existing chat/messaging behavior byte-identical.
- `booking.service.ts`, `dispute.service.ts` — additive try/catch blocks AFTER the original successful return path. Money math unchanged.
