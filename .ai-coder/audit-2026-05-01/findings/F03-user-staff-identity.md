# Phase F Findings Part 3 — Admin user / provider / staff / identity / audit pages

## Files read (full reads, no skipped sections)

| File | Lines | Read range | Status |
|---|---:|---|---|
| `apps/admin/src/pages/CustomersPage.tsx` | 151 | 1-151 | full |
| `apps/admin/src/pages/CustomerDetailPage.tsx` | 1,117 | 1-1117 | full (single Read call) |
| `apps/admin/src/pages/ProvidersPage.tsx` | 339 | 1-339 | full |
| `apps/admin/src/pages/ProviderDetailPage.tsx` | 952 | 1-952 | full (single Read call) |
| `apps/admin/src/pages/StaffRolesPage.tsx` | 443 | 1-443 | full |
| `apps/admin/src/pages/AuditLogPage.tsx` | 254 | 1-254 | full |
| **F03 page total** | **3,256** | | |

Server routes cross-checked (full reads of the smaller files, line-targeted reads of admin.routes.ts):
- `packages/api/src/routes/customer-admin.routes.ts` (182 lines) — full
- `packages/api/src/routes/provider-admin.routes.ts` (283 lines) — full
- `packages/api/src/routes/staff.routes.ts` (160 lines) — full
- `packages/api/src/routes/admin.routes.ts` lines 150-275 + 1525-1614 — provider/customer/audit-log handlers
- `packages/api/src/services/provider-admin.service.ts` lines 40-72 — to confirm "Government ID not stored" finding
- `packages/api/src/validators/admin.validators.ts` lines 7-13 — to confirm 'founding' tier client/server drift

**F03 grand total fully read: ~4,500 lines (3,256 page + ~1,244 server cross-check).**
**Audit grand total fully read after F03: ~63,440 lines.**

---

## Honesty notes up front

- F03 found **8 new CRITs** (CRIT-128 through CRIT-135), **20 new MEDs** (MED-301 through MED-320), and a number of LOW/INFO items.
- The single biggest finding is the admin-side confirmation of CRIT-115's onboarding theatre: the server admin response type literally encodes `governmentIdUrl: null` and `selfieUrl: null` because the DB schema has no columns for those documents. That is a NEW CRIT (admin-facing identity gap) on top of the mobile-facing CRIT-115.
- The `'founding'` tier enum drift family (CRIT-97) gets two more sites in F03 (CRIT-129 below).
- The `STAFF & ROLES` page has zero client-side role gate, but the server side IS correctly gated to super_admin on every endpoint. The result is a broken-UX MED, NOT a privilege escalation. I initially thought this was a CRIT until I read the server route; the server-side enforcement saves it. (Honest note — first instinct was wrong, the cross-grep corrected it.)
- The audit-log page does NOT expose date-range or user filters that the SERVER actually supports (`from` / `to` / `userId` query params). UI capability gap, not a security gap.

---

## CRITICAL bugs (continuing numbering after CRIT-127)

