# Phase D Findings Part 10 — Mobile services bulk

Files added in this batch (full reads):
- `apps/mobile/src/services/recurring.service.ts` (129)
- `apps/mobile/src/services/booking-photo.service.ts` (166)
- `apps/mobile/src/services/catalog.service.ts` (59)
- `apps/mobile/src/services/review.service.ts` (74)
- `apps/mobile/src/services/tip.service.ts` (31)
- `apps/mobile/src/services/pricing.service.ts` (59)
- `apps/mobile/src/services/rebooking.service.ts` (55)
- `apps/mobile/src/services/slot-waitlist.service.ts` (45)
- `apps/mobile/src/services/messaging.service.ts` (70)
- `apps/mobile/src/services/upload.service.ts` (64)
- `apps/mobile/src/services/data-management.service.ts` (51)
- `apps/mobile/src/services/compliance.service.ts` (44)
- `apps/mobile/src/services/address.service.ts` (63)
- `apps/mobile/src/services/provider.service.ts` (76)

Plus targeted Grep verifications against server route mounts:
- `app.use('/api/v1/messaging', messagingRoutes)` (server.ts:235) vs mobile calls `/api/v1/conversations/...` — **MISMATCH**
- `/api/v1/recurring`, `/api/v1/uploads`, `/api/v1/account/*`, `/api/v1/compliance/dsr`, `/api/v1/promotions/active`, `/api/v1/catalog`, `/api/v1/reviews/*`, `/api/v1/tips/*`, `/api/v1/bookings/{pricing-preview, upcoming-holidays, history/rebookable, slot-waitlist, :id/rebooking-suggestions}` — all **VERIFIED**
- `/api/v1/addresses` — verified
- `/api/v1/providers/:id` — verified

**Phase D running total: ~14,953 lines fully read.**
**Audit grand total: ~34,627 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-95)

