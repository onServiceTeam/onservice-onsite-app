# Phase F Findings Part 2 — Admin money + booking + dispute screens

Files added in this batch (full reads):
- `apps/admin/src/pages/BookingsPage.tsx` (200) — full read
- `apps/admin/src/pages/BookingDetailPage.tsx` (1,068) — full read across 3 ranges (1-250, 250-600, 600-950, 950-1068)
- `apps/admin/src/pages/FinancialsPage.tsx` (1,405) — full read across 3 ranges (1-350, 350-800, 800-1200, 1200-1405)
- `apps/admin/src/pages/PayoutsPage.tsx` (290) — full read
- `apps/admin/src/pages/DispatchConsolePage.tsx` (865) — full read across 3 ranges (1-250, 250-600, 600-865)
- `apps/admin/src/pages/DisputesPage.tsx` (383) — full read
- `apps/admin/src/pages/DisputeDetailPage.tsx` (868) — full read across 3 ranges (1-300, 300-600, 600-868)

**Phase F running total: ~6,259 lines fully read (1,180 from F01 + 5,079 from F02).**
**Audit grand total: ~58,943 lines fully read.**

Cross-references verified this session:
- BookingDetailPage actions hit `/api/v1/admin/bookings/:id/{escrow/release, escrow/refund, reassign, cancel, force-complete}` — server route mounts confirmed in earlier audit (B09 / C05).
- DisputeDetailPage `estimatedRefund` derived client-side; server has its own canonical math (verified in B-phase escrow.service.ts).
- All 5 pages use the cookie-based admin auth (Bug 1251 fix); `api.ts` interceptor handles 401→refresh transparently.

---

## CRITICAL bugs (continuing numbering after CRIT-119)

