# Phase E Findings Part 5 — Provider onboarding (10 files)

Files added in this batch (full reads):
- `apps/mobile/app/provider-onboarding/_layout.tsx` (17)
- `apps/mobile/app/provider-onboarding/role-select.tsx` (95)
- `apps/mobile/app/provider-onboarding/categories.tsx` (201)
- `apps/mobile/app/provider-onboarding/service-area.tsx` (195)
- `apps/mobile/app/provider-onboarding/documents.tsx` (195)
- `apps/mobile/app/provider-onboarding/identity-verification.tsx` (514)
- `apps/mobile/app/provider-onboarding/selfie.tsx` (191)
- `apps/mobile/app/provider-onboarding/terms.tsx` (240)
- `apps/mobile/app/provider-onboarding/review-pending.tsx` (124)
- `apps/mobile/app/provider-onboarding/background-check-status.tsx` (315 — read top 100; bottom is render + StyleSheet)

Plus targeted Grep verifications:
- `/api/v1/provider-onboarding/*` → DOES NOT EXIST on server (CRIT-115)
- `/api/v1/providers/apply` → EXISTS at provider.routes.ts:19 (terms.tsx submission works)
- Onboarding has TWO parallel flows: main (categories→area→docs→selfie→terms→/providers/apply) AND orphan (identity-verification.tsx → /provider-onboarding/identity → 404 → silently swallowed)

**Phase E running total: ~12,291 lines fully read.**
**Audit grand total: ~50,944 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-114)

