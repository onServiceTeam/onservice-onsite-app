# Phase E Findings Part 2 — Provider job execution flow (the highest-stakes provider surface)

Files added in this batch (full reads):
- `apps/mobile/app/provider/job/[id].tsx` (381)
- `apps/mobile/app/provider/job/active.tsx` (279)
- `apps/mobile/app/provider/job/[id]/checklist.tsx` (466)
- `apps/mobile/app/provider/job/[id]/complete.tsx` (385)
- `apps/mobile/app/provider/job/[id]/navigate.tsx` (233)
- `apps/mobile/app/provider/job/[id]/photos.tsx` (238)
- `apps/mobile/app/provider/job/[id]/quote.tsx` (291)
- `apps/mobile/app/provider/job/[id]/change-order.tsx` (193)

Plus targeted Grep verifications:
- `/api/v1/bookings/:id/complete` POST → DOES NOT EXIST on server (CRIT-104)
- `/api/v1/bookings/:id/issues` POST → DOES NOT EXIST (MED-225)
- `/api/v1/bookings/:id/arrived` POST → DOES NOT EXIST (MED-226)
- `/provider/job/active` callers in app code → ZERO (dead screen)
- `/provider/job/[id]/navigate` callers in app code → ZERO (dead screen)
- `JOB_COMPLETE` Routes constant callers → ZERO outside the dead-code chain
- Server `/jobs/:id/checklist` route exists at `packages/api/src/routes/checklist.routes.ts:25` — mobile checklist.tsx ignores it (CRIT-105)

**Phase E running total: ~4,293 lines fully read.**
**Audit grand total: ~42,946 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-100)

### CRIT-101 — Provider job detail "Your Earnings" shows the FULL service price with no commission deduction
**File:** [apps/mobile/app/provider/job/[id].tsx:236-243](apps/mobile/app/provider/job/[id].tsx#L236)
```tsx
<View style={styles.earningsRow}>
  <Text style={styles.earningsTotalLabel}>Your Earnings</Text>
  <Text style={styles.earningsTotalValue}>
    {formatPHP(booking.servicePrice)}    {/* ← full price, NOT after commission */}
  </Text>
</View>
<Text style={styles.earningsNote}>Commission will be deducted upon payout</Text>
```

A provider sees a ₱2,000 booking. The screen says "Your Earnings: ₱2,000". The footnote whispers "commission will be deducted upon payout" — but no number is shown. When the actual payout lands at ~₱1,700–₱1,880 (depending on tier — 6% founding to 15% new + VAT), the provider concludes they were short-changed by ₱120–₱300.

**Customer-support-ticket pattern:** "I did a 2000 peso job, why did I get 1700? Where's the missing 300?" Multiplied across thousands of jobs, this is a continuous trust drag.

This is the same family as CRIT-99/100 (fake earnings chart + commission breakdown on the dashboard) — the provider-side money path is consistently misleading.

**Fix dispatch:**
```
1. Fetch tier-based commission rate from the existing useQuery for
   provider profile OR from the new tier-progression endpoint.
2. Compute and display:
       Service Price:        ₱2,000.00
       Platform Fee (-15%):  -₱300.00
       VAT on Fee (12%):     -₱36.00
       --------------------------------
       Your Earnings:        ₱1,664.00
3. Don't whisper. Show the number that lands in the wallet.
4. Real test: render the screen with a mocked tier='new', commission=0.15;
   assert the rendered "Your Earnings" string equals the post-commission
   value, not the raw service price.
```

### CRIT-102 — `complete.tsx` POSTs photos as local `file://` URIs (Bug 36/461/943/944/73 root cause REINTRODUCED)
**File:** [apps/mobile/app/provider/job/[id]/complete.tsx:122-127](apps/mobile/app/provider/job/[id]/complete.tsx#L122)
```ts
await api.post(`/api/v1/bookings/${id}/complete`, {
  photos: photos.filter((p): p is string => p !== null),  // ← raw `file://` URIs from ImagePicker
  signedAt,
  notes: notes.trim(),
});
```

The `photos` array contains `asset.uri` from `ImagePicker.launchCameraAsync` — these are `file://` URIs pointing to the provider's local device storage. They're shipped as JSON strings to the server.

