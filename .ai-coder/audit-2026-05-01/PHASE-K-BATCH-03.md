# Phase K Batch 3 — pagination + status + icons (4 files, ~427 lines)

## Files fully read
- apps/mobile/src/components/PaginationLoader.tsx (53)
- apps/mobile/src/components/PulsingDot.tsx (88)
- apps/mobile/src/components/StatusBadge.tsx (88)
- apps/mobile/src/components/icons/index.ts (197)

## Findings

### MED-K17 — StatusBadge missing several real booking statuses; raw enum displayed
**Where found:** apps/mobile/src/components/StatusBadge.tsx:14-41
**Understood:** STATUS_MAP enumerates 12 statuses but the booking state machine and queries reference more states:
- `requested`, `quoted`, `payment_pending` (used in apps/mobile/app/(tabs)/bookings.tsx:39-43)
- `payout_ready`, `paid_out`, `resolved` (also referenced in jobs.tsx:46-50)
- `rematching` (mentioned in NewJobModal flow)

When the badge receives an unmapped status, line 49-53 falls back to `{ bg: divider, fg: textSecondary, label: String(status) }` — meaning it displays raw lowercase snake_case like `payout_ready`. This shipped per-screen color maps already in `bookings.tsx:38-58` and `dashboard.tsx:46-56` and `jobs.tsx:37-52` because StatusBadge isn't complete. The screens have parallel mapping, but the StatusBadge usages get the raw enum.

**Fix:** Add the missing statuses to STATUS_MAP with proper labels (e.g. `payout_ready: { ..., label: 'Paid out' }`). Alternatively, consolidate ALL status display logic into StatusBadge and remove the per-screen color maps in bookings/dashboard/jobs (delete the duplicated `getStatusColor` functions).

### POSITIVE — PaginationLoader.tsx
- accessibilityLabel="Loading more". Returns null cleanly when no more + not loading.

### POSITIVE — PulsingDot.tsx
- useNativeDriver:true on opacity + scale. Cleanup on unmount via loop.stop().
- Matches "live indicator" semantics on tracking screens.

### POSITIVE — icons/index.ts
- Pure re-export hub. Centralized icon module enforces no direct lucide-react-native imports elsewhere (per docstring).

## Cumulative Phase K progress: 91 / ~140 files (~11,658 lines)