### CRIT-96 — Mobile messaging service hits `/api/v1/conversations/*` but server mounts at `/api/v1/messaging` — entire chat REST surface 404s
**Files:**
- [apps/mobile/src/services/messaging.service.ts:25-69](apps/mobile/src/services/messaging.service.ts#L25) — every call uses `/api/v1/conversations/...`
- [packages/api/src/server.ts:235](packages/api/src/server.ts#L235) — `app.use('/api/v1/messaging', messagingRoutes)`

```ts
// Mobile (messaging.service.ts):
api.get('/api/v1/conversations')                              // 404
api.post('/api/v1/conversations', { bookingId })              // 404
api.get(`/api/v1/conversations/${id}/messages`)               // 404
api.post(`/api/v1/conversations/${id}/messages`, {...})       // 404
api.post(`/api/v1/conversations/${id}/read`)                  // 404
api.get('/api/v1/conversations/unread/count')                 // 404
```

**Customer impact (compounded with CRIT-85 / CRIT-91):**
- CRIT-85 / CRIT-91: socket.io chat is broken on Bug-1061-migrated devices because the socket reads the legacy MMKV token. So real-time delivery fails.
- The chat screen at `customer/chat/[id].tsx:147` calls `sendMessageApi` (REST) as a fallback. This also fails because the REST URL doesn't exist.
- Customer can neither send nor receive messages. The chat screen shows "Setting up chat…" → empty list → typing a message → "Send Failed" alert.

This is the **second URL drift** (CRIT-71/78 was wallet, this is messaging). Same root cause: mobile and server were written by different humans/sessions and never wired against each other. There is no integration test that calls the mobile service against a running server.

**Fix dispatch:**
```
1. Decision: pick ONE canonical URL. Server already lives at
   /api/v1/messaging. Easier fix: rename mobile calls.
2. Replace 6 lines in messaging.service.ts:
       /api/v1/conversations          → /api/v1/messaging
       /api/v1/conversations/${id}/*  → /api/v1/messaging/${id}/*
       /api/v1/conversations/unread/count → /api/v1/messaging/unread/count
3. Verify chat/[id].tsx and any other caller (Grep for the old paths)
   — there should be none, the service wraps it.
4. Add an integration test: spin up the mobile MSW handler against the
   real server route table (or mock the api client and assert the URL
   path argument matches the regex /^\/api\/v1\/messaging/).
5. Add a CI guard that diffs the set of URLs in mobile services against
   the set of mounts in server.ts. Mismatches fail the build. This
   prevents the next URL-drift CRIT.
6. Phase I dispatch: bundle CRIT-71 (wallet), CRIT-78 (useWallet),
   CRIT-96 (messaging) into a single "URL alignment + CI guard" PR.
   Touch all of mobile/src/services/* + server.ts.
```

### CRIT-97 — Provider tier type in mobile is `'new' | 'verified' | 'pro' | 'elite'` — server enum includes `'founding'`
**Files:**
- [apps/mobile/src/services/provider.service.ts:9](apps/mobile/src/services/provider.service.ts#L9)
- [packages/api/src/validators/admin.validators.ts:12](packages/api/src/validators/admin.validators.ts#L12) (verified in C01) — server tier enum: `'founding' | 'new' | 'verified' | 'pro' | 'elite'`

```ts
// mobile provider.service.ts:9
tier: 'new' | 'verified' | 'pro' | 'elite';
```

When a 'founding'-tier provider is fetched, TypeScript's strict narrowing treats the value as never-matching, leading to `undefined` in tier-color/label maps (also confirmed at provider/[id].tsx:27-32, MED-174 in D08). The badge label shows blank, the colored chip uses `colors.textTertiary`, and the suki-pros tier-progress logic (which compares `provider.tier === 'pro'`) silently misclassifies founding providers as new.

**Founding-tier providers are the launch cohort** — the most important providers on the platform on day 1. They display incorrectly to every customer.

**Fix dispatch:**
```
1. Replace mobile Provider.tier union to match server:
   tier: 'founding' | 'new' | 'verified' | 'pro' | 'elite'
2. Update TIER_COLORS and TIER_LABELS at provider/[id].tsx:27-41 to
   include 'founding': { color: '#FFD700', label: 'Founding Member' }
   (or whatever brand spec dictates).
3. Update suki-pros.tsx tier-progress and any tier-comparison sites.
4. Audit mobile/src/services/* for other enum drift against server
   validators. Likely: booking status, dispute status, payment status,
   notification type, dsr requestType (already complete at compliance.service.ts:13).
5. Generate types from Zod schemas via z.infer at the server, export
   from packages/api/src/validators/index.ts, import as a workspace
   package in mobile. This eliminates manual type duplication. Long-term
   fix; short-term fix is the manual sync above.
6. Test: mock api response with tier='founding', render provider/[id],
   assert tier badge renders with the correct color + label.
```

---

## MEDIUM bugs

### MED-190 — recurring.service.ts has no error normalization — depends on caller
**File:** [apps/mobile/src/services/recurring.service.ts](apps/mobile/src/services/recurring.service.ts)
Service throws raw axios errors. Callers in `recurring/[id].tsx` use `err.message` extraction (good — verified D09). Other callers may use the axErr cast pattern (CRIT-69 family). No explicit normalization in the service itself.

### MED-191 — booking-photo.service.ts mime inference is filename-only
**File:** [apps/mobile/src/services/booking-photo.service.ts:60-65](apps/mobile/src/services/booking-photo.service.ts#L60)
`inferImageMime` looks at the URI extension. iOS HEIC photos get tagged as `image/jpeg` (since the extension might be .heic but doesn't match the if-cases → falls to default jpeg). Server then sees a JPG header but the binary is HEIC → S3 stores garbage. Should use the MIME type returned by Expo ImagePicker (`asset.mimeType`) when available.

### MED-192 — upload.service.ts `maxImagesPerBooking` enforcement is client-only
**File:** [apps/mobile/src/services/upload.service.ts:34-36](apps/mobile/src/services/upload.service.ts#L34)
```ts
if (uris.length > platformConfig.maxImagesPerBooking) {
  throw new Error(`Too many images. Maximum: ${platformConfig.maxImagesPerBooking}`);
}
```
Mobile platformConfig (CRIT-81 family) — drift risk. Server should also enforce, otherwise a malicious client bypasses by editing the constant. Verify server-side guard exists in upload.routes.ts.

### MED-193 — slot-waitlist.service.ts has no input validation on times
**File:** [apps/mobile/src/services/slot-waitlist.service.ts:21-29](apps/mobile/src/services/slot-waitlist.service.ts#L21)
`preferredTimeStart` / `preferredTimeEnd` are typed as `string` with no format guard. Customer passing "25:99" or empty string posts to server. Server should reject (verify), but client should also format-check before submit.

### MED-194 — messaging.service.ts `Message.imageUrl: string | null` doesn't model location messages
**File:** [apps/mobile/src/services/messaging.service.ts:14-23](apps/mobile/src/services/messaging.service.ts#L14)
`messageType` includes `'location'` but the type carries no `latitude`/`longitude` fields — only `imageUrl` for image messages. A location message from a provider would render as an empty bubble. Either add `latitude`/`longitude` to the Message type or remove `'location'` from the union.

### MED-195 — review.service.ts `getProviderReviews` response type isn't ApiResponse
**File:** [apps/mobile/src/services/review.service.ts:53-69](apps/mobile/src/services/review.service.ts#L53)
The endpoint returns `{ success, data, aggregate, pagination }`, not the standard `ApiResponse<T>`. The service inline-types this. If the server response shape changes, only the inline type breaks (the rest of the codebase using `ApiResponse<T>` is unaffected). Minor — flag for the type-generation fix in CRIT-97.

### MED-196 — tip.service.ts has no `cancelTip` / `getTipById` — single-shot only
**File:** [apps/mobile/src/services/tip.service.ts](apps/mobile/src/services/tip.service.ts)
Customer cannot cancel a tip after sending. If they realize they tipped the wrong booking or wrong amount, the only recourse is contacting support. Either expose a cancel endpoint (within 1h grace per platform policy) or document the irreversibility in the tip-send flow.

### MED-197 — data-management.service.ts has no `getDataExportById` for download
**File:** [apps/mobile/src/services/data-management.service.ts:34-37](apps/mobile/src/services/data-management.service.ts#L34)
`getDataExportStatus` returns the list with `fileUrl` but no fetch helper. The mobile UI (account-management.tsx) renders the list and the customer taps the row. If `fileUrl` is null (still processing) the tap does nothing. If non-null, the customer needs an authenticated download. Currently uses raw `Linking.openURL(fileUrl)` (verified in D05) — but exported files are S3 presigned URLs that expire. Should re-request a fresh presigned URL on each download.

### MED-198 — compliance.service.ts only POSTs `dsr`; no list/detail endpoints
**File:** [apps/mobile/src/services/compliance.service.ts:1-7](apps/mobile/src/services/compliance.service.ts#L1)
File comment acknowledges: "The customer-side 'list my requests' endpoint is not yet implemented (tracked in LAUNCH-LIMITATIONS.md)". Confirms MED-150 from D05. Customer can submit DSRs but can't see status of past submissions in-app. Pre-launch ops impact: every status query lands as a support email.

### MED-199 — address.service.ts `ApiResponse<T>` is shadowed locally
**File:** [apps/mobile/src/services/address.service.ts:20](apps/mobile/src/services/address.service.ts#L20)
```ts
interface ApiResponse<T> { success: boolean; data: T }
```
Defined inline, masking the canonical `ApiResponse<T>` from `./api`. If the canonical type adds a field (e.g., `meta`), this service silently ignores it. Replace with `import type { ApiResponse } from './api'` (the pattern used by every other service file).

### MED-200 — provider.service.ts has no `searchProviders` / `getProvidersInArea`
**File:** [apps/mobile/src/services/provider.service.ts](apps/mobile/src/services/provider.service.ts)
Service exposes only `getProviderProfile(id)`. The customer search flow goes through `catalog.service.searchProviders` (catalog endpoint). Splitting "browse providers" between `provider.service` and `catalog.service` is confusing — a future bug magnet. Consider consolidating.

### MED-201 — pricing.service.ts `PricingResult.platformSurgeShare` + `providerSurgeShare` exposed but mobile never displays them
**File:** [apps/mobile/src/services/pricing.service.ts:11-12](apps/mobile/src/services/pricing.service.ts#L11)
Server returns the surge-fee split (how much of the surge premium goes to platform vs provider). Mobile fetches it but never renders. Customers don't know that surge pricing has a split. Either render in the price-breakdown modal (transparency point — supports the trust narrative in TOS) or drop from the type.

---

## LOW / INFO

- **All 14 services** use the `api` axios client (with auth interceptor). Token-bearing pattern is consistent.
- **booking-photo.service.ts has excellent inline doc** (lines 1-13, 73-91) — explains the file:// vs S3 contract, references Bug 36/461/943/944/73 root causes. Use this as the docstring template for other services.
- **No service file uses `fetch` directly** — all go through axios. Good consistency.
- **catalog.service.ts is minimal and correct** — no error handling needed (network errors propagate to TanStack Query).
- **review.service.ts type-defines all 5 sub-rating fields** (quality, punctuality, professionalism, communication, value). Matches server shape.
- **rebooking.service.ts groups previousProviders + availableProviders** — sensible for the rebooking UX.
- **slot-waitlist.service.ts is a textbook resource client** — join/get/cancel.
- **upload.service.ts narrowed RNFormDataLike type** is the cleanest type-narrowing pattern in the mobile codebase. Use as template.
- **data-management.service.ts type-narrows DataExportEntry status union** — `'pending' | 'processing' | 'completed' | 'failed' | 'expired'` matches server. Verified consistent.
- **compliance.service.ts type-narrows DsrRequestType union** — `'access' | 'erasure' | 'correction' | 'portability' | 'restriction' | 'objection'` matches NPC RA 10173 §16. Comprehensive.

---

## Phase D progress

D10 closes the mobile services portion. Remaining for Phase D: components (~2,500 lines) + hooks/utils (~500 lines) — totals ~3,000 lines. Continuing into D11.

---

## Updated headline counts after D10

| Severity | Total | New in D10 |
|---|---:|---:|
| **CRITICAL** | **97 (1 invalidated → 96 real)** | **+2 (CRIT-96, 97)** |
| **MEDIUM** | **201** | **+12 (MED-190–201)** |