**This is the EXACT bug that booking-photo.service.ts was designed to fix** (per its own docstring referencing Bugs 36/461/943/944/73 — the root cause guard for non-file:// URLs). But `complete.tsx` ignores the `uploadBookingPhoto` helper and ships raw URIs.

**Even if** the server's `/complete` endpoint existed (it doesn't — see CRIT-104), the photos couldn't reach the customer:
- Customer's app tries `<Image source={{uri: 'file:///var/mobile/Containers/.../IMG_xxx.jpg'}} />`.
- That path is on the PROVIDER's phone, not the customer's. Image fails to load.
- Dispute opens. No photo evidence. Customer wins by default (or platform pays out from guarantee fund).

**Fix dispatch:**
```
1. Replace the inline POST with calls to uploadBookingPhoto(uri,
   bookingId, 'after') for each photo BEFORE submitting completion.
2. Then PATCH /api/v1/bookings/:id/status with status=completed_by_provider
   (the actual completion endpoint per provider-api.service.ts:333-350).
3. Photos are now stored in S3 with HTTPS URLs; customer's app can render
   them.
4. The whole completion flow needs CRIT-104 + this fix in one PR.
5. Test: render complete screen with a mock ImagePicker returning a
   file:// URI; trigger submit; assert that uploadBookingPhoto was
   called with that URI before any /status call.
```