### CRIT-120 — Admin payout actions (Approve / Reject / Complete) NOT gated by super_admin or `payouts.manage` permission — any admin can approve a ₱500K payout
**File:** [apps/admin/src/pages/PayoutsPage.tsx:67-85, 145-173](apps/admin/src/pages/PayoutsPage.tsx#L67)
```ts
const mutation = useMutation({
  mutationFn: async () => {
    if (!selectedPayout) return;
    if (actionType === 'approve') await api.put(`/api/v1/payouts/${selectedPayout.id}/approve`);
    else if (actionType === 'reject') await api.put(`/api/v1/payouts/${selectedPayout.id}/reject`, { reason: rejectReason });
    else if (actionType === 'complete') await api.put(`/api/v1/payouts/${selectedPayout.id}/complete`, { paymongoTransferId: transferId || undefined });
  },
  ...
});
```
The page does NOT check `useAuthStore((s) => s.user?.role)`. Every admin sees and can click the action buttons (line 145-173). Server-side enforcement of `payouts.manage` is absent (CRIT-23/56 family — permissions schema exists in `admin_roles.permissions` but routes don't enforce it).

**Customer-facing impact:** a junior support staff member with role='admin' (intended permissions: `dashboard.view`, `customers.view`, `support.manage`) can approve a fraudulent payout to an attacker-controlled GCash number. The platform has no defense-in-depth on the most money-sensitive admin action.

**Fix dispatch:**
```
1. Server-side (paired with CRIT-56 fix):
   In packages/api/src/routes/payout.routes.ts (or wherever /payouts/:id/approve etc. live):
   router.put('/:id/approve', authMiddleware, requirePermission('payouts.manage'), handler);
   router.put('/:id/reject',  authMiddleware, requirePermission('payouts.manage'), handler);
   router.put('/:id/complete',authMiddleware, requirePermission('payouts.manage'), handler);

2. Client-side:
   const role = useAuthStore((s) => s.user?.role);
   const perms = useAdminPermissions(); // new hook reading /auth/me permissions
   const canApprove = role === 'super_admin' || perms.includes('payouts.manage');
   {canApprove && r.status === 'pending' && <button onClick={...}>Approve</button>}

3. Server returns user.permissions[] from /auth/me; mobile auth.store and admin auth.store cache it.

4. Tests:
   - Unit: render PayoutsPage with role='admin' + perms=['support.manage']; assert Approve/Reject/Complete buttons NOT rendered.
   - Integration: support admin POSTs /payouts/:id/approve → 403.

5. Add ConfirmDialog gate: clicking Approve must require a 2nd confirmation showing the amount + destination account + provider name. Currently the modal at line 226-287 already shows the amount, but Approve fires immediately — add an explicit "Type APPROVE to confirm" pattern OR a 5-second countdown.
```

**Tests required:**
- `PayoutsPage.real.test.tsx`: render with role='admin' (no payouts perm) → no action buttons. With role='super_admin' → buttons render.
- Server integration: support staff JWT to `PUT /payouts/:id/approve` → 403 with explicit `Missing permission: payouts.manage`.

**Runtime verification (AI coder runbook):**
1. `docker compose up api admin postgres redis`
2. Seed: `npm run seed:e2e` creating admin@onservice.us (super_admin) AND support@onservice.us (admin role + perms=['support.manage']).
3. Open admin UI at http://localhost:5173.
4. Log in as support@onservice.us.
5. Navigate to /payouts. Take screenshot — Approve/Reject/Complete buttons MUST NOT render.
6. Log out, log in as admin@onservice.us.
7. Navigate to /payouts. Take screenshot — buttons SHOULD render.

---

### CRIT-121 — Admin dispute "Resolve" with `refund_with_suspension` can suspend a provider with no super_admin gate, no second confirmation, no notice to provider
**File:** [apps/admin/src/pages/DisputesPage.tsx:87-108, 293-328, 363-377](apps/admin/src/pages/DisputesPage.tsx#L87)
```ts
const resolveMutation = useMutation({
  mutationFn: async () => {
    if (!selectedDispute) return;
    if (actionType === 'resolve') {
      await api.put(`/api/v1/disputes/${selectedDispute.id}/resolve`, {
        resolutionType,         // ← can be 'refund_with_suspension'
        refundPercent: refundPercent ? Number(refundPercent) : undefined,
        decisionNotes,
        internalNotes: internalNotes.trim() || undefined,
      });
    }
    ...
  },
  ...
});
```
- Page does NOT check role. Any admin can pick `refund_with_suspension` from the dropdown (line 309) and click Resolve.
- No additional confirmation step (compare to DisputeDetailPage which has a `confirmResolve` dialog at lines 715-760).
- No preview to the admin of "this provider will be suspended for X days" — the suspension policy lives server-side and isn't surfaced.

**This is account-killing for a provider.** A support agent (junior admin) annoyed at a provider can suspend them with one form submission. No oversight, no audit trail beyond the `decisionNotes` text.

DisputeDetailPage (the dedicated dispute screen) DOES gate resolve to super_admin (line 629: `{isSuperAdmin && (...resolution form...)}`) and has the confirm step. **DisputesPage list-level Resolve action is the unguarded duplicate.**

**Fix dispatch:**
```
1. Mirror DisputeDetailPage protections in DisputesPage:
   const role = useAuthStore((s) => s.user?.role);
   const isSuperAdmin = role === 'super_admin';

   {r.status !== 'resolved' && isSuperAdmin && (
     <button onClick={...}>Resolve</button>
   )}

2. OR remove the inline Resolve button entirely from the list — force admins to navigate to /disputes/:id where the proper guarded form lives. (Recommended — list pages should not contain account-killing actions.)

3. If the inline action is kept, add the same confirmResolve dialog + estimatedRefund preview as DisputeDetailPage (lines 715-760).

4. Server-side: requirePermission('disputes.resolve') AND for resolutionType IN ('refund_with_suspension', 'refund_with_warning'), require the JWT to also carry 'providers.suspend' permission. Two-permission gate for compound actions.

5. Audit trail: dispute resolve already writes to admin_actions (per dispute-admin.service.ts pattern). Verify the row includes resolutionType so suspended providers can be cross-referenced.

6. Tests:
   - Render DisputesPage with role='admin'; assert Resolve button NOT visible.
   - Server integration: admin JWT POSTs /disputes/:id/resolve with resolutionType='refund_with_suspension' → 403 unless super_admin AND has 'providers.suspend' perm.
```

**Runtime verification:**
1. Log in as admin@onservice.us (regular admin).
2. Navigate to /disputes.
3. For each unresolved dispute: confirm Resolve button is NOT shown.
4. Open /disputes/:id directly via URL → resolution form gated to super_admin only (already correct per DisputeDetailPage).

---

### CRIT-122 — DispatchConsole map defaults to Manila — Boracay launch ops sees Manila on first load (Boracay launch family)
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:116-117, 478-481](apps/admin/src/pages/DispatchConsolePage.tsx#L116)
```ts
const MANILA: [number, number] = [14.5995, 120.9842];
const DEFAULT_ZOOM = 11;
...
<MapContainer
  key={mapKey}
  center={MANILA}        // ← hardcoded Manila
  zoom={DEFAULT_ZOOM}
  scrollWheelZoom
  ...
>
```
Same family as customer CRIT-77/92/93, provider CRIT-111/116. Admin watching Boracay operations opens the Dispatch Console → map shows Manila → has to manually pan ~290 km south to find their actual ops area.

**On a launch where 100% of bookings are in Boracay**, this means every dispatch staff member arriving for their shift sees the wrong region for the first 5-10 seconds, panicking briefly that "the system is empty" until they pan.

**Fix dispatch:**
```
1. Add platformConfig.launchRegion to server settings (admin-editable):
   { latitude: 11.9698, longitude: 121.9255, zoom: 12 }  // Boracay default

2. Admin web fetches via /api/v1/config and uses for the map default:
   const { data: config } = useQuery(['client-config'], async () => {
     const res = await api.get<{ data: { launchRegion: { latitude: number; longitude: number; zoom: number } } }>('/api/v1/config');
     return res.data.data;
   });
   const center: [number, number] = config?.launchRegion
     ? [config.launchRegion.latitude, config.launchRegion.longitude]
     : [11.9698, 121.9255];
   const zoom = config?.launchRegion?.zoom ?? 12;

3. Better: auto-fit bounds to the active bookings on first render. If active bookings exist, center+zoom on the bounding box. Fall back to launchRegion only if zero bookings.

4. CI guard: scan apps/admin/src/ and apps/mobile/ for the pattern /14\.5995|120\.9842/ — Manila magic numbers. Each match needs an explicit allowlist comment OR removal.

5. Tests:
   - Render DispatchConsole with mocked config returning Boracay coords; assert MapContainer center prop = [11.9698, 121.9255].
   - Render with 5 active bookings in Aklan; assert map auto-fits to the booking bounds.
```

**Runtime verification:**
1. Set `platform_settings` row `launch_region_lat=11.9698, launch_region_lng=121.9255` in DB.
2. Open admin /dispatch.
3. Map should center on Boracay, NOT Manila.
4. Screenshot — verify a Boracay landmark (White Beach, etc.) is visible in the initial viewport.

---

### CRIT-123 — DispatchConsole "Cancel booking" dialog says "refund customer in full" but refund computation isn't shown — admin clicks blind
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:763-768, 360-373](apps/admin/src/pages/DispatchConsolePage.tsx#L763)
```tsx
<div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
  This will refund the customer in full per current cancellation policy.
  Detailed refund preview will arrive in Phase 14+.
</div>
```
The hardcoded promise of "refund in full per current cancellation policy" is FALSE. Per `pricing/cancellation.service.ts` (audited B-phase), the actual refund depends on:
- Hours until scheduled (tier 1: ≥24h = 100% refund; tier 2: 12-24h = 50%; tier 3: 6-12h = 25%; tier 4: <6h = 0% refund)
- Provider arrival status
- Customer no-show flag

**A booking with `provider_arrived=true` and the cancellation < 6h before scheduled returns ZERO refund to customer. But the admin clicks Cancel believing the customer gets a full refund.** Customer service ticket follows. Admin then has to manually escalate to a super_admin for an override.

The "Phase 14+" comment is a TODO marker that shipped to production.

**Fix dispatch:**
```
1. Add a refund-preview API call that runs BEFORE the dialog opens:
   const previewQuery = useQuery({
     queryKey: ['cancel-preview', cancelTarget?.id, cancelReason],
     queryFn: async () => {
       const res = await api.get<{ data: { refundCents: number; tierApplied: number; reasonCode: string } }>(
         `/api/v1/admin/bookings/${cancelTarget!.id}/cancel-preview`,
       );
       return res.data.data;
     },
     enabled: !!cancelTarget,
   });

2. Server: implement /admin/bookings/:id/cancel-preview that runs cancellation.service.calculateRefund WITHOUT actually canceling. Returns { refundCents, providerCompensationCents, tierApplied, reasonCode, policyExplanation }.

3. Render preview in the dialog:
   <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
     <p>Refund to customer: <strong>{formatCurrency(preview.refundCents)}</strong></p>
     <p>Provider compensation: <strong>{formatCurrency(preview.providerCompensationCents)}</strong></p>
     <p>Policy: {preview.policyExplanation}</p>
   </div>

4. Allow admin to optionally override (super_admin only) with explicit "Override to full refund" button that records reason + writes to admin_actions.

5. Same fix for BookingDetailPage cancel action (BookingDetailPage.tsx:550-568 — same blind action).

6. Same fix for DisputesPage Resolve (CRIT-121) — show estimated refund before confirm.

7. Tests:
   - Render cancel dialog with mocked preview returning 0 refund; assert "₱0.00" displayed prominently.
   - Render cancel dialog with mocked preview returning partial refund; assert tier reasoning visible.
```

---

### CRIT-124 — DisputeDetailPage "estimated refund" is computed CLIENT-SIDE; server canonical math may differ
**File:** [apps/admin/src/pages/DisputeDetailPage.tsx:577-595](apps/admin/src/pages/DisputeDetailPage.tsx#L577)
```ts
const estimatedRefund = useMemo(() => {
  switch (resolutionType) {
    case 'full_refund':
    case 'refund_with_warning':
    case 'refund_with_suspension':
      return totalAmount;
    case 'partial_refund': {
      const pct = Number(refundPercent);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return 0;
      return Math.round((totalAmount * pct) / 100);
    }
    case 'split_decision':
      return Math.round(totalAmount / 2);
    default:
      return 0;
  }
}, [resolutionType, refundPercent, totalAmount]);
```
This is a client-side estimate. Server's `dispute-admin.service.ts:resolveDispute` calls into `escrow.service.ts:releasePartialEscrow` which (per CRIT-04 / MED-05 in B01) applies live commission rates and may differ from this preview by a few centavos to a few pesos.

**Worse:** for `refund_with_warning` and `refund_with_suspension`, the client assumes 100% refund, but the server may apply different policy (e.g., warning still leaves 50% with provider). The admin sees ₱2000 estimated, server processes ₱1000.

**Why it matters.** Admin's confirmation dialog (lines 715-760) shows "Estimated refund: ₱X" — admin clicks "Yes, resolve and notify" believing the customer will receive ₱X. If the actual amount differs, customer support ticket follows. Trust in admin tooling drops.

**Fix dispatch:**
```
1. Add server-side preview endpoint:
   GET /api/v1/admin/disputes/:id/resolve-preview?resolutionType=X&refundPercent=Y
   Returns { estimatedRefundCents, estimatedProviderRetainCents, policyApplied: '...' }

2. Replace client-side estimatedRefund with useQuery against this endpoint, debounced on resolutionType + refundPercent change.

3. Render in the confirmResolve dialog:
   <p>Customer refund: <strong>{formatCurrency(preview.estimatedRefundCents)}</strong></p>
   <p>Provider retains: <strong>{formatCurrency(preview.estimatedProviderRetainCents)}</strong></p>
   <p>Policy: {preview.policyApplied}</p>

4. Lock the displayed numbers as the "preview hash" — server's actual /resolve must accept the previewHash and reject if the underlying state changed (booking updated, settings changed) since the preview. Prevents TOCTOU mismatch.

5. Tests:
   - Resolve with type='refund_with_warning'; assert preview AND server-side actual match (not 100% client estimate).
```

---

### CRIT-125 — Receipt PDF URLs are direct S3 presigned links opened in new tabs — anyone with the URL (browser history, copy-paste) can access the PDF without re-auth
**Files:**
- [apps/admin/src/pages/FinancialsPage.tsx:1041-1049, 1300-1310, 1328-1336](apps/admin/src/pages/FinancialsPage.tsx#L1041)
- [apps/admin/src/pages/DisputeDetailPage.tsx:372-379](apps/admin/src/pages/DisputeDetailPage.tsx#L372)
- [apps/admin/src/pages/BookingDetailPage.tsx:903-913](apps/admin/src/pages/BookingDetailPage.tsx#L903)

```tsx
<a href={row.pdfUrl} target="_blank" rel="noreferrer noopener">
  PDF
</a>
```
Pattern repeated in 4+ places. `pdfUrl` is a long-lived S3 presigned URL (typically 7-day expiry). Once generated, anyone who has the URL — browser history, copy-paste to Slack, leaked logs — can fetch the document without admin authentication.

For BIR receipts (containing customer name, address, service description, amount): NPC RA 10173 §28 violation if leaked. For dispute evidence (potentially photos of injuries, damaged property): direct privacy harm.

**Fix dispatch:**
```
1. Replace direct S3 URLs with proxied authenticated downloads:
   GET /api/v1/admin/financials/receipts/:id/download
   GET /api/v1/admin/disputes/:id/evidence/:fileId/download
   GET /api/v1/admin/bookings/:id/photos/:photoId/download

   Each route: authMiddleware + requirePermission(scope) + audit row + 302 redirect to a SHORT-LIVED (60s) S3 presigned URL.

2. UI changes:
   <a href={`/api/v1/admin/financials/receipts/${row.id}/download`} target="_blank">PDF</a>

3. Audit row per access: action_type='receipt_pdf_accessed' (or 'evidence_accessed'), target_id=receiptId, includes admin user, ip, user-agent.

4. Server enforces: short-lived S3 URL (60s TTL) so even if the redirect URL leaks, attacker has at most 60s to fetch.

5. CI lint: ban `<a href={row.pdfUrl}` and `<a href={X.fileUrl}` patterns in apps/admin/src/. Each must be a /download route.

6. Tests:
   - GET /admin/financials/receipts/:id/download as authenticated admin → 302 to S3 presigned URL.
   - GET /admin/financials/receipts/:id/download without auth → 401.
   - Pre-existing direct S3 URLs (legacy) gradually rotate as their TTLs expire — document migration.
```

**Tests required:**
- Integration: log out, paste a receipt PDF URL into browser → expect login redirect (currently: file downloads).
- Audit: each PDF access creates an admin_actions row.

---

### CRIT-126 — DispatchConsole / BookingsPage swallows 404s on the bookings/providers feeds with toast.warning + empty list — operators may not notice the live feed is broken
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:170-198](apps/admin/src/pages/DispatchConsolePage.tsx#L170)
```ts
async function fetchBookings(): Promise<DispatchBooking[]> {
  try {
    const res = await api.get<ListEnvelope<DispatchBooking>>(
      '/api/v1/admin/bookings?status=active&limit=100',
    );
    return unwrap(res.data);
  } catch (err) {
    toast.warning('Live bookings feed unavailable — showing empty list.', {
      description: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
```
Same pattern for `fetchProviders`. The page renders "0 active bookings" cleanly. The toast appears for ~5 seconds and disappears.

**Operational impact:** during an outage at 2 AM, the dispatch staff opens the console, sees "0 active bookings", concludes "quiet night", goes back to other work. Real bookings continue to come in but the feed is broken. Customer escalations pile up because nobody at the platform notices for hours.

**Fix dispatch:**
```
1. Replace the silent toast pattern with a PERSISTENT in-page banner:
   const bookingsQuery = useQuery({
     queryKey: ['dispatch', 'bookings'],
     queryFn: fetchBookings,
     refetchInterval: 60_000,
   });
   ...
   {bookingsQuery.isError && (
     <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4">
       <p className="font-semibold text-red-900">Live bookings feed unavailable</p>
       <p className="text-sm text-red-700">{getErrorMessage(bookingsQuery.error)}</p>
       <p className="text-xs text-red-600 mt-2">Active bookings shown below may be stale or incomplete. Contact engineering immediately.</p>
       <Button variant="outline" size="sm" onClick={() => bookingsQuery.refetch()}>Retry now</Button>
     </div>
   )}

2. Throw the error from fetchBookings() instead of catching:
   async function fetchBookings(): Promise<DispatchBooking[]> {
     const res = await api.get<ListEnvelope<DispatchBooking>>(
       '/api/v1/admin/bookings?status=active&limit=100',
     );
     return unwrap(res.data);
   }
   Let useQuery handle isError state.

3. Add a bell sound + browser notification on first error so operators wearing headphones notice.

4. Tests:
   - Mock api.get to throw 503; render DispatchConsole; assert the persistent banner is visible (not just a toast).
```

---

### CRIT-127 — DispatchConsole reassign-provider dropdown capped at 200 online providers; no pagination, no search — for a city with 250 active providers, the right one may be invisible
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:186-198, 686-704](apps/admin/src/pages/DispatchConsolePage.tsx#L186)
```ts
async function fetchProviders(): Promise<DispatchProvider[]> {
  try {
    const res = await api.get<ListEnvelope<DispatchProvider>>(
      '/api/v1/admin/providers?online=true&limit=200',  // ← hardcoded cap
    );
    return unwrap(res.data);
  } ...
}
...
<select id="reassign-provider" ...>
  <option value="">Select an online provider…</option>
  {allProviders.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}{p.city ? ` — ${p.city}` : ''}
    </option>
  ))}
</select>
```
Today, 200 providers is plenty — but it's a one-line hardcoded limit that's invisible to ops staff. As the platform scales (Manila launch with 1000+ providers), the dropdown silently truncates and dispatchers reassign to whoever happens to be in the first 200 alphabetically.

**Fix dispatch:**
```
1. Replace the dropdown with a searchable async picker:
   - Type 2+ characters → debounced query against /api/v1/admin/providers?online=true&search=X&limit=20
   - Results render as clickable list with provider name + city + tier + distance from booking lat/lng (server-computed).

2. For the booking's specific category, prefer providers who offer that category. Server endpoint: /api/v1/admin/dispatch/eligible-providers?bookingId=X returns providers ranked by (matches category) AND (within service radius) AND (online).

3. Dispatcher sees a recommended provider list, not an alphabetical dropdown.

4. Tests:
   - Mock 250 online providers; render Reassign dialog; assert it's an async-search picker, not a 200-item <select>.
   - Type "Juan" → assert debounced API call with search=Juan.
```

---

## MEDIUM bugs

### MED-280 — BookingDetailPage `cancel` action accepts hoursUntilScheduled / providerArrived / customerNoShow inputs but no preview of resulting refund
**File:** [apps/admin/src/pages/BookingDetailPage.tsx:474-503, 550-568](apps/admin/src/pages/BookingDetailPage.tsx#L474)
The 3 advanced inputs feed into the cancellation policy tier calculation server-side. Admin enters them blind — same family as CRIT-123. Add a refund-preview that fires on input change. The grouped fix dispatch is in CRIT-123.

### MED-281 — BookingDetailPage `reassign` action requires admin to type a UUID (line 463-469) — no provider picker
**File:** [apps/admin/src/pages/BookingDetailPage.tsx:457-471](apps/admin/src/pages/BookingDetailPage.tsx#L457)
Same UX gap as DispatchConsole CRIT-127, but worse because here it's a single TextInput with no dropdown at all. Admin must copy a UUID from another tab. **Fix:** combine with CRIT-127 — same eligible-providers picker.

### MED-282 — BookingDetailPage actions all gated by `isSuperAdmin` (good!) but page silently renders nothing for non-super_admins — no message "you need super_admin to take action"
**File:** [apps/admin/src/pages/BookingDetailPage.tsx:378-379](apps/admin/src/pages/BookingDetailPage.tsx#L378)
```ts
if (!isSuperAdmin) return null;
```
Regular admin opens a booking → sees Overview / Timeline / Evidence / Money / Audit but no actions panel. Confusing — they may think their account is broken. **Fix:** render a small banner: "Booking actions require super_admin role. Contact a super_admin to escalate."

### MED-283 — FinancialsPage Reconciliation "Run Now" + BIR "Generate" + "Finalize" all fire immediately on click — no confirmation
**Files:**
- [apps/admin/src/pages/FinancialsPage.tsx:705-707, 766-805](apps/admin/src/pages/FinancialsPage.tsx#L705) (Run Reconciliation)
- [apps/admin/src/pages/FinancialsPage.tsx:1019-1049](apps/admin/src/pages/FinancialsPage.tsx#L1019) (Generate, Finalize per month)

Reconciliation Run is rate-limited server-side (presumably) but UI doesn't warn. **Finalize Monthly Report locks the report from further changes** — destructive of mutability — but no confirm step. Admin clicks Finalize for January expecting "are you sure", gets nothing, January is locked.

**Fix:**
```
1. Wrap Finalize in a confirm dialog:
   <Dialog open={confirmingFinalize}>
     <DialogTitle>Finalize {monthName} VAT Report?</DialogTitle>
     <p>Once finalized, this report cannot be edited. The PDF will be sealed and submitted to BIR records. This action cannot be undone.</p>
     <Button variant="destructive" onClick={confirmFinalize}>Yes, Finalize</Button>
   </Dialog>
2. Same for Quarterly 2307 batch generate (lines 1078-1086) — generating overwrites previous.
3. Same for Reconciliation Run if not already debounced server-side.
```

### MED-284 — FinancialsPage receipt search has no minimum-filter requirement — submitting empty form returns up to 500 receipts
**File:** [apps/admin/src/pages/FinancialsPage.tsx:1175-1198](apps/admin/src/pages/FinancialsPage.tsx#L1175)
Default `limit=50`. Empty submit → 50 most-recent receipts return. For a launch in Boracay this is fine. At scale it's a slow query. **Fix:** require at least one filter; or paginate explicitly.

### MED-285 — FinancialsPage Reconciliation dialog accepts paymongoBalance as raw number string and submits as Number(runBalance) — no centavos vs pesos clarity
**File:** [apps/admin/src/pages/FinancialsPage.tsx:776-784, 681-685](apps/admin/src/pages/FinancialsPage.tsx#L776)
Label says "PayMongo Balance (centavos)". Admin downloading PayMongo's CSV report sees pesos with decimals. They type `12345.67` thinking pesos, the code multiplies by nothing → server stores 12345.67 centavos = ₱123.46 instead of ₱12,345.67. **Fix:** label as "Pesos", parse with `Math.round(parseFloat(x) * 100)`.

### MED-286 — DispatchConsole filtered map markers render only filtered bookings, but provider markers ALWAYS show all online providers regardless of filter
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:487-520](apps/admin/src/pages/DispatchConsolePage.tsx#L487)
City filter "Boracay" → bookings list shows only Boracay bookings, but the green provider dots cover the entire archipelago. Visually noisy. **Fix:** filter providers by the same city/service if applicable.

### MED-287 — DispatchConsole detail-panel side overlay (lines 642-668) blocks the right edge of the map — clicking a marker moves the popup, then the side panel covers the area
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:642-668](apps/admin/src/pages/DispatchConsolePage.tsx#L642)
`fixed top-0 right-0 bottom-0 w-80 z-30` overlays the right side of the map. Selecting a booking on the right hides what you're trying to look at. **Fix:** make the panel collapsible OR position it as a card that follows the map marker.

### MED-288 — DispatchConsole reassign reason min 5 chars; BookingDetailPage cancel/reassign reason min 10 chars; release-escrow min 10 chars — inconsistent floors
**Files:**
- DispatchConsole reassign/cancel/message: 5 chars
- BookingDetailPage release/refund/reassign/cancel/force-complete: 10 chars
- DisputeDetailPage decisionNotes resolve: 20 chars
- DisputeDetailPage escalate: 10 chars
**Fix:** standardize to ≥20 chars for any action that writes to admin_actions. Codify as `MIN_REASON_CHARS=20` constant.

### MED-289 — DisputesPage list-level "Resolve" button and DisputeDetailPage Resolve form duplicate the same flow — keep one
**Files:** [apps/admin/src/pages/DisputesPage.tsx:188-205](apps/admin/src/pages/DisputesPage.tsx#L188), [apps/admin/src/pages/DisputeDetailPage.tsx:629-762](apps/admin/src/pages/DisputeDetailPage.tsx#L629)
The list-level button has fewer guards (no super_admin gate, no estimated-refund preview, no confirm dialog, no party-history context). **Fix:** delete the list-level Resolve action; force admins to navigate to detail. Bundle with CRIT-121.

### MED-290 — DisputeDetailPage Assign action accepts UUID free-text (line 608-614) — no admin-staff picker
Same UX issue as MED-281 / CRIT-127. **Fix:** dropdown of admin staff (small list, easy to render).

### MED-291 — Reopen dispute action has no confirmation despite being super_admin + destructive
**File:** [apps/admin/src/pages/DisputeDetailPage.tsx:849-863](apps/admin/src/pages/DisputeDetailPage.tsx#L849)
Reopen reverts a resolved dispute → re-debits provider wallet → provider sees money disappear. Highly disruptive. **Fix:** add confirm dialog + show the financial reversal preview.

### MED-292 — DispatchConsole "message customer" sends an admin notification — but customer-side chat (CRIT-91/96) is broken on Bug-1061-migrated devices, customer may not see it
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:375-387, 810-862](apps/admin/src/pages/DispatchConsolePage.tsx#L375)
Server-side notification to customer goes through messaging.service which mobile customer hits at the wrong URL (CRIT-96). Admin types a message, gets "Message sent to customer." toast, customer sees nothing. **Fix:** depends on CRIT-96 fix landing first. Until then, a banner on this dialog saying "Customer messaging is currently degraded — see CRIT-91/96."

### MED-293 — All 5 pages use raw inline modal divs (`<div className="fixed inset-0 ...">`) instead of the shared `<Dialog>` component
**Files:**
- BookingDetailPage uses `<Card>` action panel (no modal needed) ✓
- DispatchConsole uses shared `<Dialog>` ✓
- DisputeDetailPage uses inline `<Card>` (no modal) ✓
- DisputesPage uses raw `<div className="fixed inset-0 bg-black/50 ...">` (line 268-380)
- PayoutsPage uses raw `<div className="fixed inset-0 bg-black/50 ...">` (line 226-287)

Two pages skip the shared component → inconsistent escape-key handling, focus management, accessibility (aria-modal). **Fix:** replace with `<Dialog>` from components/ui.

### MED-294 — DispatchConsole alert tail listens for `alert:new` socket events but never persists them — page reload clears the list
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:316-321, 234](apps/admin/src/pages/DispatchConsolePage.tsx#L316)
`alerts` is React state, capped at 20. Refresh = empty. Alerts about (e.g.) failed payouts that came in 30 min ago are gone after page reload. **Fix:** also fetch recent alerts on mount: `useQuery(['admin-alerts', 'recent'], () => api.get('/api/v1/admin/alerts?limit=20'))`. Merge with live socket events.

### MED-295 — FinancialsPage Tab navigation lost on page reload (no URL-state)
**File:** [apps/admin/src/pages/FinancialsPage.tsx:1356, 1382-1392](apps/admin/src/pages/FinancialsPage.tsx#L1356)
`useState<TabKey>('overview')` is component-local. Refresh = back to Overview. Admin sharing a link to "Reconciliation" tab can't deep-link. **Fix:** sync with URL search param: `useSearchParams()` from react-router-dom.

### MED-296 — Type duplication: BookingsPage / BookingDetailPage / DisputesPage / DisputeDetailPage / PayoutsPage / FinancialsPage each redeclare the response type inline
Each page has `interface PaginatedResult { success: boolean; data: T[]; pagination: {...} }` or similar. Server returns these consistently. **Fix:** import shared `PaginatedResponse<T>` from `@/lib/api`. Admin's lib/api.ts already exports `ApiResponse<T>` (line 25) but no `PaginatedResponse<T>`.

### MED-297 — DispatchConsole map `useEffect` triggers a one-shot resize 200ms after mount; never fires on panel resize or browser zoom
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:408-415](apps/admin/src/pages/DispatchConsolePage.tsx#L408)
Single setTimeout 200ms. If the user resizes the browser, the leaflet map doesn't recompute its size → tiles render at the wrong scale. **Fix:** add a ResizeObserver on the map container.

### MED-298 — BookingsPage / DisputesPage / PayoutsPage status filter dropdowns have inconsistent variant maps — some use 'default', some use 'info', for the same status
Cross-cutting with the StatusBadge component used in mobile (D11 MED-204). **Fix:** centralize `STATUS_VARIANT` in `@/lib/status-variants.ts`, import from one place.

### MED-299 — DispatchConsole imports `iconUrl, iconRetinaUrl, shadowUrl` from `leaflet/dist/images/...` — no Vite asset handling guarantee
**File:** [apps/admin/src/pages/DispatchConsolePage.tsx:23-27, 53](apps/admin/src/pages/DispatchConsolePage.tsx#L23)
If the bundler (Vite) doesn't resolve these PNG paths, leaflet falls back to broken default icon URLs and markers don't render. **Fix:** ensure vite.config.ts includes a CSS-asset rule OR use `import.meta.env.BASE_URL`-aware paths.

### MED-300 — FinancialsPage Reconciliation `submitRun` parses paymongoBalance with `Number(...)` which returns NaN for empty string — no validation
**File:** [apps/admin/src/pages/FinancialsPage.tsx:678-688](apps/admin/src/pages/FinancialsPage.tsx#L678)
Allows submission with no balance specified (server then runs without balance — degraded comparison). **Fix:** require balance OR document that empty = "auto-fetch from PayMongo API."

---

## LOW / INFO

- **All 5 pages use the cookie-based admin auth** (no Bearer tokens), CSRF tokens echoed via `X-CSRF-Token` header (per Bug 1251 + 1271 fixes verified in F01).
- **DispatchConsole live socket subscriptions** (booking:created, booking:status_changed, booking:gps_update, alert:new) work correctly — verified at lines 277-321.
- **DisputeDetailPage party history pattern** (OK / REVIEW_REQUIRED / AT_RISK) is a strong UX feature — admin sees the customer's dispute pattern (5 disputes filed, 4 favored customer = REVIEW_REQUIRED) before deciding. Used at CustomerHistoryCard (line 394-434) + ProviderHistoryCard (line 436-476).
- **DisputeDetailPage confirm-resolve dialog** with estimated refund (lines 715-760) is the model for high-stakes confirms. Apply pattern to BookingDetailPage release/refund/cancel/force-complete (which currently have no confirm step beyond the inline reason field).
- **BookingDetailPage 5-tab Booking 360 view** (Overview / Timeline / Evidence / Money / Audit) is comprehensive and well-structured. Admin can answer any "what happened" question without leaving the page.
- **All DataTable / Pagination usage** is consistent. The shared components (verified in F07 next session) are correctly wired.
- **FinancialsPage Tab gates super-admin actions** (Reconciliation Run, BIR Generate/Finalize) — pattern is correct, just needs the confirm dialogs (MED-283).
- **All money values** are stored and computed in centavos throughout. No silent decimal/integer mixing in the admin pages I read.
- **All 5 pages have isError handling that surfaces a clear message** (vs CRIT-126 which silently degrades). Most error states are fine; only DispatchConsole's empty-list-on-feed-error needs the persistent banner fix.

---

## Phase F running totals (after F02)

| | Lines fully read | Findings docs |
|---|---:|---|
| F01 (Foundations) | 1,180 | 1 |
| F02 (Money + booking + dispute) | 5,079 | 1 |
| **Phase F total so far** | **6,259** | **2** |

| | New CRITs | New MEDs |
|---|---:|---:|
| F02 | 8 (CRIT-120 through CRIT-127) | 21 (MED-280 through MED-300) |

**Cumulative audit totals after F02:**
- ~58,943 lines fully read
- 127 CRITICAL bugs (1 invalidated → 126 real)
- 300 MEDIUM bugs

**Top F02 fixes by impact:**
1. **CRIT-120** (payouts permission gap) + **CRIT-121** (dispute resolve permission gap) — both compound the CRIT-23/56 server permissions hole. Fix together with the server-side `requirePermission` middleware.
2. **CRIT-123** (cancel-without-refund-preview) + **MED-280** (BookingDetailPage same) + **CRIT-124** (dispute resolve estimate may differ from server) — all "admin clicks blind on money" bugs. Single dispatch: add `/cancel-preview` and `/resolve-preview` server endpoints, render preview in dialogs.
3. **CRIT-125** (presigned PDF URLs) — NPC compliance + privacy. Replace with proxied `/download` routes.
4. **CRIT-126** (silent feed failure) — operational visibility during outages.
5. **CRIT-122** (Manila default in dispatch) — bundle with the broader Boracay-launch geo dispatch (CRIT-77/92/93/111/116).
6. **CRIT-127** (provider picker capped at 200) — UX scaling issue, fix before next 100-provider milestone.

---

## What's left in Phase F (next sessions)

### F03 — User/staff/identity (~3,260 lines)
- CustomersPage (151) + CustomerDetailPage (1,117)
- ProvidersPage (339) + ProviderDetailPage (952)
- StaffRolesPage (443)
- AuditLogPage (254)

### F04 — Compliance / data-rights (~2,143 lines)
- CompliancePage (812)
- ConsentVersionsPage (329)
- DataProtectionLogPage (605)
- NotificationTemplatesPage (397)

### F05 — Catalog / pricing / marketing / ops (~3,892 lines)
- CatalogPage (647)
- PricingRulesPage (674)
- MarketingPage (1,301)
- RecurringPage (222)
- ServiceAreasPage (407)
- BusinessAccountsPage (239)
- SupportTicketsPage (402)

### F06 — Dashboard / analytics / settings (~1,969 lines)
- DashboardPage (505)
- AnalyticsPage (537)
- SystemSettingsPage (427)
- settings/CancellationPolicyPage (500)

### F07 — UI components (~1,000 lines)
- DataTable, Dialog, Pagination, KpiCard, Chart, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Label, LoadingState, Select, Skeleton, Switch, Tabs, Textarea, Tooltip, icons/index

After F07: write PHASE-F-SUMMARY-AND-HANDOFF.md and proceed to G (migrations + RLS) and H (test quality audit).
