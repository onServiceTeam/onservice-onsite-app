# Gate 2 — Boundaries (Phase 09)

## Trust boundaries crossed

| Boundary | Where | Validation |
|---|---|---|
| HTTP req → service (admin) | `marketing-admin.routes.ts` | Each handler: parse + narrow; service throws 400 with `createAppError` on bad input. |
| Service → DB | `marketing-admin.service.ts` | Parameterized queries throughout (no string concat into SQL). |
| Service → audit | same | Every audit insert wrapped in try/catch + logger.warn. |
| Mobile → API | `services/api.ts` (axios default) | Best-effort POST in 4 new screens; failures show `Alert.alert` with friendly message. |
| Mobile → device camera | `expo-image-picker` | Try/catch around `launchCameraAsync`; permission request handled by SDK. |
| Mobile → maps deep link | `Linking.openURL` (`navigate.tsx`) | `canOpenURL` precheck + try/catch + Alert fallback. |
| Mobile → location | `expo-location` (`service-area.tsx`) | `getCurrentPositionAsync` wrapped; permission denial → Alert. |

## Auth model
- All marketing routes use `authMiddleware` + local `requireAdmin` / `requireSuperAdmin` helpers (mirrored from `booking-admin.routes.ts`).
- Reads = admin. Writes (POST/PATCH/deactivate) = super_admin.
- `req.user!.userId` extracted (NOT `.id`).

## SQL injection
All queries use `$1, $2, ...` parameter placeholders. `action_type` and `target_type` are SQL literals (not interpolated from user input).

## Data exposure
Service responses include:
- `promo_codes`: NEVER returns `created_by` user details (only the FK — frontend renders system label).
- `marketing_campaigns`: same.
- `getMarketingOverview`: aggregated counts/sums only.

## Mobile permission boundaries
- `identity-verification.tsx` requests camera permission via `expo-image-picker` (system dialog).
- `service-area.tsx` requests location permission via `expo-location` (system dialog); denial gracefully degrades to manual map drag.
- `navigate.tsx` opens external app via `Linking` — no permission needed.

## Sacred files touched
- `packages/api/src/server.ts`: routes mount only (5 lines added BEFORE generic `/api/v1/admin`).
- `apps/admin/src/App.tsx`: lazy import + route only (2 lines added).
- `apps/mobile/app/provider/job/[id]/checklist.tsx`: full replacement of pre-existing template stub with spec-compliant implementation. Old impl had no money math, no audit, no escrow integration — replacement is purely UI-side.

No money math in escrow/orders/booking flows was modified this phase.