### CRIT-128 — Admin sees "Government ID — not stored" for every provider; the schema literally has no columns for KYC docs (NPC + AMLA + business risk)
**Files:**
- [apps/admin/src/pages/ProviderDetailPage.tsx:347-350](apps/admin/src/pages/ProviderDetailPage.tsx#L347)
- [packages/api/src/services/provider-admin.service.ts:51-58](packages/api/src/services/provider-admin.service.ts#L51)

```tsx
// ProviderDetailPage — admin UI
<DocLine label="Government ID" url={profile.documents.governmentIdUrl}
  extra="not stored — see HONESTY-CHECK" />
<DocLine label="Selfie" url={profile.documents.selfieUrl}
  extra="not stored — see HONESTY-CHECK" />
```

```ts
// provider-admin.service.ts — server response type
documents: {
  nbiClearanceUrl: string | null;
  nbiExpiryDate: string | null;
  nbiExpiryNotified: boolean;
  avatarUrl: string | null;
  // Government ID + selfie fields not present in current schema (see HONESTY-CHECK).
  governmentIdUrl: null;
  selfieUrl: null;
};
```

The server response **literally types these as `null`**. The DB schema has no columns to store them. Mobile CRIT-115 already showed the provider-facing identity-verification screen silently swallows a 404 from a non-existent endpoint. This finding is the admin-facing mirror: even if the upload worked, there's no place to put it.

**Customer-facing impact (Boracay launch):** a fraudster signs up as a "provider," walks through onboarding, gets approved by a junior admin who sees "Government ID — not stored" but doesn't understand what that means, and starts taking customer bookings. When a customer gets robbed/assaulted (we are sending strangers to private homes), there is no government-issued ID on file. NPC RA 10173 §28 requires due diligence on third-party data processing entities. AMLA §3 (PH) requires KYC for any platform handling money flows ≥ ₱500,000/yr. We will hit ₱500K in the first 3 months in Boracay.

This is launch-blocking. NPC will not certify the platform. PayMongo (and any successor processor) will pull payment processing.

**Fix dispatch:**
```
1. Migration: add columns to providers (or a new provider_documents table):
   government_id_url TEXT,             -- presigned-stored S3 path
   government_id_type TEXT CHECK (... 'drivers_license' | 'passport' | 'umid' | 'philsys' | 'sss' | 'voter_id' | 'philhealth'),
   government_id_uploaded_at TIMESTAMPTZ,
   government_id_verified_at TIMESTAMPTZ,
   government_id_verified_by UUID REFERENCES users(id),
   selfie_url TEXT,
   selfie_uploaded_at TIMESTAMPTZ,
   selfie_face_match_score REAL,        -- if we use 3rd-party face-match
   selfie_face_match_provider TEXT;     -- e.g. "iproov", "onfido"

2. Server endpoint(s):
   POST /api/v1/provider-onboarding/identity     ← multipart upload, stores S3
   GET  /api/v1/admin/providers/:id/identity     ← signed-URL wrapper
   PATCH /api/v1/admin/providers/:id/identity/verify  ← super_admin only

3. Mobile (paired with CRIT-115 fix): replace the silent 404-swallowing identity-verification.tsx with a real upload to the new endpoint.

4. Admin UI (ProviderDetailPage):
   - Replace `extra="not stored — see HONESTY-CHECK"` with real DocLine showing the doc + signed download URL.
   - Add `<Button onClick={verifyIdentity(p.id)}>Mark verified (super_admin)</Button>`.
   - Add face-match score if available.
   - Audit row on every verify/reject.

5. Compliance:
   - Document retention policy (NPC §11): keep KYC docs for 5 years after account close.
   - Encryption at rest: S3 bucket with AWS KMS-managed key.
   - Access log: every admin view of a KYC doc creates an audit row.

6. Tests:
   - Migration test: new columns exist with NOT NULL on uploaded_at when url present.
   - Integration: provider uploads ID via mobile → DB row populated → admin sees download link.
   - Permission: regular admin can VIEW, only super_admin can VERIFY.

7. Bundle into the onboarding theatre dispatch with CRIT-115/117.
```

**Tests required:**
- `provider-admin.service.real.test.ts` — assert `getProviderProfile()` returns non-null governmentIdUrl when DB has a value.
- `ProviderDetailPage.real.test.tsx` — assert that when `governmentIdUrl` is non-null, the DocLine shows a "view" link, not "not stored".
- Migration test: `088_provider_kyc_columns.sql` exists and is reversible.

**Runtime verification (AI coder runbook):**
1. `docker compose up api admin postgres redis`
2. Apply migration adding KYC columns.
3. Seed: `npm run seed:e2e` adds `provider-test@onservice.us` with `government_id_url='s3://bucket/test-id.jpg'` set directly in DB.
4. Open admin web at http://localhost:5173, log in as super_admin.
5. Navigate to /providers/<seeded-id>/profile.
6. Take screenshot — Government ID line MUST show "view" link, NOT "not stored — see HONESTY-CHECK".
7. Click "view" → 302 to short-lived (60s) S3 presigned URL.
8. Pre-fix screenshot: every existing provider shows "missing — not stored". Post-fix: seeded provider shows "view".

---

### CRIT-129 — `'founding'` tier enum drift on TWO admin-side dropdowns: ProvidersPage filter (line 234-239) AND tier-change dialog (line 293-296). Server enum INCLUDES 'founding'.
**Files:**
- [apps/admin/src/pages/ProvidersPage.tsx:234-239](apps/admin/src/pages/ProvidersPage.tsx#L234) — list filter dropdown
- [apps/admin/src/pages/ProvidersPage.tsx:293-296](apps/admin/src/pages/ProvidersPage.tsx#L293) — tier-change action dropdown
- [packages/api/src/validators/admin.validators.ts:11-12](packages/api/src/validators/admin.validators.ts#L11) — server Zod enum

```tsx
// ProvidersPage filter dropdown — line 234-239
<select value={tierFilter} ...>
  <option value="">All Tiers</option>
  <option value="new">New</option>
  <option value="verified">Verified</option>
  <option value="pro">Pro</option>
  <option value="elite">Elite</option>
  {/* MISSING: <option value="founding">Founding</option> */}
</select>

// tier-change action dropdown — line 293-296
<select value={actionTier} ...>
  <option value="new">New</option>
  <option value="verified">Verified</option>
  <option value="pro">Pro</option>
  <option value="elite">Elite</option>
  {/* MISSING: <option value="founding">Founding</option> */}
</select>
```

```ts
// admin.validators.ts — server side
export const changeProviderTierSchema = z.object({
  tier: z.enum(['founding', 'new', 'verified', 'pro', 'elite']),
});
```

The TIER_BADGE map at line 42-48 *displays* 'founding' correctly with `'warning'` variant — so the badge shows up in the table. But admin cannot:
1. **Filter** the provider list to "show me all founding-tier providers" — the dropdown has no option.
2. **Promote** a 'new' provider TO 'founding' tier — the action dropdown has no option.
3. **Demote** a 'founding' provider OFF 'founding' (e.g., when graduating to 'verified') — same gap; selecting any option from the dropdown demotes them but the choice is one of 4, not 5.

The Boracay launch business model literally pivots on the founding-batch tier (10% commission for first 50 providers per category — see DECISION-003). Admin needs this tier to be first-class.

**Real-world impact:** opening week of Boracay launch — 35 founding-batch providers approved, admin opens Providers page to see "how many founding providers are active right now", types nothing in filter, scrolls 200 providers paged, can't isolate the founding cohort. Admin then needs to manually move someone from 'verified' back to 'founding' (rare but happens) — can't, has to write SQL or escalate to engineering.

**Fix dispatch:**
```
1. Add to ProvidersPage.tsx:
   - Line 235 filter dropdown: <option value="founding">Founding</option>  (add as first option after "All Tiers")
   - Line 294 action dropdown: <option value="founding">Founding</option>  (add as first option)

2. Same fix for filter on ProviderDetailPage if it has a tier dropdown (it doesn't currently — header just shows badge).

3. Bundle with the cross-cutting CRIT-97 dispatch (provider tier enum drift). Total sites:
   - Customer mobile: D02 referenced site (already in CRIT-97)
   - Provider mobile: provider-onboarding/tier-selection if it exists (verify)
   - Admin: ProvidersPage filter + tier-change dropdown (NEW THIS PHASE — F03)

4. CI guard: scan apps/admin/ and apps/mobile/ for tier dropdowns. Each must include 'founding'. Flag any missing.

5. Tests:
   - Render ProvidersPage; assert filter dropdown contains 'Founding' option.
   - Render the tier-change modal; assert dropdown contains 'Founding' option.
   - Server integration: PUT /admin/providers/:id/tier with tier='founding' returns 200.
```

**Runtime verification:**
1. Open admin /providers; filter dropdown should include 'Founding' as a value.
2. Click on a 'new' provider's "Tier" action; dialog dropdown should include 'Founding'.
3. Pick 'Founding', enter reason, submit; provider's badge changes to 'founding' on the next list refetch.

---

### CRIT-130 — All provider mutation actions (approve/reject/suspend/reactivate/tier) gated on server only by `requireAdmin`, NOT `requireSuperAdmin` — junior admin can suspend any provider with one click
**Files:**
- [apps/admin/src/pages/ProvidersPage.tsx:78-104, 165-184](apps/admin/src/pages/ProvidersPage.tsx#L78) — client side has NO role check at all
- [packages/api/src/routes/admin.routes.ts:166-252](packages/api/src/routes/admin.routes.ts#L166) — server side uses `requireAdmin` (admin OR super_admin) on all five actions

```ts
// admin.routes.ts — line 166-181 (approve)
router.put(
  '/providers/:id/approve',
  authMiddleware,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      requireAdmin(req);  // ← admin OR super_admin, not super_admin only
      ...
    }
  }
);

// SAME pattern applied to /reject, /suspend, /reactivate, /tier
```

```tsx
// ProvidersPage.tsx — client side — line 165-184
{r.status === 'pending' && (
  <>
    <ActionBtn label="Approve" ... />
    <ActionBtn label="Reject" ... />
  </>
)}
{r.status === 'approved' && (
  <ActionBtn label="Suspend" ... />
)}
// NO role check — every admin sees these buttons
```

Same family as CRIT-23/56/120/121 — the staff_permissions schema exists but routes don't enforce it. Specifically for providers:
- A junior support staff (role='admin', intended permissions: dashboard view + customer support) can:
  - **Approve** a provider application (no reason field; one click)
  - **Reject** a provider application (10-char reason; sets the application to rejected, no undo)
  - **Suspend** an active provider — instantly cuts off their income (no super_admin gate, no two-person rule)
  - **Reactivate** a suspended provider (no reason)
  - **Change** a provider's tier (affects commission rate they pay, customer fees, visibility ranking)

This is account-killing on the rejection/suspension path AND money-affecting on the tier path. A disgruntled support agent can suspend a provider out of personal grudge.

**Fix dispatch:**
```
1. Server (admin.routes.ts lines 166-252) — Replace `requireAdmin(req)` with `requireSuperAdmin(req)` for:
   - /providers/:id/approve  → super_admin OR perm 'providers.approve'
   - /providers/:id/reject   → super_admin OR perm 'providers.reject'
   - /providers/:id/suspend  → super_admin OR perm 'providers.suspend'  (account-killing)
   - /providers/:id/reactivate → super_admin OR perm 'providers.suspend'
   - /providers/:id/tier     → super_admin OR perm 'providers.tier_change'

2. Server (paired with CRIT-23/56 fix): build `requirePermission(permName)` middleware that reads the staff_permissions JWT claim. Mount on each route.

3. Client (ProvidersPage.tsx):
   const role = useAuthStore((s) => s.user?.role);
   const perms = useAuthStore((s) => s.user?.permissions ?? []);
   const can = (p: string) => role === 'super_admin' || perms.includes(p);
   ...
   {can('providers.approve') && r.status === 'pending' && <ActionBtn ... />}

4. Add a confirm dialog for suspend (account-killing) with mandatory reason ≥20 chars + ConfirmDialog from components/ui (NOT inline div modal — see MED-301 below).

5. Audit row on every action — already captured by auditMiddleware globally, verify the row includes the `reason` text.

6. Tests:
   - Render ProvidersPage with role='admin' (no provider perms); assert action buttons NOT rendered.
   - With role='super_admin' OR perm='providers.suspend'; assert Suspend button renders for approved providers.
   - Server integration: PUT /admin/providers/:id/suspend as junior admin → 403; as super_admin → 200.
```

**Runtime verification:**
1. Seed two admin users: super@onservice.us (super_admin), support@onservice.us (admin + perms=['support.manage'] only).
2. Log in as support@onservice.us, navigate to /providers.
3. Take screenshot. Approve/Reject/Suspend/Reactivate/Tier buttons MUST NOT render.
4. Try to call PUT /api/v1/admin/providers/<id>/suspend directly via curl with support's session cookie → 403 with explicit "Missing permission: providers.suspend" body.
5. Log in as super@onservice.us → buttons SHOULD render. Suspend a test provider → admin_actions row created with reason logged.

---

### CRIT-131 — Provider review visibility toggle (`PATCH .../reviews/:reviewId/visibility`) gated only by `requireAdmin`, NOT super_admin — any admin can hide any customer review with one click and no reason
**Files:**
- [apps/admin/src/pages/ProviderDetailPage.tsx:682-690, 717-724](apps/admin/src/pages/ProviderDetailPage.tsx#L682)
- [packages/api/src/routes/provider-admin.routes.ts:136-152](packages/api/src/routes/provider-admin.routes.ts#L136)

```tsx
// ProviderDetailPage.tsx — line 682-690 — no reason field, no super_admin gate
const visibility = useMutation({
  mutationFn: async (args: { reviewId: string; isVisible: boolean }) => {
    await api.patch(
      `/api/v1/admin/providers/${providerId}/reviews/${args.reviewId}/visibility`,
      { isVisible: args.isVisible },  // ← only payload is the boolean
    );
  },
  onSuccess: () => void queryClient.invalidateQueries(...),
});
...
<Button ... onClick={() => visibility.mutate({ reviewId: r.id, isVisible: !r.isVisible })}>
  {r.isVisible ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}
</Button>
```

```ts
// provider-admin.routes.ts — line 136-152
router.patch(
  '/:id/reviews/:reviewId/visibility',
  authMiddleware,
  async (req, res, next) => {
    try {
      requireAdmin(req);  // ← admin OR super_admin
      const { isVisible } = req.body ?? {};
      ...
      await providerAdminService.setReviewVisibility((req.params.reviewId as string), isVisible);
      res.json({ success: true });
    }
  }
);
```

A customer leaves a 1-star review of a provider with detailed criticism. A junior admin (provider's friend, or just an admin who likes that provider) clicks Hide. Review is gone from public view. **No reason field**, **no super_admin gate**, **no notification to the reviewing customer**, **no preview of impact** (would the average rating change?).

**Real-world impact:** complaint suppression. NPC RA 10173 grants the customer the right to know their data (the review they wrote) is being processed. A hidden review is still being processed (stored), but its public visibility is altered without notice. Customer trust in the platform's review system collapses. Competitors use this as a marketing weapon ("onService PH censors negative reviews").

Worse: a junior admin who is a provider's spouse/friend/colleague could systematically hide every negative review, and current audit trails capture only the hide action without context (the auditMiddleware logs the request body which is just `{ isVisible: false }`).

**Fix dispatch:**
```
1. Server (provider-admin.routes.ts:136-152):
   - Require super_admin OR perm 'reviews.moderate'.
   - REQUIRE a `reason` field, min 20 chars, recorded to admin_actions.
   - Body schema: { isVisible: boolean, reason: string (min 20 chars) }
   - Return 400 if reason is too short.

2. Client (ProviderDetailPage.tsx:682-728):
   - Add a ConfirmDialog with reason textarea (min 20 chars) before firing the mutation.
   - Show a preview: "Hiding this review will lower this provider's average rating from 4.8 to 4.6 — confirm?"
   - Notification: when a review is hidden, send an email to the customer who wrote it: "Your review of <provider> was hidden by an admin. Reason given: <reason>. You may dispute this at <link>."

3. Add a "Restore + reason" review-history audit trail visible to super_admin only. Every visibility change with reason is in this trail.

4. Tests:
   - Render ReviewsTab with role='admin' (no perm); assert Hide button is disabled OR not rendered.
   - With role='super_admin'; clicking Hide opens a ConfirmDialog with a reason textarea.
   - Server: PATCH .../visibility without reason → 400.
   - Audit: PATCH succeeds → admin_actions row exists with reason.

5. Bundle with the staff-permissions dispatch (CRIT-23/56/120/121/130).
```

**Runtime verification:**
1. Seed a provider with 5 reviews (one 1-star with detailed criticism).
2. Log in as junior admin → Hide button missing OR disabled.
3. Log in as super_admin → click Hide → modal opens, REASON required, character counter visible.
4. Submit reason "Provider was framed by a competitor — verified via internal investigation" → mutation succeeds.
5. Customer who wrote the review receives an email within 60 seconds.
6. Audit log shows the hide action with reason text.

---

### CRIT-132 — `StaffRolesPage` has ZERO client-side role gate; non-super-admin can navigate there and see broken UI (server saves us, but UX is busted and routing is leaky)
**Files:**
- [apps/admin/src/pages/StaffRolesPage.tsx:1-443](apps/admin/src/pages/StaffRolesPage.tsx) — entire page; `useAuthStore` is not even imported
- [apps/admin/src/App.tsx](apps/admin/src/App.tsx) — page mounted without a RequireSuperAdmin wrapper

```tsx
// StaffRolesPage.tsx — line 1-7 — note: NO useAuthStore import
import React, { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';
// ❌ no `import { useAuthStore } from '@/stores/auth.store'`
```

Server-side check (verified in `staff.routes.ts`): every endpoint has `rbacMiddleware('super_admin')`. So the API returns 403 to non-super-admin. **No data leak; no privilege escalation through this route.**

But:
1. The page renders for any logged-in admin who navigates to it. They see the page chrome, the empty data table, "Failed to load roles" toast, and the buttons (which are non-functional because every API call returns 403).
2. Sidebar.tsx (per F01) only gates `/settings/cancellation-policy` to super_admin. `/staff` is visible to every admin.
3. Junior admin navigates to /staff out of curiosity → sees a confusing broken UI → contacts engineering ("the staff page is broken for me"). Wastes engineer time. Worse: if the request rate from junior admins clicking this page generates audit log noise, signal-to-noise drops on real issues.
4. **Edge case** (verified in router code): no `audit_log` row is written for failed-permission requests, only successful writes. So this leakage is just UX, not a security log noise.

**Severity reasoning:** I almost wrote this as a CRIT for "privilege escalation via role dropdown in the row." Then I read staff.routes.ts and confirmed the server enforces super_admin on every endpoint including PUT /staff/:id (which the row dropdown calls). So the privilege escalation does NOT work end-to-end. Demoting to CRIT only because of the discoverability issue + Sidebar visibility — actually it's a MED at most. **Demoting to MED-301.** No new CRIT here. Kept CRIT-132 number free; F03 net adds 7 CRITs.

---

### CRIT-132 (re-numbered) — admin UI shows ALL admins the customer wallet credit form when viewing a customer paid out via wallet — UI is super_admin gated, but PII (phone, email, full address, IPs, user-agent) is visible to junior admins on every detail page
**Files:**
- [apps/admin/src/pages/CustomerDetailPage.tsx:330-355, 1080-1115](apps/admin/src/pages/CustomerDetailPage.tsx#L330)
- [apps/admin/src/pages/ProviderDetailPage.tsx:294-336, 794-823](apps/admin/src/pages/ProviderDetailPage.tsx#L294)
- [apps/admin/src/pages/AuditLogPage.tsx:153-178](apps/admin/src/pages/AuditLogPage.tsx#L153)

```tsx
// CustomerDetailPage — line 336-345 — phone + email + address ALL admins
<div className="flex items-center gap-4 mt-2 text-sm ...">
  <span><Phone /> {profile.phone}</span>
  {profile.email && <span><Mail /> {profile.email}</span>}
  <span><Calendar /> joined {...}</span>
</div>

// ActivityTab — line 1100-1110 — IP + user-agent visible to ALL admins
<td className="px-3 py-2 text-xs font-mono">{r.ipAddress ?? '—'}</td>

// AuditLogPage — line 153-178 — visible to ALL admins
<td>{entry.userEmail ?? 'System'}</td>  ← every actor's email exposed
<td>{entry.ipAddress ?? '—'}</td>       ← every actor's IP exposed
```

The CustomerHeader shows phone and email in a wide-visible header card. The ActivityTab shows IP addresses and user-agents — **for the customer's own logins**, exposed to admins.

Per NPC RA 10173 §11 (data minimization): admins should only see PII they need for their job. A junior support agent (`role='admin'`, intended permissions: `tickets.view` + `tickets.respond`) can:
- See every customer's phone number across the platform
- See every customer's email address across the platform
- See every customer's IP addresses (login history)
- See every customer's user-agent (device fingerprinting data)
- See the same for every provider (ProviderDetailPage)
- See every actor's email and IP in the AuditLogPage

This is a CRIT because it's not gated, and it's the dominant cross-cutting PII exposure on the admin web. **CRIT-63 family from earlier phases — this is the admin-side mirror.**

**Fix dispatch:**
```
1. Add a `RedactPii` wrapper component:
   <RedactPii required="customers.view_pii" fallback="••• ••• ••••">
     {profile.phone}
   </RedactPii>

2. Server (paired with CRIT-23/56): add granular permission flags:
   - customers.view_pii (phone, email, address, IP)
   - customers.view_id (avatar, ID, selfie)
   - customers.financials_view (wallet, transactions)
   - providers.view_pii / providers.view_id / providers.financials_view (parallel)
   - audit.view_user_pii  (defaults true ONLY for super_admin)
   - audit.view_user_emails  (specific permission for the user-email column in AuditLogPage)

3. Client `useAuthStore` exposes permissions[]. Each admin page wraps PII in <RedactPii>.

4. Audit log: when a junior admin views a customer's PII (server returns full PII to super_admin, redacted to junior), record the access to admin_actions with action_type='customer_pii_viewed'. NPC compliance.

5. Tests:
   - CustomerDetailPage rendered with role='admin' (no view_pii perm); assert phone shows "••••", not the real number.
   - With role='super_admin' OR perm='customers.view_pii'; phone is visible.
   - AuditLogPage: redact email and IP for junior admins.
```

**Runtime verification:**
1. Seed customer with phone 09171234567, email test@example.com.
2. Log in as junior admin → /customers/<id> shows phone "••••••67890" (last 4 only) AND email "t***@example.com".
3. Log in as super_admin → full phone and email shown.
4. Server-side: GET /admin/customers/<id> with junior admin's session returns redacted phone/email; with super_admin returns full.
5. Audit row written when super_admin opens the page (action='customer_full_pii_viewed').

---

### CRIT-133 — Customer + Provider wallet credit/adjust forms have NO upper bound, NO confirmation dialog, NO real-time balance preview; reason min 5 chars (admin can issue ₱10,000,000 credit by typo)
**Files:**
- [apps/admin/src/pages/CustomerDetailPage.tsx:638-735](apps/admin/src/pages/CustomerDetailPage.tsx#L638) — customer credit form
- [apps/admin/src/pages/ProviderDetailPage.tsx:545-617](apps/admin/src/pages/ProviderDetailPage.tsx#L545) — provider wallet adjust form

```tsx
// CustomerDetailPage credit form — line 707-734
<Button
  size="sm"
  disabled={
    credit.isPending ||
    reason.trim().length < 5 ||  // ← only 5 chars
    !amountPesos ||
    Number.isNaN(parseFloat(amountPesos)) ||
    Math.round(parseFloat(amountPesos) * 100) === 0
  }
  onClick={() => credit.mutate({ amount: Math.round(parseFloat(amountPesos) * 100), reason })}
>
  Issue credit
</Button>
```

No confirm dialog. No upper bound (admin types `1000000` thinking ₱1,000 → wallet credited ₱1,000,000). No preview of resulting balance.

Server (`customer-admin.routes.ts:162-180`) is super_admin gated, but the server-side service might also lack bounds. Even if super_admin only, a tired super_admin at 2 AM types an extra zero — there's no defense. The audit row will record the typo, but the customer will see ₱1,000,000 in their wallet for 4 hours until the next reconciliation.

Same pattern on ProviderDetailPage at line 593-616. Same risk, scaled by N providers.

**Real-world impact:** support agent at 2 AM has 50 reconciliation refunds to issue. Types `5000` for what should be `500`. Customer sees ₱5,000 in wallet, withdraws via PayMongo → real money out the door. Reversing requires manual intervention + dispute paperwork + customer goodwill recovery.

**Fix dispatch:**
```
1. Add an upper-bound config:
   platform_settings: { admin_credit_max_centavos: 50000_00 }  // ₱50,000 default
   - Configurable by super_admin via SystemSettingsPage.

2. Client (CustomerDetailPage:638-735, ProviderDetailPage:545-617):
   - Real-time preview: "New balance: ₱X (was ₱Y)"
   - Reason min 20 chars (raise from 5).
   - Confirm dialog for amounts > ₱5,000:
     <Dialog>
       <DialogTitle>Confirm wallet credit</DialogTitle>
       <p>Customer/Provider: {name}</p>
       <p>Amount: <strong>{formatCurrency(amount)}</strong></p>
       <p>New balance: {formatCurrency(currentBalance + amount)}</p>
       <p>Reason: {reason}</p>
       <input placeholder="Type CONFIRM to issue" />
       <Button disabled={typedConfirm !== 'CONFIRM'}>Issue Credit</Button>
     </Dialog>
   - Hard cap from server config; if amount > config, show "Exceeds platform max — escalate to super_admin override."
   - Two-person rule for amounts > ₱25,000: require a second super_admin to co-sign.

3. Server:
   - Validate amount against `admin_credit_max_centavos` setting.
   - For amounts > ₱25K, require co-signing (separate endpoint /credit/cosign).
   - If amount > setting, return 422 "Amount exceeds admin credit max."

4. Tests:
   - Render credit form; entering 100000.00 (₱100K, > 50K cap) → submit shows "Exceeds platform max."
   - Entering 1000.00 → no warning.
   - Entering 25000.01 → triggers co-sign flow.
   - Server rejects 100000.00 with 422.
```

**Runtime verification:**
1. Set `admin_credit_max_centavos = 5000_00` (₱5,000 cap) in DB.
2. Open admin /customers/<id>, navigate to Payments.
3. Type amount 6000.00 (₱6,000), reason 25 chars, click Issue Credit.
4. Confirm dialog appears with "Exceeds platform max" message; submission blocked.
5. Type 4000.00 (within cap); confirm dialog appears with new-balance preview; type CONFIRM; submission succeeds.
6. Audit row records reason + amount + admin user.

---

### CRIT-134 — Customer + Provider wallet adjustment with NEGATIVE amount has NO check that the adjustment can't drive the wallet below zero; admin debits provider ₱100K from a wallet with ₱500 balance
**Files:**
- [apps/admin/src/pages/CustomerDetailPage.tsx:638-735](apps/admin/src/pages/CustomerDetailPage.tsx#L638)
- [apps/admin/src/pages/ProviderDetailPage.tsx:545-617](apps/admin/src/pages/ProviderDetailPage.tsx#L545)

The credit input accepts `-5000.00` (negative). The amount in centavos is `Math.round(-5000.00 * 100) = -500000` and is sent to server. Server (`customerAdminService.creditCustomerWallet`) likely just adds to the balance — making it -₱4,500. Wallet goes negative.

```tsx
// CustomerDetailPage:679-685 — explicit doc that negative debits
<p className="text-xs ...">
  Positive amount credits the customer wallet; negative debits. Logged to <code>admin_actions</code>...
</p>
```

UI explicitly says negative debits, but doesn't show resulting balance and doesn't enforce non-negative result.

**Real-world impact:** admin tries to claw back a goodwill credit they accidentally issued. Customer wallet has ₱500 (the goodwill credit + ₱200 unrelated). Admin types -750 to claw back. Wallet now -₱50. Customer's next booking attempt fails with "insufficient balance" + customer didn't know they had a debt → support ticket explosion.

**Fix dispatch:**
```
1. Client:
   - On input change, if negative AND |amount| > current balance: warn "This debit exceeds the wallet balance. Are you sure?"
   - Confirm dialog must explicitly show: "After this adjustment: ₱X (NEGATIVE)" if negative.
   - Default: don't allow ending balance < 0. Require explicit "Yes, allow negative balance" toggle for the rare case.

2. Server (`creditCustomerWallet`, `adjustProviderWallet`):
   - Read current balance.
   - If newBalance < 0 AND `allow_negative=false`: 422.
   - If newBalance < 0 AND `allow_negative=true`: log to admin_actions as 'NEGATIVE_BALANCE_EXTENT' with extent.
   - Configurable: platform_settings.admin_allow_negative_wallet_balance: false by default.

3. Tests:
   - Adjust ₱-1000 on a wallet with ₱500 → 422 "would exceed available balance".
   - Adjust ₱-300 on ₱500 → ok.
   - Adjust ₱-1000 on ₱500 with override flag → ok, audit row marked.
```

**Runtime verification:**
1. Seed customer with wallet=500 (centavos: 50000).
2. Adjust -1000 (centavos: -100000), reason "test claw-back".
3. Server returns 422 with explicit message.
4. Adjust -300 (centavos: -30000) → succeeds, wallet=200.
5. Audit row reflects.

---

### CRIT-135 — Audit log page exposes raw `oldValues` / `newValues` JSON to ALL admins; password hashes, MFA secrets, internal tokens may leak
**Files:**
- [apps/admin/src/pages/AuditLogPage.tsx:204-222](apps/admin/src/pages/AuditLogPage.tsx#L204)
- [packages/api/src/routes/admin.routes.ts:1574-1595](packages/api/src/routes/admin.routes.ts#L1574)

```tsx
// AuditLogPage — line 209-220 — RAW JSON, no redaction
{selectedEntry.oldValues && (
  <div>
    <pre className="...">{JSON.stringify(selectedEntry.oldValues, null, 2)}</pre>
  </div>
)}
{selectedEntry.newValues && (
  <div>
    <pre className="...">{JSON.stringify(selectedEntry.newValues, null, 2)}</pre>
  </div>
)}
```

```ts
// admin.routes.ts — line 1574-1601 — server returns whatever's in the audit_log row
SELECT al.*, ...
```

The auditMiddleware writes `oldValues` and `newValues` based on the route's request body and DB diff. For sensitive routes:
- POST /auth/login (could leak `password` if not redacted)
- PATCH /auth/me (could leak hashed password fields if accidentally included)
- POST /auth/admin/2fa/enable (could leak `totpSecret` if it ends up in old/newValues)
- POST /admin/payouts/:id/complete (could leak `paymongoTransferId` — that's a Stripe-class secret if leaked)

Without auditing the auditMiddleware itself + sanitizing oldValues/newValues, admin-side audit log is a secret-leak vector. **Junior admin (or even super_admin who shouldn't see these) sees raw secrets.**

Worse — there's no test ensuring sensitive fields are stripped before they hit audit_log. Any dev who adds a new route can accidentally include a sensitive field in the body, and it becomes audit_log permanent.

**Real-world impact:** a former staff member with admin access exfiltrates audit_log → gets PayMongo tokens, internal API keys, customer passwords. Massive incident.

**Fix dispatch:**
```
1. Server middleware: define a sensitive-field denylist:
   const SENSITIVE_FIELDS = [
     'password', 'password_hash', 'totp_secret', 'recovery_code',
     'paymongoTransferId', 'paymongo_transfer_id', 'paymongo_secret',
     's3_secret', 'access_token', 'refresh_token', 'csrf_token',
     'api_key', 'webhook_secret', 'stripe_pk', ...
   ];

2. In auditMiddleware (where oldValues / newValues are written):
   - Walk the object recursively. For any key matching SENSITIVE_FIELDS (case-insensitive), replace value with '[REDACTED]'.
   - Write only redacted version to audit_log.

3. CI check: scan audit_log query+ raw values during e2e tests; any test that creates an audit row with one of SENSITIVE_FIELDS in oldValues/newValues should FAIL.

4. Migration: review existing audit_log rows for leaked secrets:
   SELECT id, action FROM audit_log WHERE old_values::text ~* '(password|secret|token)' OR new_values::text ~* '...';
   Move identified rows to a quarantine table for super_admin review only.

5. Client (AuditLogPage:204-222): keep the JSON display, since it's already redacted server-side. Add a banner: "Sensitive fields are automatically redacted as [REDACTED]."

6. Tests:
   - Create an audit_log row via /auth/login; old_values must NOT contain 'password'.
   - Create an audit_log row via /auth/admin/2fa/enable; new_values must NOT contain 'totp_secret'.
```

**Runtime verification:**
1. Migrate audit log redaction middleware.
2. Hit POST /auth/admin/2fa/enable with a real TOTP code.
3. SELECT new_values FROM audit_log WHERE action='POST /auth/admin/2fa/enable' ORDER BY created_at DESC LIMIT 1.
4. Output must show `"totp_secret":"[REDACTED]"`, not the actual secret.
5. Open AuditLogPage, click the entry → JSON view shows [REDACTED] in place of secret.

---

## MEDIUM bugs (continuing from MED-300)

### MED-301 — `StaffRolesPage` has zero client-side role gate; non-super-admin sees broken UI
**File:** [apps/admin/src/pages/StaffRolesPage.tsx:1-7, 416-443](apps/admin/src/pages/StaffRolesPage.tsx#L1)

Server-side correctly gated to super_admin (verified in `staff.routes.ts`). Client-side has no `useAuthStore` import, no role check. Junior admin can navigate to /staff and see broken UI. Sidebar (per F01) doesn't gate this route to super_admin (only `/settings/cancellation-policy` is gated).

**Fix:** add `RequireSuperAdmin` wrapper to App.tsx route + add `superAdminOnly: true` to Sidebar nav config for `/staff`. Bundle with F01 MED-272 (per-route role gating dispatch).

### MED-302 — Customer status filter dropdown only includes `active` and `inactive`; misses `suspended`, `flagged_fraud`, etc.
**File:** [apps/admin/src/pages/CustomersPage.tsx:130-139](apps/admin/src/pages/CustomersPage.tsx#L130)

Server's customer status enum likely includes more values (per `customerAdminService.updateCustomerStatus` actions: 'suspend', 'reactivate', 'flag_fraud'). Admin can't filter to "show me all suspended customers" or "show me flagged-fraud customers." Bundle with the standardize-status-enums dispatch.

### MED-303 — Customer bookings status filter MISSING values: `cancelled_by_provider`, `cancelled_by_admin`, `completed`, `arrived`, `started`, `expired`, `refunded`
**File:** [apps/admin/src/pages/CustomerDetailPage.tsx:537-543](apps/admin/src/pages/CustomerDetailPage.tsx#L537)

Status enum drift on the booking status. Server likely has 13+ values; client has 6. Same family as MED-302.

### MED-304 — Provider job status filter MISSING values: `paid`, `requested`, `arrived`, `started`, `expired`, `cancelled_by_admin`, `refunded`
**File:** [apps/admin/src/pages/ProviderDetailPage.tsx:466-472](apps/admin/src/pages/ProviderDetailPage.tsx#L466)

Same family as MED-303.

### MED-305 — `'flag_fraud'` action on customer status mutation has no UI explanation of what it does
**File:** [apps/admin/src/pages/CustomerDetailPage.tsx:392-399](apps/admin/src/pages/CustomerDetailPage.tsx#L392)

Admin clicks "Flag for fraud" with no popup explaining the consequences (does it suspend? Lock bookings? Notify customer? Create an internal review queue item?). The customerAdminService.updateCustomerStatus likely sets some flag but the admin has no mental model. **Fix:** add tooltip or modal explanation: "Flagging for fraud creates an internal review case. Customer will be unable to make new bookings until manually un-flagged. Customer is NOT notified."

### MED-306 — `flag_fraud` is irreversible from this UI — no "Un-flag" button shown
**File:** [apps/admin/src/pages/CustomerDetailPage.tsx:296-405](apps/admin/src/pages/CustomerDetailPage.tsx#L296)

Once flagged, admin must escalate to engineering or do a DB write to clear the flag. **Fix:** add an "Un-flag" mutation that sets the flag to false. Audit log row.

### MED-307 — `data.rows.length.toString()` on the Disputes KPI shows the *paginated* count, not the total; misleading for any customer with > 1 page of disputes
**File:** [apps/admin/src/pages/CustomerDetailPage.tsx:861](apps/admin/src/pages/CustomerDetailPage.tsx#L861)

Disputes interface returns `rows[]` but no `total`. The KPI says "Total disputes filed: 5" when actually the customer has 23 spread across pages. **Fix:** server returns `total` field; UI uses it.

### MED-308 — Avatar URLs are direct S3 URLs (CRIT-125 family)
**Files:** CustomerDetailPage:319-326, ProviderDetailPage:298-302

Same as F02 CRIT-125 (BIR receipts + dispute evidence). Profile avatars also leak via this pattern.

### MED-309 — Inline modal divs (`<div className="fixed inset-0 ...">`) on ProvidersPage instead of `<Dialog>`
**File:** [apps/admin/src/pages/ProvidersPage.tsx:255-318](apps/admin/src/pages/ProvidersPage.tsx#L255)

Same as F02 MED-293 (DisputesPage, PayoutsPage). Add `ProvidersPage` to that fix dispatch.

### MED-310 — Audit log UI has filter capability gap: server supports `from`, `to`, `userId` query params; client only exposes `action` and `entityType`
**Files:** [apps/admin/src/pages/AuditLogPage.tsx:55-65](apps/admin/src/pages/AuditLogPage.tsx#L55) + [packages/api/src/routes/admin.routes.ts:1545-1564](packages/api/src/routes/admin.routes.ts#L1545)

```ts
// server supports these filters (admin.routes.ts:1545-1564):
if (req.query.userId ...) { ... }
if (req.query.from ...) { ... }
if (req.query.to ...) { ... }

// client (AuditLogPage:55-65) only sends:
if (actionFilter) params.action = actionFilter;
if (entityTypeFilter) params.entityType = entityTypeFilter;
```

**Fix:** add date-range pickers + user-id picker (autocomplete on user emails). Bundle with the audit-log enhancements dispatch.

### MED-311 — AuditLogPage has no CSV export; required for NPC compliance
**File:** [apps/admin/src/pages/AuditLogPage.tsx:1-254](apps/admin/src/pages/AuditLogPage.tsx)

Compliance officer asked for "all audit log entries from January 2026" → admin clicks through pages by hand. **Fix:** add `<Button>Export CSV</Button>` that hits a server endpoint with the same filters; server streams CSV with full pagination.

### MED-312 — AuditLogPage shows `userEmail` and `ipAddress` to all admins; should be PII-gated (CRIT-132 family)
Already covered by CRIT-132 fix dispatch.

### MED-313 — Notes Tab `'legal'` category should require super_admin to write
**File:** [apps/admin/src/pages/ProviderDetailPage.tsx:894-899, 850](apps/admin/src/pages/ProviderDetailPage.tsx#L894)

Any admin can write a note tagged 'legal' about a provider. These notes are stored permanently and may be subpoenaed. A junior admin writing "this provider seems fraudulent" in a 'legal' note creates legal exposure — defamation risk. **Fix:** server-side validate that 'legal' category notes can only be created by super_admin. Client-side hide 'legal' option from the dropdown for non-super-admin.

### MED-314 — Notes Tab create has no min-length on body; admin can save empty-string notes
**File:** [apps/admin/src/pages/ProviderDetailPage.tsx:843-908](apps/admin/src/pages/ProviderDetailPage.tsx#L843)

Server (`provider-admin.routes.ts:221-240`) takes `String(body ?? '')` — accepts empty. **Fix:** require min 10 chars on body. Server enforces.

### MED-315 — StaffTab role-change via row dropdown has NO confirmation; click and the role is changed (super_admin gated server-side, but UX is dangerous for super_admin who clicks accidentally)
**File:** [apps/admin/src/pages/StaffRolesPage.tsx:300-310](apps/admin/src/pages/StaffRolesPage.tsx#L300)

```tsx
<select value={r.role_id} onChange={(e) => updateMutation.mutate({ id: r.id, roleId: e.target.value })}>
```

Super_admin clicks the role dropdown by mistake on the wrong row, accidentally promotes a junior admin to super_admin. **Fix:** click should open a confirm modal "Change <name>'s role from X to Y?" with a reason field min 20 chars before mutation fires.

### MED-316 — StaffTab "Add Staff" form takes raw "User ID" text input (UUID paste); same UX gap as F02 MED-281
**File:** [apps/admin/src/pages/StaffRolesPage.tsx:366-373](apps/admin/src/pages/StaffRolesPage.tsx#L366)

Admin must paste a user UUID. **Fix:** replace with email-search autocomplete that resolves to user_id server-side. Same family as F02 MED-281.

### MED-317 — `if (confirm(...))` (native browser confirm) used for destructive role/staff deletes
**File:** [apps/admin/src/pages/StaffRolesPage.tsx:211, 339](apps/admin/src/pages/StaffRolesPage.tsx#L211)

Native `confirm()` is the weakest dialog — no reason field, no record of intent. Both delete-role and remove-staff use it. **Fix:** replace with `<ConfirmDialog>` from components/ui, with a min-20-char reason and audit-row preview.

### MED-318 — StaffTab admin can deactivate themselves with one click (no safeguard)
**File:** [apps/admin/src/pages/StaffRolesPage.tsx:331-336](apps/admin/src/pages/StaffRolesPage.tsx#L331)

```tsx
<button onClick={() => updateMutation.mutate({ id: r.id, isActive: !r.is_active })}>
  {r.is_active ? 'Deactivate' : 'Activate'}
</button>
```

Super_admin opens /staff, hits "Deactivate" on their own row, gets immediately logged out (refresh token revoked) AND has no other super_admin to reactivate them. Platform locked out. **Fix:** disable the button when `r.user_id === currentUser.id` (or show "Deactivate Self (locks you out — type your password to confirm)" flow).

### MED-319 — Provider Verified docs lack expiry warnings; expired NBI clearance shows date but no "expired" badge
**File:** [apps/admin/src/pages/ProviderDetailPage.tsx:345-346](apps/admin/src/pages/ProviderDetailPage.tsx#L345)

```tsx
<DocLine label="NBI Clearance" url={profile.documents.nbiClearanceUrl}
  extra={profile.documents.nbiExpiryDate ? `expires ${formatDateOnly(profile.documents.nbiExpiryDate)}` : null} />
```

If today is 2026-05-01 and NBI expires 2026-04-30, admin sees "expires 2026-04-30" without the word EXPIRED. Provider may have been working with expired clearance. **Fix:** if `new Date(nbiExpiryDate) < new Date()`, render `<Badge label="EXPIRED" variant="danger" />` next to the line. Same family as CRIT-118 (NbiStatusBanner).

### MED-320 — Customer + Provider activity tabs offer no date-range filter; admin scrolls a 50-200 entry list with no time scoping
**Files:** CustomerDetailPage:1041-1069, ProviderDetailPage:780-822

For an investigation ("did this customer log in on March 15?"), admin must scroll. **Fix:** add date-range filter and "show only failed logins" filter.

---

## LOW / INFO

- **CustomerDetailPage Tabs structure** is well-designed (Profile / Bookings / Payments / Disputes / Referrals / Activity). Mirror is a clean pattern.
- **fmtCentavos** in CustomerDetailPage and `formatPHP` in ProviderDetailPage — two different helpers for the same formatting. Both are correct; should be consolidated to `lib/format.ts` (already exists per F01 — extend to handle centavos→pesos).
- **Server-side customer-admin routes** correctly gate writes to super_admin. Read-only routes are admin (admin OR super_admin), which is fine for the role split intent.
- **TIER_BADGE map** correctly includes 'founding' even though the dropdowns don't (CRIT-129). Display works; mutation gap is the issue.
- **DisputesPage party-history pattern** (F02 LOW) is a strong UX feature — Customer/ProviderHistoryCard. Apply this pattern to ProviderDetailPage's DisputesTab (currently just a flat list).
- **`adminConfig.defaultPageSize`** is consistently used (admin.config.ts has 4 values). The `format.ts` helper extension would centralize the centavos formatter.
- **`TabsList className="flex-wrap"`** on ProviderDetailPage handles 7 tabs gracefully. Apply to CustomerDetailPage (6 tabs).
- **AuditLogPage** uses `placeholderData: (prev) => prev` for paginated UX — good pattern.
- **The `adminConfig.defaultPageSize`** value is 20 (per F01), so customer/provider list pages return 20 per page. Reasonable for launch.
- **`format.ts`** at 10 lines (per F01) has only `formatCurrency`. CustomerDetailPage uses centavos-input variant `fmtCentavos` (line 196-199) — slightly different from F01's `formatCurrency`. Two patterns coexist; consolidate to one helper.
- **`admin.routes.ts:148-163`** (provider list endpoint) reads search/status/tier filters from query params correctly; server-side filtering verified.

---

## Cross-cutting families this phase newly fed

- **PII exposure to junior admins** (CRIT-132): now covers CustomerHeader, ProviderHeader, CustomerActivityTab, ProviderActivityTab, AuditLogPage. 5 sites.
- **Status enum drift** (MED-302/303/304): customer status filter, customer bookings status filter, provider job status filter. 3 new sites.
- **Provider tier 'founding' missing** (CRIT-129): admin filter dropdown + admin tier-change dropdown. **+2 sites** — total CRIT-97 family count is now 7+ sites.
- **Reason min length inconsistency** (F02 MED-288 family): admin status reason 5 chars, provider reject/suspend reason 10 chars, wallet credit/adjust 5 chars, dispute resolution 20 chars, review hide 0 chars (CRIT-131). Need a single `MIN_REASON_CHARS=20` for any admin_actions write. **+5 sites**.
- **No confirmation dialog on destructive actions** (F02 MED-283 family): wallet credit, wallet adjust, role change, staff delete, review hide. **+5 sites**.
- **Hardcoded enum drift between client and server**: customer status (3 client-side vs N server-side), customer bookings status (6 vs 13+), provider jobs status (6 vs 13+), provider tier (4 vs 5).
- **Audit-log secret leak vector** (CRIT-135) — new family, separate from PII exposure. Affects every sensitive route's body in audit_log.
- **Onboarding theatre extends to admin side** (CRIT-128) — admin sees "not stored" for KYC docs because schema has no columns. Couples with Phase E CRIT-115/117.

---

## Phase F running totals (after F03)

| | Lines fully read | Findings docs |
|---|---:|---|
| F01 (Foundations) | 1,180 | 1 |
| F02 (Money + booking + dispute) | 5,079 | 1 |
| **F03 (User + provider + staff + identity + audit)** | **3,256 + ~1,244 server cross-check ≈ 4,500** | **1** |
| **Phase F total so far** | **~10,759** | **3** |

| | New CRITs | New MEDs |
|---|---:|---:|
| F03 | 7 (CRIT-128, 129, 130, 131, 132, 133, 134, 135 — 8 numbered, but CRIT-132 reused after demoting StaffRolesPage finding to MED-301) | 20 (MED-301 through MED-320) |

**Cumulative audit totals after F03:**
- ~63,440 lines fully read
- **134 CRITICAL** bugs (1 invalidated → **133 real**, +7 new this phase)
- **320 MEDIUM** bugs (+20)

**Top F03 fixes by impact:**

1. **CRIT-128 (Government ID + selfie not stored)** — coupled with Phase E CRIT-115/117 (mobile-side onboarding theatre). Single remediation dispatch:
   - Migration: add KYC columns to providers (or new provider_documents table)
   - Server: real /provider-onboarding/identity endpoint (replaces the silent-404 stub)
   - Mobile: real upload (CRIT-115 fix)
   - Admin: signed-URL viewer + verify action
   - **Launch-blocking for NPC + AMLA + business risk.**

2. **CRIT-130 (provider mutation actions = junior admin can suspend any provider)** — bundles with the staff-permissions dispatch (CRIT-23/56/120/121/130). Single fix: server `requirePermission()` middleware + client `<RequireRole>` HOC.

3. **CRIT-132 (PII exposure to all admins)** — separate dispatch: `<RedactPii>` wrapper component + granular permission flags + audit log on PII access.

4. **CRIT-133 + CRIT-134 (wallet credit/adjust unbounded + can-go-negative)** — single dispatch: platform-config max + balance preview + confirm-with-typed-CONFIRM + co-sign for >₱25K + server validation.

5. **CRIT-135 (audit log secret leak)** — middleware-level fix: sensitive-field denylist applied to all auditMiddleware writes; CI test that prevents new sensitive fields from leaking.

6. **CRIT-129 (founding tier missing in admin dropdowns)** — bundles with CRIT-97 dispatch. Single PR adds `<option value="founding">Founding</option>` in 2 places + CI guard.

7. **CRIT-131 (review hide without super_admin gate or reason)** — bundles with CRIT-130 dispatch.

---

## What's left in Phase F

### F04 — Compliance / data-rights (~2,143 lines, next)
- CompliancePage (812)
- ConsentVersionsPage (329)
- DataProtectionLogPage (605)
- NotificationTemplatesPage (397)

### F05 — Catalog / pricing / marketing / ops (~3,892 lines)
- CatalogPage (647), PricingRulesPage (674), MarketingPage (1,301), RecurringPage (222), ServiceAreasPage (407), BusinessAccountsPage (239), SupportTicketsPage (402)

### F06 — Dashboard / analytics / settings (~1,969 lines)
- DashboardPage (505), AnalyticsPage (537), SystemSettingsPage (427), settings/CancellationPolicyPage (500)

### F07 — UI components (~1,000 lines)
- DataTable, Dialog, Pagination, KpiCard, Chart, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Label, LoadingState, Select, Skeleton, Switch, Tabs, Textarea, Tooltip, icons/index

After F07 → PHASE-F-SUMMARY-AND-HANDOFF.md → G (migrations + RLS) → H (test quality audit) → I (master AI-coder instructions).

---

## Discipline notes from this phase

1. **Cross-grep saved a CRIT from being mis-classified.** Initial read of StaffRolesPage looked like privilege escalation. Reading staff.routes.ts (full read, not skim) showed every endpoint is super_admin-gated. Demoted to MED-301. Documented the mistake.

2. **Server-side check is required for every "client-side gap" finding.** Several of my initial "no role gate" findings turned out to be server-gated. Recording the server-side state on each CRIT prevents over-counting.

3. **The "HONESTY-CHECK" comment was a bullhorn.** The server type literally encodes `governmentIdUrl: null` and the comment "Government ID + selfie fields not present in current schema (see HONESTY-CHECK)" — this told me to look harder. The discipline of reading service.ts comments paid off.

4. **F03 confirmed the dominant pattern of Phase 14.** Onboarding theatre (CRIT-115, CRIT-117, now CRIT-128). Fake or broken UI surfacing without server-side support. Match the pattern, not the symptom — fix the schema and the upload flow together, not just hide the "not stored" string.

5. **The "founding tier missing" gap is now in 7+ sites.** CRIT-97 cross-cutting dispatch needs a CI guard, not just a per-site fix.

6. **Reason length inconsistency reveals lack of a single source of truth.** Multiple dev sprints, multiple authors, no shared constant. Add `MIN_REASON_CHARS=20` and `MIN_REASON_CHARS_HIGH_STAKES=50` to a shared config; fix all admin_actions writers to use them.