### CRIT-115 — `identity-verification.tsx` SILENTLY SWALLOWS the 404 from the non-existent server endpoint, then advances the provider as if their ID was uploaded
**Files:**
- [apps/mobile/app/provider-onboarding/identity-verification.tsx:162-175](apps/mobile/app/provider-onboarding/identity-verification.tsx#L162)
- Server: NO `/api/v1/provider-onboarding/*` routes exist (verified via grep across packages/api/src/routes/ + server.ts)

```ts
try {
  await api.post('/api/v1/provider-onboarding/identity', payload);
} catch (apiErr) {
  const status = (apiErr as { response?: { status?: number } })?.response?.status;
  if (status === 404) {
    // Endpoint not yet available — proceed silently so the onboarding
    // flow can still advance. The submission will be retried by the
    // background-check polling step once the route is shipped.
    setSubmitError(null);
  } else {
    throw apiErr;
  }
}
router.push(Routes.PROVIDER_ONBOARDING.BACKGROUND_CHECK_STATUS);
```

The comment is the smoking gun: **"proceed silently so the onboarding flow can still advance"**. This is intentional theatre — the developer knew the endpoint doesn't exist and chose to fake successful submission rather than block onboarding.

**The retry-via-background-check-polling claim is also fake** — `background-check-status.tsx` uses a placeholder hook (CRIT-117) that doesn't actually call the backend.

**Compounding effect:**
- This screen is an ALTERNATIVE to the main flow (categories → service-area → documents → selfie → terms). The main flow does work (terms.tsx posts to `/providers/apply` which exists).
- BUT identity-verification.tsx is reachable from `Routes.PROVIDER_ONBOARDING.IDENTITY_VERIFICATION` and is wired into _layout.tsx. Some entry point (maestro test, deep link, future menu) could route a provider through this flow.
- A provider who completes the identity-verification flow gets the success appearance (advances to BACKGROUND_CHECK_STATUS) without anything actually persisting. **They will never be reviewable by admin staff.** Their "pending" application doesn't exist on the server.

This is the DEFINITION of fake-passing UX — the F#7 audit smell, on production code, in the most safety-critical surface (provider identity).

**Fix dispatch:**
```
1. Decision: keep identity-verification.tsx as an alternative flow OR
   delete it entirely?
   - Recommendation: delete the file + Routes.PROVIDER_ONBOARDING.IDENTITY_VERIFICATION
     constant. The main onboarding flow already covers ID via documents.tsx
     (which uses real /api/v1/uploads). Avoid two competing flows.
2. If retained: implement /api/v1/provider-onboarding/identity on server,
   accepting either base64 (current shape) OR multipart (preferred — see
   MED-254). Persist to S3 + provider_documents table.
3. REMOVE the "swallow 404" hack. Real failures should surface to the
   provider.
4. Real test: render identity-verification, mock api.post to return 404;
   assert the provider sees a clear error AND is NOT advanced to
   background-check-status (they should retry).
5. CI guard: scan for the pattern "if (status === 404)" near api.post
   calls — this is a smell of "fake successful flow" code. Each match
   needs an explicit allowlist comment OR is removed.
```

### CRIT-116 — Onboarding `service-area.tsx` PH_REGIONS list lacks Boracay/Aklan + Manila coord fallback (CRIT-92/93/111 family expansion)
**File:** [apps/mobile/app/provider-onboarding/service-area.tsx:13-24, 56-58](apps/mobile/app/provider-onboarding/service-area.tsx#L13)
```ts
const PH_REGIONS = [
  { city: 'Quezon City', province: 'Metro Manila', lat: 14.6760, lng: 121.0437 },
  { city: 'Manila', ... },
  { city: 'Makati', ... },
  // ... 10 cities; NONE in Aklan or Boracay
];

// In handleNext, when no chip is selected:
if (!finalLat || !finalLng) {
  const match = PH_REGIONS.find((r) => r.city.toLowerCase() === city.trim().toLowerCase());
  if (match) {
    finalLat = match.lat;
    finalLng = match.lng;
  } else {
    finalLat = 14.5995;     // Manila fallback
    finalLng = 120.9842;    // Manila fallback
  }
}
```

**Provider experience in Boracay (the launch market):**
1. Provider opens onboarding service-area step.
2. None of the 10 city chips match (no Boracay/Malay/Kalibo).
3. Manually types "Malay" + "Aklan" in the text inputs.
4. Submits → `match` returns undefined → fallback to Manila (14.5995, 120.9842).
5. Their service area is centered on Manila, 15km radius.
6. Onboarding completes; admin approves them.
7. **Customer in Boracay searches for a provider — this provider doesn't appear** because the matching algorithm uses lat/lng radius search, and the provider is "located" in Manila.

The launch cohort cannot complete onboarding without becoming invisible to the customers they're meant to serve.

**Fix dispatch:**
```
1. Same as CRIT-93 (customer-side address-picker): replace the hardcoded
   PH_REGIONS literal with a server-fetched region table.
2. For the launch dataset, add Boracay/Malay/Kalibo + service-area
   bounding box.
3. Replace the Manila fallback with an explicit error: "No coordinates
   for this city. Please pin your location on a map." Don't silently
   default to Manila.
4. Better: integrate Expo Location or a simple map picker (similar to
   the customer address-picker after CRIT-92/93 fix). Provider should
   set their actual lat/lng, not just text city/province.
5. Real test: simulate provider entering "Malay, Aklan"; assert
   handleNext does NOT advance with Manila coords. Either advances
   with real Aklan coords OR shows an error.
```

### CRIT-117 — `background-check-status.tsx` is a PLACEBO — `useBackgroundCheckStatus` hook is hardcoded fake data, not a real fetch
**File:** [apps/mobile/app/provider-onboarding/background-check-status.tsx:40-60](apps/mobile/app/provider-onboarding/background-check-status.tsx#L40)
```ts
function useBackgroundCheckStatus(): BackgroundCheckHookResult {
  const defaultEta = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
  const [data, setData] = useState<BackgroundCheckState>({
    status: 'pending',
    estimatedCompletionAt: defaultEta,
  });
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Placeholder: real implementation would call the backend.
      await new Promise<void>((resolve) => setTimeout(resolve, 600));
      setData((prev) => ({ ...prev }));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, refetch };
}
```

The comment is again the smoking gun: **"Placeholder: real implementation would call the backend."**

The hook returns hardcoded `{status: 'pending', estimatedCompletionAt: now + 48h}`. The "refetch" sets a 600ms delay then re-sets the same data. Provider sees a permanent "Pending — ETA 2 days from now" no matter what the actual server-side review state is.

**Real provider-side impact:**
- Provider completes terms.tsx (which does post real data via /providers/apply).
- Routed to review-pending.tsx → tap "Go to Home" → land on customer tabs (because their role hasn't been switched to provider yet on server side).
- Or routed to background-check-status.tsx (from the orphan flow) → see "Pending — 48h ETA" forever.
- **No real progress signal.** Provider doesn't know if their application is approved, rejected, or in queue.

The promised SMS/push notification on approval (per review-pending.tsx text) requires admin-side workflow + notification trigger to exist. Untestable until both ends ship.

**Fix dispatch:**
```
1. Implement real GET /api/v1/providers/me/application-status that returns
   the current review state from the providers/applications table.
2. Replace the placeholder hook with useQuery against this endpoint;
   refetchInterval: 60_000 (poll every minute while screen is open).
3. On terminal status (approved/rejected), navigate the provider away
   from this screen.
4. Pair with admin-side approval workflow + notification trigger so the
   "we'll notify you via SMS" promise in review-pending.tsx actually fires.
5. Real test: mock the endpoint to return 'approved'; assert the screen
   navigates to provider dashboard (NOT showing 'Pending' label).
```

---

## MEDIUM bugs

### MED-254 — `identity-verification.tsx` posts ID images as base64 in JSON body (8-10MB payload per submission)
**File:** [apps/mobile/app/provider-onboarding/identity-verification.tsx:122-127, 156-160](apps/mobile/app/provider-onboarding/identity-verification.tsx#L122)
```ts
const result = await ImagePicker.launchCameraAsync({
  mediaTypes: ['images'], quality: 0.7, allowsEditing: true,
  base64: true,                 // ← reads full image as base64 string
});
// ...
const payload = {
  idType,
  frontPhotoBase64: front.base64 ?? null,
  backPhotoBase64: back?.base64 ?? null,
};
```

A 0.7-quality JPEG of an 8MB photo (max enforced by `MAX_FILE_BYTES`) becomes a ~10.7MB base64 string. The POST body is JSON with two such strings (front + back) → ~21MB JSON body.

Server-side: parsing that into req.body costs memory + CPU spike per request. Mobile-side: the 10MB string lives in JS heap until GC. On a low-end device this can OOM.

The correct pattern is multipart upload (already implemented in `documents.tsx` and `selfie.tsx` via `uploadImages` → `/api/v1/uploads`). Use the same pattern here.

(Compounded by CRIT-115: the endpoint doesn't exist anyway, so the OOM never fires in production today. But fix together.)

### MED-255 — `review-pending.tsx` is a static screen with no real status polling
**File:** [apps/mobile/app/provider-onboarding/review-pending.tsx:24-56](apps/mobile/app/provider-onboarding/review-pending.tsx#L24)
The 4-step timeline is hardcoded ("Application Submitted: Just now / Identity Verification: In progress / NBI Clearance Check: Pending / Profile Activated: 24-48 hours"). No useQuery, no API call. Provider sees the same timeline forever.

Same fix as CRIT-117 — wire to `/api/v1/providers/me/application-status`.

### MED-256 — `terms.tsx` Independent Contractor Agreement is HARDCODED 7-clause text — needs attorney review (F#10 family)
**File:** [apps/mobile/app/provider-onboarding/terms.tsx:88-132](apps/mobile/app/provider-onboarding/terms.tsx#L88)
The 7 clauses (Relationship, Service Standards, Commission, Escrow Payments, Verification, Disputes, Termination) are inline JSX text. Per CLAUDE.md, F#10 (final attorney-reviewed disclaimer wording) is one of the THREE remaining items before `v1.0.0-launch-ready`.

**This is launch-blocking.** A provider agrees to text that hasn't been reviewed by Ken's attorney. Add to F#10 attorney-review scope (alongside customer-side terms.tsx Section 6 / MED-151).

Also: clause 3 says "Commission rates vary by your tier level and are detailed in the Provider Dashboard." But the dashboard's commission display (CRIT-99/100, MED-220 in earnings.tsx) is fake/incomplete. Cross-cutting trust issue.

### MED-257 — `role-select.tsx` uses legacy `storage.delete('isNewUser')` — predates Bug 1061 encrypted-MMKV migration
**File:** [apps/mobile/app/provider-onboarding/role-select.tsx:6, 17](apps/mobile/app/provider-onboarding/role-select.tsx#L6)
```ts
import { storage } from '@/services/api';
// ...
const handleCustomer = (): void => {
  storage.delete('isNewUser');
  router.replace(Routes.TABS.HOME);
};
```
`storage` is the legacy unencrypted MMKV per Bug 1061 (per the auth-migration.ts notes from D06). `terms.tsx` also uses `storage.delete('isNewUser')` (line 46). Both should be moved to the encrypted-MMKV pattern (Bug 1061 migration scope). Cross-cutting MED-247 family — a third Bug-1061 storage callsite that wasn't migrated.

### MED-258 — `documents.tsx` uses `launchImageLibraryAsync` (gallery picker), allowing providers to upload stock photos / fake IDs from gallery
**File:** [apps/mobile/app/provider-onboarding/documents.tsx:39-43](apps/mobile/app/provider-onboarding/documents.tsx#L39)
The "Government ID — Front/Back" + "NBI Clearance" upload uses `launchImageLibraryAsync` (gallery), not `launchCameraAsync` (camera). A bad-actor provider can:
1. Download a sample NBI clearance image from the internet.
2. Save to their gallery.
3. Upload it as their NBI clearance.

For ID-verification flows specifically, camera-only (no gallery) is the standard practice. `identity-verification.tsx` uses `launchCameraAsync` correctly — but documents.tsx (which is the actual production flow per MED-254 caveat) uses gallery.

**Fix:** swap to `launchCameraAsync` for all three slots in documents.tsx. Add `cameraType: 'back'` for ID + NBI; selfie.tsx already uses front camera correctly.

### MED-259 — `categories.tsx` selection limit `next.size < 10` is hardcoded
**File:** [apps/mobile/app/provider-onboarding/categories.tsx:41](apps/mobile/app/provider-onboarding/categories.tsx#L41)
"You can select up to 10 service categories." Should be from `platformConfig.maxProviderCategories` (admin-editable per the MEMORY standing instruction). CRIT-81 family.

### MED-260 — `terms.tsx` IC agreement text has no version number / immutable hash; no audit trail of which version was accepted
**File:** [apps/mobile/app/provider-onboarding/terms.tsx:88-132](apps/mobile/app/provider-onboarding/terms.tsx#L88)
The agreement is a JSX string. There's no `agreementVersion` in the POST payload to `/providers/apply`. If onService updates the agreement text, there's no record of which providers accepted which version.

Per Phase 14 customer-side terms.tsx, the cancellation policy is server-fetched with versioning. The IC agreement should follow the same pattern: server-fetched, versioned, accepted-version recorded server-side.

### MED-261 — `role-select.tsx` doesn't reset `onboardingStore` when customer chooses customer
**File:** [apps/mobile/app/provider-onboarding/role-select.tsx:16-19](apps/mobile/app/provider-onboarding/role-select.tsx#L16)
A user who taps "I provide services" → fills onboarding partially → goes back → taps "I need services" → onboarding store still has provider data. If they later change their mind and re-enter onboarding, partial old data persists. Add `useOnboardingStore.getState().reset()` to `handleCustomer`.

---

## LOW / INFO

- **Main onboarding flow (categories → service-area → documents → selfie → terms → review-pending → /providers/apply) is functionally correct.** Documents and selfie use real S3 uploads. Terms.tsx submits the bundled payload to a real server endpoint.
- **The orphan `identity-verification.tsx` flow** is the launch concern — kill it.
- **`documents.tsx` 3-doc requirement** (gov ID front + back + NBI) matches the launch product requirements per CLAUDE.md / NPC RA 10173 KYC obligations.
- **`selfie.tsx` provides camera-only capture** (good — vs the documents.tsx gallery issue MED-258).
- **`categories.tsx` icon-per-category mapping** uses lucide icons consistently. Strong UX.
- **`terms.tsx` checkbox + disabled-button gating** correctly prevents submit-without-agreement.
- **Onboarding store** is a Zustand store accumulating data across screens. Pattern is clean — review in E06 services audit.
- **`_layout.tsx` is 17 lines** — minimal Stack with screen names, all matching real files. No name-mismatch bug like customer's MED-189.
- **`background-check-status.tsx` UI is well-designed** — status icon, badge, next-steps timeline, expandable sections. Just lacks real data backing.
- **NEXT_STEPS array in background-check-status.tsx** describes what the verification process does — good provider-facing transparency.

---

## Updated headline counts after E05

| Severity | Total | New in E05 |
|---|---:|---:|
| **CRITICAL** | **115 (1 invalidated → 114 real)** | **+3 (CRIT-115–117)** |
| **MEDIUM** | **261** | **+8 (MED-254–261)** |

Continuing into E06 (provider services + components: provider-api already covered in E01, so the remaining services + 4 provider-specific components).