### CRIT-103 — `complete.tsx` "Customer Signature" is captured locally as point dots and NEVER persisted
**File:** [apps/mobile/app/provider/job/[id]/complete.tsx:71-102, 117-127](apps/mobile/app/provider/job/[id]/complete.tsx#L71)

The signature flow:
1. Provider hands phone to customer.
2. Customer drags finger; PanResponder captures `{x, y}` points into client state (signaturePoints array).
3. `signedAt` timestamp set on first stroke.
4. On submit, only `signedAt` is included in the POST body — NOT the points, NOT a rendered signature image.

So the server gets a timestamp claiming "customer signed at HH:MM" but no visual evidence of the signature.

**Worse:** [booking-photo.service.ts:137-166](apps/mobile/src/services/booking-photo.service.ts#L137) has a working `uploadSignature` helper that POSTs PNG to `/api/v1/uploads/booking-signature`. The complete screen ignores it.

**Dispute scenario:**
- Customer disputes work quality.
- Platform DPO requests "the signed completion proof".
- Server has: a timestamp string. No signature image. No PDF. No proof the customer actually signed.
- Provider claims customer signed. Customer denies. Platform has no evidence.
- Default to customer (per consumer-protection norms). Provider eats the loss.

For a launch product where dispute resolution is a critical trust mechanism, this is launch-blocking.

**Fix dispatch:**
```
1. Replace the home-rolled PanResponder + dot-rendering with
   react-native-signature-canvas (already referenced in
   booking-photo.service.ts:130-135 as the intended library).
2. On submit, render the signature canvas to a base64 PNG, write to
   a temp file via expo-file-system, then call uploadSignature() with
   signatureType='customer_acceptance' and bookingId.
3. Store the returned signature record id in the completion payload.
4. Test: simulate signature capture, assert uploadSignature is called
   with the captured PNG; assert the returned id is included in the
   subsequent PATCH /status payload.
```

### CRIT-104 — `complete.tsx` POSTs to `/api/v1/bookings/:id/complete` — endpoint DOES NOT EXIST on server
**Files:**
- [apps/mobile/app/provider/job/[id]/complete.tsx:123](apps/mobile/app/provider/job/[id]/complete.tsx#L123) — `api.post('/api/v1/bookings/${id}/complete', ...)`
- Server `packages/api/src/routes/booking.routes.ts` — verified all POST routes; `/complete` is NOT among them. Closest is the PATCH `/status` flow with `status='completed_by_provider'` at booking.routes.ts:477.

**Customer flow when provider tries to complete:**
1. Provider goes through `/provider/job/[id]/checklist` (fake hardcoded items per CRIT-105).
2. Taps "Save & Continue" → `/provider/job/[id]/complete`.
3. Captures fake-tracked photos (CRIT-102) and fake-tracked signature (CRIT-103).
4. Taps "Submit Completion" → POST 404 → "Submission failed" Alert.
5. Provider has no choice but to return to `/provider/job/[id]` and tap "Mark Complete" — which works (PATCH /status), but skips photos+signature entirely.

**Net result on launch day:** provider either sees a failure they can't resolve, or completes via the simpler path WITHOUT photo/signature evidence. Either way, the dispute-evidence-collection flow is broken.

**Fix dispatch:** combine with CRIT-102 + CRIT-103 — reroute the `complete.tsx` submission to:
1. Upload all photos via `uploadBookingPhoto`.
2. Upload signature via `uploadSignature`.
3. PATCH `/api/v1/bookings/:id/status` with `status='completed_by_provider'` and the photo/signature IDs in the body.
4. Server-side: extend the PATCH /status handler to optionally accept `completionPhotoIds` + `signatureId` and store them in `bookings.completion_evidence` JSONB or similar.

### CRIT-105 — `checklist.tsx` ships HARDCODED cleaning checklist instead of using the server-driven per-job checklist endpoint
**Files:**
- [apps/mobile/app/provider/job/[id]/checklist.tsx:40-83](apps/mobile/app/provider/job/[id]/checklist.tsx#L40)
- [packages/api/src/routes/checklist.routes.ts:25, 46](packages/api/src/routes/checklist.routes.ts#L25) — server has `GET /api/v1/jobs/:id/checklist` (creates on first open) + `PATCH /api/v1/jobs/:id/checklist/items/:itemId` (toggle item completion). Bug 460/463 fix.

The server endpoint creates a category-appropriate checklist on the provider's first open (e.g., aircon-cleaning category gets aircon checklist; plumbing gets plumbing). The mobile screen ignores it and ships:
```ts
const INITIAL_SECTIONS: ChecklistSection[] = [
  { title: 'Living Room', items: [makeItem('living-vacuum', 'Vacuum floor'), ...] },
  { title: 'Kitchen', items: [makeItem('kitchen-counters', 'Wipe counters'), ...] },
  { title: 'Bathroom', items: [...] },
  { title: 'Bedrooms', items: [...] },
];
```

**Provider experience for non-cleaning categories:**
- Provider does an aircon repair → checklist shows "Vacuum floor / Clean stove / Scrub toilet".
- Provider does a plumbing job → same cleaning checklist.
- Provider does an electrical job → same cleaning checklist.

The progress bar (line 110-112) is meaningless — provider can mark "Vacuum floor" done on a plumbing job without any vacuuming happening.

Worse: every checklist toggle is local-state-only. No PATCH to server. So even for cleaning jobs, the server has no record of which items the provider claims to have done. **The checklist data exists nowhere except in transient client state.**

**Fix dispatch:**
```
1. Replace INITIAL_SECTIONS with useQuery against
   /api/v1/jobs/:id/checklist (server returns the category-appropriate
   structure on first call).
2. Replace toggleDone() with mutation against
   PATCH /api/v1/jobs/:id/checklist/items/:itemId — record completion
   server-side, optionally with photoId.
3. Replace photo capture with uploadBookingPhoto(uri, bookingId,
   'checklist'); pass returned photoId to the toggle mutation.
4. Real test: render the checklist with a mocked server response
   for an aircon category; assert the rendered sections match the
   server response (NOT the hardcoded INITIAL_SECTIONS).
5. Coordinate with CRIT-102/103/104 for the full job-execution fix.
```

---

## MEDIUM bugs

### MED-222 — `provider/job/[id].tsx` uses native `Alert.alert` for confirmations + axErr cast (CRIT-69 family)
**Files:** [apps/mobile/app/provider/job/[id].tsx:79-82, 97-100, 117-121, 127-132](apps/mobile/app/provider/job/[id].tsx#L79)
Three mutations use the inline axErr cast. Three confirmations use raw `Alert.alert` instead of ConfirmModal. Same pattern as MED-219 (provider profile). Cross-cutting fix.

### MED-223 — `provider/job/[id].tsx` iOS navigation URL `maps:0,0?q=...@lat,lng` is buggy
**File:** [apps/mobile/app/provider/job/[id].tsx:142-145](apps/mobile/app/provider/job/[id].tsx#L142) and [active.tsx:92-95](apps/mobile/app/provider/job/active.tsx#L92)
```ts
const url = Platform.select({
  ios: `maps:0,0?q=${label}@${lat},${lng}`,
  android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
});
```
The `maps:0,0?q=...@lat,lng` URL form is undocumented and inconsistently honored across iOS versions. Documented form is `http://maps.apple.com/?ll=lat,lng&q=label` (works in any iOS browser AND deep-links to Apple Maps app). Fix to use the documented form.

### MED-224 — `STATUS_LABELS` in provider job/[id] missing several states (cancelled_by_*, disputed, resolved)
**File:** [apps/mobile/app/provider/job/[id].tsx:26-39](apps/mobile/app/provider/job/[id].tsx#L26)
Falls back to `booking.status.replace(/_/g, ' ')` for unknown statuses → provider sees `"cancelled by customer"` instead of `"Cancelled by customer"`. Cosmetic. Use `StatusBadge` component (D11) instead.

### MED-225 — `checklist.tsx` "Report Issue" POSTs to `/api/v1/bookings/:id/issues` (does not exist) and shows a misleading "saved locally" message on failure
**File:** [apps/mobile/app/provider/job/[id]/checklist.tsx:177-188](apps/mobile/app/provider/job/[id]/checklist.tsx#L177)
```ts
try {
  await api.post(`/api/v1/bookings/${id}/issues`, ...);
  Alert.alert('Reported', 'Your issue has been sent to the customer.');
} catch {
  Alert.alert('Reported', 'Issue saved locally; will sync when you are back online.');
}
```
- POST 404s every time (no `/issues` endpoint).
- Catch block lies: "saved locally; will sync when you are back online" — there is NO local persistence and NO sync queue. The issue text is silently discarded.
- Provider thinks issue was reported. Customer never sees it. Issues pile up in the void.

**Fix:** add server endpoint OR remove the feature entirely. Don't lie to the provider about local persistence.

### MED-226 — `navigate.tsx` is dead code with FALLBACK_JOB sample data + nonexistent `/arrived` endpoint
**Files:**
- [apps/mobile/app/provider/job/[id]/navigate.tsx:29-32, 39, 65](apps/mobile/app/provider/job/[id]/navigate.tsx#L29)
- Grep verified: zero callers in app code. Only references are in maestro test config + jest test that imports the module.

```ts
const FALLBACK_JOB: JobLocation = {
  customerName: 'Maria Santos',
  address: '123 Sample St, Quezon City',
};
// ...
const job = FALLBACK_JOB;  // ← always uses sample data
// ...
await api.post(`/api/v1/bookings/${id}/arrived`);  // ← endpoint does not exist
```

**Triple bug:**
1. Dead code (no caller routes here).
2. Even if reached, "Maria Santos / 123 Sample St" is a hardcoded fake.
3. The "Mark Arrived" button POSTs to a 404 endpoint.

**However the maestro test + jest test both pass against the dead screen** — they verify the screen renders, not that any data is correct. Same F#5/F#7 audit-remediation gap.

**Fix:** delete the file (and its tests). The real navigation flow is the `handleNavigate` function on `provider/job/[id].tsx` (which uses real booking lat/lng from the query) + the `handleAction` "I've Arrived" button (PATCH /status with location). No need for a separate screen.

If the design intent was a richer pre-navigation view (Google Maps / Waze choice + ETA), then build it properly: useQuery for the booking, real ETA from the maps SDK, real lat/lng. But ship neither dead code nor sample data.

### MED-227 — `active.tsx` is dead code with Manila fallback map (Boracay launch CRIT-92 family)
**Files:**
- [apps/mobile/app/provider/job/active.tsx:148-153](apps/mobile/app/provider/job/active.tsx#L148)
- Grep verified: zero callers. `Routes.PROVIDER.ACTIVE_JOB` is declared as `/provider/job/[id]/active` (wrong path); the file lives at `/provider/job/active`. Mismatched + uncalled.

```tsx
initialRegion={bookingRegion ?? {
  latitude: 14.5995,
  longitude: 120.9842,  // ← Manila
  ...
}}
```
Same Boracay-launch issue as customer CRIT-92. Even if a caller were added, providers in Boracay would see Manila as the default map region.

Functionality also overlaps with `/provider/job/[id].tsx`. Recommend deletion.

### MED-228 — `complete.tsx` "Earnings preview" CommissionBreakdown shows literal zeros
**File:** [apps/mobile/app/provider/job/[id]/complete.tsx:251-268](apps/mobile/app/provider/job/[id]/complete.tsx#L251)
```tsx
<CommissionBreakdown
  gross={0}
  lines={[{ label: 'Platform fee', amount: 0, pct: 12, ... }]}
  net={0}
/>
```
Provider just finished a ₱2,000 job and the earnings preview shows ₱0 net + ₱0 fee. Same family as CRIT-99/100/101 (fake/zero financial data). The R5-complete remediation wired the component but with placeholder data.

### MED-229 — `quote.tsx` uses `platformConfig.minimumQuoteAmount` and `currencySymbol` (drift risk + CRIT-69 axErr)
**File:** [apps/mobile/app/provider/job/[id]/quote.tsx:42, 76-79, 82, 172, 229](apps/mobile/app/provider/job/[id]/quote.tsx#L42)
Mobile platformConfig values used for client-side validation. Server should also enforce. Cross-cutting fix per CRIT-81 (settings/money drift) + CRIT-69 (error pattern).

### MED-230 — `change-order.tsx` inline minimum check `< 100` doesn't match `platformConfig.minimumChangeOrderAmount` used elsewhere
**File:** [apps/mobile/app/provider/job/[id]/change-order.tsx:42, 93-95](apps/mobile/app/provider/job/[id]/change-order.tsx#L42)
```ts
const isValid = description.length >= 10 && amountCentavos >= platformConfig.minimumChangeOrderAmount;
// ...
{amountCentavos > 0 && amountCentavos < 100 && (
  <Text style={styles.minWarn}>Minimum amount: {formatPHP(100)}</Text>
)}
```
Validity check uses `platformConfig.minimumChangeOrderAmount` (whatever that is). Warning text shown if `amountCentavos < 100` (i.e., < ₱1.00). The two thresholds disagree — provider could enter ₱5 (above 100 centavos warning threshold) but below the actual minimum, see no warning, then submit fails on `isValid` → button disabled but no message explains why.

Use the same `platformConfig.minimumChangeOrderAmount` for both the warning and the validity gate.

### MED-231 — `change-order.tsx` "exceeding 50% of original cost may require admin approval" note is hardcoded text but not enforced anywhere visible
**File:** [apps/mobile/app/provider/job/[id]/change-order.tsx:132-136](apps/mobile/app/provider/job/[id]/change-order.tsx#L132)
The hardcoded "50%" is not in `platformConfig`. Server may have a different threshold, or no threshold. Provider learns the rule by submitting and seeing it rejected. Either:
- Surface the actual threshold from `platformConfig` (and let admin edit it).
- OR drop the claim entirely until the admin-approval path is real.

### MED-232 — `photos.tsx` "📷" emoji icon instead of Camera Lucide icon (icon-only rule violation)
**File:** [apps/mobile/app/provider/job/[id]/photos.tsx:134](apps/mobile/app/provider/job/[id]/photos.tsx#L134)
Same as customer-side jobs.tsx 📍 emoji issue. Use the Camera icon from `@/components/icons` for consistency.

---

## LOW / INFO

- **`provider/job/[id].tsx` has good action gating:** `canCancel` only allows cancellation for matched/paid/provider_en_route (not after work has started); `canSubmitChangeOrder` only for in_progress; `canSubmitQuote` only for quote_based + requested. Defensive.
- **`provider/job/[id].tsx` `handleNextStatus` correctly captures GPS only for the `provider_arrived` transition** — matches server's distance-check (booking.routes.ts:455). Defense-in-depth where it matters.
- **`updateBookingStatus` returns optional `warning`** — and the cancel mutation surfaces it. Server can warn "you're going to lose star rating" without failing the request.
- **`photos.tsx` is the GOOD photo screen** — uses real `useImagePicker` (HEIC compression issue noted in MED-191) + `uploadJobPhotos` from booking.service. Real S3 upload. Clean before/after split.
- **`quote.tsx` line-item calculator** correctly multiplies qty × unitPrice × 100 to centavos. Money math correct.
- **`quote.tsx` form validation** disables submit until description >= 10 chars, totalAmount >= minimum, at least one filled line item. Reasonable.
- **`change-order.tsx` hint box** explains the customer-approval flow upfront. Good UX.
- **`change-order.tsx` photo flow uses `useImagePicker`** with real upload before submission. Compare with the BROKEN photo handling in `complete.tsx` (CRIT-102) — proves the team knows how to do it right when they pay attention.
- **`checklist.tsx` issue-reporting modal UX is decent** — modal + textarea + cancel/send. Just connects to a non-existent endpoint (MED-225).
- **None of the job screens block the back gesture** during a mutation in flight. A provider who taps back during a status update could land in inconsistent UI state. Minor — TanStack Query mostly handles refetch on remount.
- **Multiple competing completion paths exist** (Mark Complete via /provider/job/[id] → PATCH status; Submit Completion via /complete.tsx → POST 404). The team needs to pick ONE canonical completion flow (recommendation: kill /complete.tsx + /checklist.tsx, fold photo+signature capture into the job/[id] "Mark Complete" button via a modal).
- **None of these screens use the `StatusBadge` component from D11** — they all roll their own status pill with their own incomplete maps. Add to the consolidation dispatch.

---

## Updated headline counts after E02

| Severity | Total | New in E02 |
|---|---:|---:|
| **CRITICAL** | **105 (1 invalidated → 104 real)** | **+5 (CRIT-101–105)** |
| **MEDIUM** | **232** | **+11 (MED-222–232)** |

Continuing into E03 (provider profile management — services, schedule, calendar, portfolio, certifications, skills, service-area, tier-progression, suki-customers, reviews).
