# Phase K Batch 1 — onboarding + provider components (5 files, ~824 lines)

## Files fully read in this batch
- apps/mobile/app/onboarding.tsx (206)
- apps/mobile/src/components/provider/NewJobModal.tsx (351)
- apps/mobile/src/components/provider/NbiStatusBanner.tsx (121)
- apps/mobile/src/components/provider/CommissionBreakdown.tsx (147)
- apps/mobile/src/components/provider/EarningsChart.tsx (100)

## Findings

### CONFIRMATION-K04 (socket auth) — NewJobModal is silently broken downstream
**Where found:** apps/mobile/src/components/provider/NewJobModal.tsx:61-78
**Understood:** The modal listens to socket `new:job` event via `getSocket()`. Per CRIT-K04, socket.service.ts reads `accessToken` from the legacy unencrypted `storage` which is empty after auth-migration runs. Result: socket connection fires with `token=undefined`, server rejects, NewJobModal NEVER receives real-time `new:job` events. Provider misses every real-time job offer.
**Fix:** Same as CRIT-K04 — change `socket.service.ts:14` from `storage.getString('accessToken')` to `getAccessToken()` from `secure-storage.ts`. Fixing CRIT-K04 fixes this.

### MED-K15 — NewJobModal auto-decline uses ambiguous status transition
**Where found:** apps/mobile/src/components/provider/NewJobModal.tsx:105-107
```ts
mutationFn: (bookingId: string) =>
  updateBookingStatus(bookingId, 'cancelled_by_provider'),
```
**Understood:** When a provider receives a `new:job` notification (status presumably `requested` or `quoted`), the decline path sets status to `cancelled_by_provider`. But `cancelled_by_provider` is the OUTCOME of a provider cancelling a booking they had previously accepted. For a job they were OFFERED but never accepted, the correct transition is "decline offer" → status stays at `requested`/goes to `rematching` for a different provider. The current call may either fail server-side (illegal transition) or land the booking in a confusing state where the customer sees "cancelled" instead of "we're finding another provider".
**Fix:** Add a dedicated `POST /api/v1/bookings/:id/decline-offer` endpoint, OR allow `requested → rejected_by_provider` transition with a server-side rematching trigger. UI mutation should call that endpoint. Note: comment in code "Still dismiss — the backend will handle rematch" hints the intent is rematch, but the wire shape is wrong.

### POSITIVE — onboarding.tsx
- 3-slide carousel correctly removed SiguradoShield language per Phase 14 D04 pull (Bug 860 documented in comments).
- `storage.set('hasOnboarded', true)` writes to unencrypted MMKV — appropriate (non-sensitive flag, doesn't need encryption).
- No findings.

### POSITIVE — NbiStatusBanner.tsx
- Reads `/api/v1/provider/nbi-status` with 15-minute staleTime. Returns null when no data (fail-open).
- Three states: expiring (≤30d), expired, missing. Variant + body messages clear.
- testID for each state. Good for E2E testing.
- No findings.

### POSITIVE — CommissionBreakdown.tsx
- The COMPONENT itself is correctly built. Help modal explains line items. Accessibility labels.
- The bug is in the CALLER `earnings.tsx` (CRIT-K09 — hardcoded 12% feed).
- Component takes `lines: CommissionLine[]` from caller, correctly renders whatever it's given.

### POSITIVE — EarningsChart.tsx
- Pure RN bars, no svg dep (correctly avoids the victory-native peer-range conflict per comment).
- Per-bar accessibility label with date + amount.
- The bug is in the CALLER `earnings.tsx` (CRIT-K08 — hardcoded fake data feed).
- Component is clean.

## Cumulative Phase K progress: 82 / ~140 files (~10,624 lines)
