# Escalation E01 — Customer signature image persistence

**Date raised:** 2026-05-02
**Raised by:** Claude (Phase E CRIT-103/104 cleanup)
**Status:** RESOLVED 2026-05-02 — Ken authorized "do all recommendations waiting for Ken" → Option A landed.
**Resolution:** react-native-signature-canvas + expo-file-system added to apps/mobile/package.json. New `apps/mobile/src/components/SignaturePad.tsx` wraps the canvas with an imperative ref + onCapture(file://uri). complete.tsx replaces the PanResponder dot canvas with SignaturePad and uploads the PNG via the existing /api/v1/uploads/booking-signature endpoint with signatureType='customer_acceptance'. booking_signatures rows now land for every completed job. Tests: extended e-crit102-complete-photos.test.ts (+8 assertions) plus new signature-pad-component.test.tsx (+3 behavioural assertions exercising the mocked WebView + FileSystem path).
**Related code:** `apps/mobile/app/provider/job/[id]/complete.tsx`, `apps/mobile/src/components/SignaturePad.tsx`

## The hard stop

CLAUDE.md hard-stop rule #3 — architectural decision (new external dependency)
that the spec is silent on. I'm writing this rather than picking a default
because the choice has long-term cost implications (bundle size, audit
surface, infra) and you're the only call.

## What's broken

`apps/mobile/app/provider/job/[id]/complete.tsx` collects a customer
signature via `PanResponder` as an array of `{x, y}` points. The
`booking_signatures` table (migration 079, line 78) requires
`storage_key TEXT NOT NULL` — i.e., a real file in S3. The screen has
never converted the points to an image, so:

- Pre-fix: nothing was uploaded; the screen submitted to a 404 endpoint
  anyway, so the data went nowhere.
- Post-fix (CRIT-102 in this same commit): photos now upload + the
  transition lands, but the signature visual STILL isn't persisted.
  The `signedAt` timestamp + presence-of-strokes is captured locally,
  but no row goes into `booking_signatures`.

For audit / dispute defence the customer signature is the legal proof
that the customer accepted the completed work. It needs to be persisted
as an image, not just "signature captured locally" UI state.

## The three viable paths

### Option A — Add `react-native-signature-canvas` to mobile

- **Where:** `apps/mobile/package.json`
- **Bundle:** ~80kb gzip, well-maintained, MIT
- **What changes:** Replace the PanResponder + dot-rendering JSX with a
  `<SignatureCanvas onOK={(base64Png) => ...}/>`. Library returns a
  base64 PNG via callback; write to temp file via expo-file-system,
  upload via existing `/api/v1/uploads/booking-signature` endpoint
  (already exists, takes multipart PNG, accepts `signatureType`).
- **Pros:** No backend changes. Real PNG bitmap. Works on iOS + Android.
- **Cons:** New mobile dep. WebView-based — slight render lag on older
  Android devices.

### Option B — Add `react-native-view-shot` to mobile

- **Where:** `apps/mobile/package.json`
- **Bundle:** ~30kb gzip, but pulls a native module (rebuild required)
- **What changes:** Wrap the existing PanResponder canvas in
  `<ViewShot ref={...}/>`, call `captureRef()` on submit to get a
  PNG file URI, upload via existing endpoint.
- **Pros:** Smaller dep. Keeps existing custom PanResponder UI (no
  WebView render). Works for any future "screenshot the canvas" needs.
- **Cons:** New mobile native module → triggers EAS rebuild + Expo
  config-plugin work. Also somewhat overkill for one use case.

### Option C — Add `sharp` to backend, send SVG from client

- **Where:** `packages/api/package.json` (sharp), plus a new mobile path
  to render points to SVG string.
- **What changes:** Mobile renders points to SVG path string via
  `react-native-svg` (already installed), POSTs SVG body to a new
  `/api/v1/uploads/booking-signature-svg` endpoint. Backend uses
  `sharp` to rasterise SVG → PNG, then writes to S3 + booking_signatures
  exactly like the existing flow.
- **Pros:** No mobile native module. Re-usable server-side rasteriser.
- **Cons:** sharp is a 10MB native binary on the server with a libvips
  dependency — Lambda cold-start hit, larger Docker layer. New backend
  validators + route. More moving parts to test.

## My recommendation

**Option A (`react-native-signature-canvas`).** Lowest total surface
area: one mobile dep, no backend changes, no new native module rebuild,
no Lambda binary impact. The existing `/api/v1/uploads/booking-signature`
endpoint accepts the PNG verbatim. Bundle cost is acceptable given
the legal value of having a real signature on file for disputes.

If you want to avoid even one new mobile dep, Option C is the runner-up
— it concentrates the change in the backend where we already control
deploys.

## What I did in the meantime

Landed CRIT-102 (real photo upload + correct status PATCH) without
touching the signature path. Screen still captures the signature points
locally and shows the "Signed at HH:MM" UI, but does NOT yet hit the
backend with the visual. Submit succeeds (transitions booking to
`completed_by_provider` and uploads the after-photos) but the
booking_signatures row will be missing for the customer_acceptance type
until you pick a path above.

## What I need from you

Reply with `A`, `B`, or `C` (or another option I haven't considered).
On hearing back I'll land the chosen path with a real test that asserts
the row lands in booking_signatures with a non-null storage_key.
