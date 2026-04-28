# Gate 3 — Pre-mortem (Phase 09)

## What could go wrong in production?

1. **Promo code abuse**: `usage_limit_per_customer` is stored but NOT enforced this phase (no checkout integration). Mitigation: don't ship promo codes publicly until Phase 10+ adds per-customer redemption tracking.
2. **Campaign attribution accuracy**: `attributed_signups` / `attributed_first_bookings` / `attributed_revenue_centavos` are manually entered by admin. No auto-attribution. CPA / ROI displayed are only as accurate as the manual entry.
3. **Mobile camera permission denial silent**: `expo-image-picker` prompts the user; if denied, screens show generic "Could not open camera" Alert. No deep-link to settings yet.
4. **Service-area save with no map interaction**: provider could save default coordinates (14.6042, 121.0421 = Quezon City fallback). Mitigation: backend should validate lat/lng bounds (in Phase 10 provider service, not added here).
5. **Identity-verification base64 upload size**: `validateIdImage` checks > 8MB warning but does NOT block. A 30MB upload would still POST and might fail at server gateway (which is fine — 413 returned).
6. **Background-check status hook is a stub** (`useBackgroundCheckStatus` defaults to "pending"). Real wiring lives in a future provider-onboarding service. Until then, screen always shows pending.
7. **`navigate.tsx` "Mark Arrived" endpoint may not exist yet** in some envs — caught with try/catch; user sees Alert and remains on screen.
8. **Checklist replacement removes previous template logic**: any user that depended on the old (template-based) `checklist.tsx` will see a different UI. There is no production data on the screen state (purely client-side).
9. **`/api/v1/providers/me/skills` and `/api/v1/providers/me/service-area` may not exist yet** — same try/catch + Alert fallback.

## Counter-mitigations
- All best-effort POSTs from mobile use try/catch + Alert; never crash the screen.
- All admin writes go through 400-validation before touching DB.
- 33 test cases covering every validation branch + the audit-failure-non-fatal path.
