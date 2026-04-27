# Future-Bugs Analysis — PHASE-02 (Icon Replacement)

## Most-likely 2-week bug

**A new transaction or notification type ships from the API and renders with the wrong fallback icon on the wallet / notifications screens.**

The icon-map pattern (`Record<string, IconComponent>`) is exhaustive *as of this commit*, but exhaustiveness is not enforced anywhere in the codebase. The next API change that adds a notification or transaction type without updating both customer and provider screens will silently render the fallback (`Bell` for notifications; `CreditCard` for transactions).

### Severity
Low — content text is correct, only the icon is wrong; no data corruption.

### Recommended guard
Add a unit test in Phase 04 (or whichever phase ships the next notification flow) that:

1. Imports the union of notification-type string literals from `@/services/notification.service`.
2. Imports the `NOTIFICATION_ICONS` map from each notification screen.
3. Asserts every type-string key exists in both maps.

Same shape for transactions (`@/services/payment.service` types vs the wallet/earnings screens).

This is exhaustiveness-as-test, which is appropriate because the type union is generated from the API contract and will change as the API does.

### Why not enforce now
Phase 02's scope is mechanical icon replacement, not contract testing. Adding the guard requires touching `apps/mobile/src/services/*` to expose the type union as a runtime array — that's API-shape work, owned by the phase that next changes the notification or transaction service surface.

## Secondary candidates

### Bug 2 — Style orphans accumulate

Some files retain unused `emptyIcon` / `errorEmoji` style entries from before the swap. A future ESLint pass with `react-native/no-unused-styles` enabled will flag dozens of these. No behavioral impact, but it adds noise to a future cleanup PR.

### Bug 3 — Bundle-shape regression on a future re-export change

If a contributor changes `apps/mobile/src/components/icons/index.ts` from `export { X } from '...'` to `export * from '...'`, Metro will lose its tree-shaking guarantee and bundle size will balloon by ~100 KB. The risk is very low (we have no reason to make that change) but the consequence is invisible unless someone monitors bundle size.

### Bug 4 — Visual gate false-confidence (carried over from pre-mortem #5)

Phase 02's visual gate PASS was satisfied by 5 PNGs of the unauthenticated admin landing surface. A future contributor may assume the visual gate's PASS implies authenticated UI was reviewed. This will be self-correcting at Phase 04 when an authenticated admin Playwright fixture is established.

## Recommended actions for the immediate next phase (Phase 03 — Runtime Config)

1. None blocking. Phase 03 (runtime config injection) does not touch UI surfaces; it cannot regress the icon work. Forward.
