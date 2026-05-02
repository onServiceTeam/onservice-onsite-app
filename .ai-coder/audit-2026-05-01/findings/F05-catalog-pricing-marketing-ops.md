# Phase F Findings Part 5 — Admin catalog / pricing / marketing / ops

## Files read (full reads, no skipped sections)

| File | Lines | Read range | Status |
|---|---:|---|---|
| `apps/admin/src/pages/CatalogPage.tsx` | 647 | 1-647 | full |
| `apps/admin/src/pages/PricingRulesPage.tsx` | 674 | 1-674 | full |
| `apps/admin/src/pages/MarketingPage.tsx` | 1,301 | 1-450 + 450-900 + 900-1301 | full (3 chunks) |
| `apps/admin/src/pages/RecurringPage.tsx` | 222 | 1-222 | full |
| `apps/admin/src/pages/ServiceAreasPage.tsx` | 407 | 1-407 | full |
| `apps/admin/src/pages/BusinessAccountsPage.tsx` | 239 | 1-239 | full |
| `apps/admin/src/pages/SupportTicketsPage.tsx` | 402 | 1-402 | full |
| **F05 page total** | **3,892** | | |

Server routes cross-checked (targeted reads + role-gate grep):
- `packages/api/src/routes/admin.routes.ts` lines 800-1135 (service-areas + pricing-rules CRUD)
- `packages/api/src/routes/marketing-admin.routes.ts` (role gates grep — 274 lines, mixed admin/super_admin gates)
- `packages/api/src/routes/catalog.routes.ts` (role gate grep — 9 admin endpoints, all `requireAdmin`)
- `packages/api/src/routes/service-area.routes.ts` (customer-facing, not admin)

**F05 grand total fully read: ~4,400 lines (3,892 page + ~500 server cross-check).**
**Audit grand total fully read after F05: ~70,583 lines (~50.3% of ~140,380 codebase).**

---

## Honesty notes up front

- F05 added **5 new CRITs** (CRIT-142 through CRIT-146) and **18 new MEDs** (MED-341 through MED-358).
- **MarketingPage is the FIRST F-phase page that uses `useAuthStore`** for client-side role gating. Edit/Create/Deactivate buttons gated to super_admin. F01-F04 mostly missing this.
- Server-side pricing rules + service areas + catalog admin endpoints are ALL `requireAdmin` only (no super_admin gate). Junior admin can spike platform-wide pricing, pause the Boracay launch area, or change base prices for every service category. CRIT-grade money risk.
- MarketingPage `EditCampaignDialog` allows admin to manually override `attributedSignups` / `attributedFirstBookings` / `attributedRevenueCentavos` — direct attribution-fraud vector.
- Half of F05 has the same pattern of hardcoded reasons (`'Admin cancellation'`, `'Admin action'`) instead of admin-typed reasons — audit log is permanent but useless.
- Phase 14 D05 (Bug 320/322) fixed PH lat/lng bounds + radius validation on service areas — verified server-side. Same dispatch did NOT close the role-gate gap.
- Phase 14 D13 (Bug 44/152) explicitly disables promo redemption for v1.0 (banner says so) — truth-in-UI again. Codes are creatable but inert. Risk: post-launch retroactive activation may double-count if the v1.1 wiring isn't careful.

---

## CRITICAL bugs (continuing numbering after CRIT-141)

### CRIT-142 — Pricing rules + service area mutations all server-gated only by `requireAdmin`; junior admin can 5×-spike platform-wide pricing or pause Boracay launch
**Files:**
- [apps/admin/src/pages/PricingRulesPage.tsx:1-674](apps/admin/src/pages/PricingRulesPage.tsx) (entire page; no useAuthStore)
- [apps/admin/src/pages/ServiceAreasPage.tsx:1-407](apps/admin/src/pages/ServiceAreasPage.tsx) (entire page; no useAuthStore)
- [packages/api/src/routes/admin.routes.ts:806-1134](packages/api/src/routes/admin.routes.ts#L806) — all CRUD on /service-areas + /pricing-rules + /pricing-rules/:id/toggle = `requireAdmin`

```ts
// admin.routes.ts:1056-1086 — pricing-rule create
router.post('/pricing-rules', authMiddleware, validationMiddleware(...), async (req, res, next) => {
  try {
    requireAdmin(req);  // ← admin OR super_admin
    ...
    const rule = await pricingService.createPricingRule(body);
    ...
  }
});

// SAME pattern on /pricing-rules/:id (PATCH), /pricing-rules/:id/toggle (POST), /pricing-rules/:id (DELETE)
// SAME pattern on /service-areas (POST), /service-areas/:id (PATCH), /service-areas/:id/activate (POST), /service-areas/:id/pause (POST)
```

**Attack scenarios (junior admin = role='admin', intended permissions: support tickets only):**

1. **Pricing spike**: navigate to /pricing-rules, click + New Rule, type:
   - name: "Test"
   - type: peak_hours
   - multiplier: 5.0
   - peakStart: 00:00, peakEnd: 23:59
   - peakDaysOfWeek: all
   - priority: 100 (override anything)
   
   Click Create. Every customer booking is now 5× the base price platform-wide, around the clock. Revenue impact in Boracay launch first hour: customers see ₱2500 cleaning prices instead of ₱500, abandon checkout, conversion drops to 0.

2. **Pause Boracay**: navigate to /service-areas, find the Boracay row (status='active'), click Pause. Platform stops accepting Boracay bookings. Customer service ticket explosion. Provider income hit.

3. **platformSurgeShare flip**: edit any pricing rule, change `platformSurgeShare` from 0.5 to 0.0 → platform retains 0% of surge revenue, providers keep 100%. Revenue redirected from platform to providers.

4. **Pricing-rule deletion**: delete the legitimate "Christmas surge" rule the day after admin scheduled it. Christmas revenue lost.

**Real-world impact (Boracay launch):** the platform is one click away from a revenue catastrophe. Pricing rules are the most leveraged knob in the app — they multiply every customer's price. They MUST be gated to super_admin OR a dedicated `pricing.manage` permission.

The same applies to service areas — pausing the launch market is account-killing for the entire business in Boracay.

**Fix dispatch:**
```
1. Server (admin.routes.ts):
   - Lines 806-836 (create), 854-870 (update), 872-888 (activate), 890-904 (pause):
     replace requireAdmin → requireSuperAdmin OR requirePermission('areas.manage').
   - Lines 1056-1133 (pricing-rules create/update/toggle/delete):
     replace requireAdmin → requireSuperAdmin OR requirePermission('pricing.manage').

2. Add a new permission flag 'pricing.manage' (separate from 'areas.manage') so super_admin can delegate without giving the keys to the kingdom.

3. Client (PricingRulesPage + ServiceAreasPage):
   - Add useAuthStore + permissions check.
   - Hide + New Rule / + New Area buttons + per-row Edit/Toggle/Delete/Activate/Pause for non-super-admin and non-pricing.manage permission holders.

4. Add confirm dialogs for ALL mutations:
   - Pricing rule create/edit: show preview of estimated impact ("this rule would have affected N% of yesterday's bookings").
   - Pricing rule toggle: confirm with displayed multiplier ("Activate Rule X with multiplier 1.5×?").
   - Service area activate: warn if active provider count < min provider count.
   - Service area pause: REQUIRE typed reason ≥ 50 chars + confirm with current booking count ("Pause Boracay area? 23 bookings currently in flight.").

5. Add platform-wide caps:
   - platform_settings.pricing_max_multiplier (default 2.0) — server rejects rules with multiplier > this.
   - platform_settings.pricing_max_total_concurrent_active_rules (default 10) — prevents a junior admin from creating 100 surge rules.

6. Audit row on every mutation with full body (already captured by auditMiddleware globally; verify).

7. Tests:
   - Render PricingRulesPage with role='admin' (no pricing.manage perm) → New Rule button hidden, Edit/Toggle/Delete missing.
   - With role='super_admin' → buttons render.
   - Server: POST /pricing-rules with role='admin' → 403.
   - Server: POST /pricing-rules with multiplier=5.0 (above cap 2.0) → 422.

8. Bundle with the staff permissions dispatch (CRIT-23/56/120/121/130/131/137).
```

**Runtime verification:**
1. Seed users: super@onservice.us (super_admin), support@onservice.us (admin only).
2. Log in as support@onservice.us → /pricing-rules → no Create/Edit/Toggle buttons.
3. Try to call PUT /api/v1/admin/pricing-rules/x as support directly via curl → 403.
4. Log in as super_admin → buttons present.
5. Create rule with multiplier=5.0 → 422 (above platform cap).
6. Create rule with multiplier=1.5, click Toggle → confirm dialog appears.
7. /service-areas → click Pause on Boracay row → typed-reason confirm dialog.

---

### CRIT-143 — `EditCampaignDialog` lets ANY super_admin manually override `attributedSignups`, `attributedFirstBookings`, `attributedRevenueCentavos` — marketing-attribution fraud vector
**File:** [apps/admin/src/pages/MarketingPage.tsx:1245-1279](apps/admin/src/pages/MarketingPage.tsx#L1245)

```tsx
<div className="grid grid-cols-3 gap-3">
  <div>
    <Label htmlFor="e-signups">Signups</Label>
    <Input id="e-signups" type="number" value={form.attributedSignups}
      onChange={(e) => setForm((f) => ({ ...f, attributedSignups: e.target.value }))} />
  </div>
  <div>
    <Label htmlFor="e-first">First bookings</Label>
    <Input id="e-first" type="number" value={form.attributedFirstBookings}
      onChange={(e) => setForm((f) => ({ ...f, attributedFirstBookings: e.target.value }))} />
  </div>
  <div>
    <Label htmlFor="e-revenue">Revenue (centavos)</Label>
    <Input id="e-revenue" type="number" value={form.attributedRevenueCentavos}
      onChange={(e) => setForm((f) => ({ ...f, attributedRevenueCentavos: e.target.value }))} />
  </div>
</div>
```

These three numbers feed directly into the channel breakdown KPIs (CPA, ROI) on the Overview tab. Admin types `attributedSignups=10000` for a campaign that actually drove 5 signups. The platform's marketing dashboard now shows ROI of 9999% for that campaign.

**Real-world fraud:** a marketing agency is paid based on attribution metrics. The marketer (or super_admin colluding with them) inflates the numbers. Platform pays ad agencies based on fake performance. Or: an executive manipulates campaign performance for board reporting / fundraising.

There's a legitimate use case (correcting attribution data when the auto-tracker missed a signup), but the current UI is a direct-edit free-for-all with no audit context.

**Fix dispatch:**
```
1. Server (marketing-admin.routes.ts — verify, was admin):
   - Replace direct attribution edit with a "manual adjustment" model:
     POST /campaigns/:id/attribution-adjustment {
       adjustmentType: 'signups' | 'first_bookings' | 'revenue_centavos',
       deltaValue: number (positive or negative),
       reason: string (>= 50 chars),
       sourceEvidence: string (URL or note explaining where the data came from)
     }
   - Server stores adjustments in a separate `marketing_campaign_adjustments` table.
   - The KPI dashboard sums { auto-tracked + adjustments }.
   - Each adjustment is a separate audit_log row + visible in the campaign detail with the full reason.

2. Client:
   - Replace the 3 free-text inputs with a "Make adjustment" button that opens a structured dialog:
     - Type: signups / first_bookings / revenue
     - Delta (positive: add, negative: subtract)
     - Reason ≥ 50 chars
     - Evidence URL or note
     - Confirm dialog before saving
   - Display history of adjustments in the campaign detail view, with WHO + WHEN + REASON.

3. Add a "Marketing Attribution Adjustments" admin report (CSV export, audit dashboard).

4. Tests:
   - Old direct-edit endpoint removed/disabled.
   - New adjustment endpoint requires reason ≥ 50.
   - Campaign KPIs sum tracked + adjustments correctly.

5. Bundle with the staff permissions dispatch — `marketing.adjust_attribution` should be a separate permission, NOT the default for super_admin.
```

**Runtime verification:**
1. Seed campaign 'fb-launch' with auto-tracked 100 signups, ₱500K revenue.
2. Old behavior: super_admin edits → types 5000 signups → KPI shows 5000 + ₱500K = ROI 9900%. Audit row only shows full body diff.
3. New behavior: super_admin clicks Make Adjustment → dialog: delta=+50, reason "facebook insights showed 50 additional non-tracked signups" → submission requires confirm + reason length.
4. Campaign now shows 150 signups + 1 adjustment row in history.

---

### CRIT-144 — Catalog admin endpoints all `requireAdmin` only — junior admin can edit `basePrice` for every service category platform-wide
**Files:**
- [apps/admin/src/pages/CatalogPage.tsx:1-647](apps/admin/src/pages/CatalogPage.tsx) — entire page; no useAuthStore
- [packages/api/src/routes/catalog.routes.ts:229-448](packages/api/src/routes/catalog.routes.ts#L229) — all 9 admin endpoints `requireAdmin`

```
catalog.routes.ts grep result:
229 requireAdmin(req);  // POST /admin/categories
253 requireAdmin(req);  // PUT /admin/categories/:id
278 requireAdmin(req);  // POST /admin/subcategories
302 requireAdmin(req);  // PUT /admin/subcategories/:id
329 requireAdmin(req);  // DELETE /admin/subcategories/:id
360 requireAdmin(req);  // GET addons
392 requireAdmin(req);  // POST addon
427 requireAdmin(req);  // PUT addon
448 requireAdmin(req);  // DELETE addon
```

**Real-world impact:** a service category like "house-cleaning-2bedroom" might have basePrice = ₱500. Junior admin opens /catalog, expands the category, clicks Edit on the subcategory, types basePrice=`5000`, saves. Server stores `Number("5000") * 100 = 500000` centavos = ₱5,000 base. Customer attempting to book sees ₱5,000 (10× the real price). Booking flow either succeeds (customer overpays) or breaks (customer abandons). Either way, the platform is broken.

The damage is silent — there's no preview ("changing this price affects N existing-recurring-booking customers"), no max delta safeguard, and no super_admin gate.

**Fix dispatch:**
```
1. Server (catalog.routes.ts:229-448):
   - For mutations, replace `requireAdmin` with `requireSuperAdmin` OR `requirePermission('catalog.manage')`.
   - Specifically gate `basePrice / minPrice / maxPrice` changes with separate `catalog.set_prices` permission.
   - Prevent dropping prices to 0 or raising them by >100% in a single edit (server-side check; require an "I confirm a 10× price change" flag).

2. Client (CatalogPage):
   - Add useAuthStore + permissions check.
   - Hide Edit/Add buttons for non-super-admin or non-catalog.manage.
   - On price edit, require typed-CONFIRM if newPrice differs by >50% from oldPrice.
   - Show "this affects N active recurring bookings + N pending bookings" preview.

3. Audit log: capture the full diff (old vs new prices) per edit. Already done by auditMiddleware globally.

4. Tests:
   - Junior admin → no Add/Edit buttons.
   - Server: PUT /admin/subcategories/:id with role='admin' → 403.
   - Server: change basePrice from 50000 to 500000 → 422 "10× price change requires explicit confirmation flag".

5. Bundle with the staff permissions dispatch.
```

**Runtime verification:**
1. Seed catalog with subcategory 'house-cleaning-2br' basePrice=50000 centavos.
2. Junior admin → /catalog → no Edit button.
3. Super_admin → Edit → change basePrice from 500.00 to 5000.00 → confirm dialog "This is a 10× price change — type CONFIRM-PRICE-CHANGE".
4. Type confirm → mutation succeeds; audit log records pre/post.

---

### CRIT-145 — Subcategory price multiplier `Number(price) * 100` without `Math.round` (CatalogPage); inconsistent with addon's correct `Math.round(Number(...) * 100)`
**File:** [apps/admin/src/pages/CatalogPage.tsx:106-108, 151](apps/admin/src/pages/CatalogPage.tsx#L106)

```ts
// Subcategory mutation — WRONG (line 106-108)
basePrice: basePrice ? Number(basePrice) * 100 : null,
minPrice: minPrice ? Number(minPrice) * 100 : null,
maxPrice: maxPrice ? Number(maxPrice) * 100 : null,

// Addon mutation — CORRECT (line 151)
price: addonPrice ? Math.round(Number(addonPrice) * 100) : 0,
```

JavaScript floating-point: `Number("100.99") * 100 = 10099.000000000002`. Server may receive a non-integer centavos value:
- If DB column is BIGINT/INT: cast truncates to 10099 → loses 0.000000000002 (harmless).
- If DB column is NUMERIC(20,2) or DECIMAL: stored value is 10099.000000000002 → off-by-1-femtocentavo over thousands of transactions.
- More dangerously: `Number("0.1") * 100 = 10.000000000000002` and `Number("0.29") * 100 = 28.999999999999996`. Without Math.round, `28.999999999999996` may store/round as 28 (off by 1 centavo).

For a service priced at ₱100.29, this becomes ₱100.28 in DB. Repeated across 1000 booking records, ₱10 lost. Compounded across thousands of services × thousands of edits, real money drift.

The addon mutation correctly uses `Math.round(Number(addonPrice) * 100)`. The subcategory mutation doesn't. Same author probably wrote both — addon is right, subcategory is wrong.

**Fix dispatch:**
```
1. Client (CatalogPage:106-108):
   basePrice: basePrice ? Math.round(Number(basePrice) * 100) : null,
   minPrice: minPrice ? Math.round(Number(minPrice) * 100) : null,
   maxPrice: maxPrice ? Math.round(Number(maxPrice) * 100) : null,

2. Server: validate that basePrice / minPrice / maxPrice are Math.trunc-compatible integers (no fractional centavos). Reject 100.5 (not a valid centavo amount).

3. Better: introduce a shared `pesosToCentavos(str: string): number` helper in packages/shared/money.ts. Use it everywhere admin/customer/provider parses currency input.

4. CI lint: regex `Number\([^)]+\)\s*\*\s*100` without Math.round → fail the build.

5. Tests:
   - Edit subcategory with basePrice='100.99' → server receives 10099 (not 10099.000...).
   - Edit with '0.29' → 29 (not 28).
```

---

### CRIT-146 — Promo redemption pulled for v1.0 but UI still allows admin to create promo codes that DO NOTHING; banner is honest but the workflow risk is real
**File:** [apps/admin/src/pages/MarketingPage.tsx:467-483](apps/admin/src/pages/MarketingPage.tsx#L467)

```tsx
{!flags.promoRedemptionEnabled && (
  <div data-testid="promo-not-wired-banner" className="...border-amber-300 bg-amber-50...">
    <p className="font-semibold text-sm">Promo redemption is not wired in v1.0.</p>
    <p className="text-xs mt-1">
      Codes you create here will be honored once Phase 14 v1.1 wires the
      redemption pipeline (target: post-launch). Customers do not see a
      promo input in checkout yet.
    </p>
  </div>
)}
```

The banner is the right kind of honest UI ("we know this isn't wired"). But the page still lets admin create promo codes during v1.0:
- Admin types `WELCOME10` 10% off, validUntil=2026-12-31.
- Customer never sees a promo input on checkout (because v1.0 redemption is disabled).
- v1.1 ships, redemption is enabled. Existing codes from v1.0 onward become live.
- **What's the validity of `WELCOME10` between 2026-05-01 (created) and v1.1 launch (TBD)?** If a customer gets the code in marketing materials, they can't redeem it during v1.0. They'll be confused. They might still try to redeem during v1.1 even if `validUntil` was meant only for the v1.1 window.

This isn't a security CRIT in the traditional sense, but it's a launch-day operational risk: the marketer creates promos for the BORACAY LAUNCH (v1.0), customers can't redeem, marketer thinks the launch promo "didn't work," then v1.1 ships with these stale codes potentially valid retroactively.

**Fix dispatch:**
```
1. UI: when flags.promoRedemptionEnabled is false, the create-promo dialog should:
   - Disable the "Valid From" date selector OR force it to "v1.1 ETA TBD" (no specific date).
   - Show a banner inside the create dialog: "Promo redemption launches in v1.1. This code will become active automatically when v1.1 ships. Customers cannot use it before then."

2. Server: when feature flag is off, store a metadata flag `created_pre_v1_1=true` on the row. When v1.1 wires redemption, the rollout script chooses whether to retroactively activate or skip these codes.

3. Add a UI "Active in v1.1" indicator for created-pre-launch codes so admin understands which codes will activate.

4. Document the v1.1 cutover behavior in docs/runbooks/v1.1-cutover.md.

5. Tests:
   - With flag off, create promo → row stored with created_pre_v1_1=true.
   - With flag on (v1.1), create promo → row stored without that flag.
   - At cutover time, run script: SELECT codes with created_pre_v1_1=true AND validUntil > NOW() → admin reviews each.
```

**Runtime verification:**
1. Verify `flags.promoRedemptionEnabled` defaults to false in feature_flags table.
2. UI shows the banner.
3. Create code 'WELCOME10' → server stores with created_pre_v1_1=true.
4. Document in launch runbook the v1.1 cutover decision tree.

---

## MEDIUM bugs (continuing from MED-340)

### MED-341 — None of the F05 pages except MarketingPage import `useAuthStore`
**Files:** CatalogPage, PricingRulesPage, RecurringPage, ServiceAreasPage, BusinessAccountsPage, SupportTicketsPage (lines 1-11 of each)

CRIT-132 / MED-301 / MED-323 family. Junior admin sees the page chrome and form controls; server returns 403 on protected actions; UX is broken without a clear "you don't have permission" message. Bundle with the role-gate dispatch.

### MED-342 — Hardcoded reasons on destructive mutations
**Files:**
- [RecurringPage.tsx:71](apps/admin/src/pages/RecurringPage.tsx#L71) — `reason: 'Admin cancellation'` (hardcoded)
- [BusinessAccountsPage.tsx:87](apps/admin/src/pages/BusinessAccountsPage.tsx#L87) — `reason: 'Admin action'` (hardcoded)

Cancel a recurring booking, suspend a business account — both fire with hardcoded reason strings. Audit log captures the action but the reason field is useless. Same family as the inconsistent reason floors (F03 MED-288).

**Fix:** require admin-typed reason ≥20 chars before submission. Standardize across all admin actions.

### MED-343 — `EditCampaignDialog` `endedAt` sent as `null` for empty string vs date string for non-empty (line 1189) — server may treat `null` as "indefinite" but date as a specific end
**File:** [MarketingPage.tsx:1189](apps/admin/src/pages/MarketingPage.tsx#L1189)

`body.endedAt = form.endedAt || null;` — if admin clears the date to "indefinite," it sends null. Server-side handling needs to be verified; semantics are ambiguous (does null mean "still active" or "no end planned"?).

### MED-344 — `validUntil` for promos converts as `${input.validUntil}T23:59:59Z` (UTC end-of-day = 7:59 AM Manila next day)
**File:** [MarketingPage.tsx:613, 769](apps/admin/src/pages/MarketingPage.tsx#L613)

Same timezone bug family as CRIT-139 (consent versions). Admin enters validUntil "May 15" (Manila time). Stored as 2026-05-15T23:59:59Z = 2026-05-16T07:59:59+08:00 Manila. Code remains valid for 8 unintended hours.

**Fix:** convert to Manila TZ explicitly: `new Date(input.validUntil + 'T23:59:59+08:00').toISOString()`.

### MED-345 — `Number(price) * 100` without Math.round in MarketingPage's `discountValue` for fixed_centavos type
**File:** [MarketingPage.tsx:604](apps/admin/src/pages/MarketingPage.tsx#L604)

```ts
discountValue: Number(input.discountValue),
```

For percentage type, this is fine. For `fixed_centavos`, admin types pesos in the input but server expects centavos. The label says "Centavos (>=100)" so admin types 100 = ₱1. But the input type=number step="any" and admin could type "0.01" → discount value 0.01 cents = stored. Floating-point mess. **Fix:** require Math.round + integer enforcement when discountType='fixed_centavos'.

### MED-346 — No admin UI for creating Business Accounts (BusinessAccountsPage:1-239)
**File:** [BusinessAccountsPage.tsx](apps/admin/src/pages/BusinessAccountsPage.tsx) (entire file)

Admin can list, search, approve/suspend B2B accounts but cannot create one. Onboarding must happen elsewhere (DB write, customer-side flow, or API direct call). UX gap.

### MED-347 — No detail view for Business Accounts; admin can't drill into a B2B account's bookings, credit usage, history
**File:** [BusinessAccountsPage.tsx](apps/admin/src/pages/BusinessAccountsPage.tsx) (entire file)

Admin sees company name, owner, location, status — that's it. No way to see booking history, monthly invoice spend, credit utilization. Business operations need the detail page.

### MED-348 — No `volumeDiscountRate` / `monthlyCreditLimit` editor in BusinessAccountsPage UI
**File:** [BusinessAccountsPage.tsx:131, 138](apps/admin/src/pages/BusinessAccountsPage.tsx#L131)

These are read-only displays in the table. Where does admin set them? Likely a separate creation flow that's not in this UI. Hidden gap.

### MED-349 — RecurringPage exposes customer name + city + province with no PII redaction
**File:** [RecurringPage.tsx:96-126](apps/admin/src/pages/RecurringPage.tsx#L96)

Junior admin sees customer names + locations on every recurring booking row. CRIT-132 family.

### MED-350 — RecurringPage `Cancel` button has no confirm; one click cancels a recurring service contract
**File:** [RecurringPage.tsx:154-162](apps/admin/src/pages/RecurringPage.tsx#L154)

Same MED-315 family. Add ConfirmDialog with reason field.

### MED-351 — RecurringPage missing detail view + can't navigate to customer
**File:** [RecurringPage.tsx](apps/admin/src/pages/RecurringPage.tsx) (entire file)

Admin sees a row with customerName but no link to /customers/:id. Truncated UUID shown but not clickable.

### MED-352 — SupportTicketsPage status change dropdown to 'resolved' doesn't require resolutionNotes
**File:** [SupportTicketsPage.tsx:247-259](apps/admin/src/pages/SupportTicketsPage.tsx#L247)

```tsx
onChange={(e) => {
  if (e.target.value) updateStatusMutation.mutate({ id: ticket.id, status: e.target.value });
}}
```

`resolutionNotes` is optional. Admin can flip status to 'resolved' with no resolution explanation. Customer reading the ticket history sees "resolved" but no rationale. **Fix:** when status='resolved', require resolutionNotes ≥30 chars before submission.

### MED-353 — SupportTicketsPage assign-agent input is raw UUID paste
**File:** [SupportTicketsPage.tsx:275-288](apps/admin/src/pages/SupportTicketsPage.tsx#L275)

Admin types a user_id UUID. Same MED-281/MED-316 family. **Fix:** autocomplete by agent email/name.

### MED-354 — SupportTicketsPage shows raw `description` text without sanitization (XSS in stored content if downstream renders HTML)
**File:** [SupportTicketsPage.tsx:292](apps/admin/src/pages/SupportTicketsPage.tsx#L292)

`<p>{ticket.description}</p>` — React escapes by default, so JSX is safe. But if an email digest or PDF report renders the same description with raw HTML or markdown, stored XSS could activate. Defense-in-depth: server should sanitize on write.

### MED-355 — SupportTicketsPage `internal note` flag has no audit trail beyond auditMiddleware; admin can't tell who flagged a message internal vs public
**File:** [SupportTicketsPage.tsx:307-318](apps/admin/src/pages/SupportTicketsPage.tsx#L307)

The yellow [Internal Note] badge appears on internal messages, but if an admin flips the flag (visible→internal) post-creation, no UI history of that change. **Fix:** server stores message_visibility_history; UI shows toggles.

### MED-356 — CatalogPage uses native `confirm()` on subcategory + addon delete (line 375, 422)
Same MED-317 family. Replace with shared ConfirmDialog.

### MED-357 — CatalogPage iconUrl is a free-text Input
**File:** [CatalogPage.tsx:534-541](apps/admin/src/pages/CatalogPage.tsx#L534)

Admin pastes any URL. Direct rendering at line 298 (`<img src={cat.iconUrl}>`). Same MED-308/CRIT-125 family — direct external image URLs. **Fix:** S3 file upload + signed URL wrapping.

### MED-358 — ServiceAreasPage activate has no min-providers warning even though server enforces (Phase 14 D05 Bug 320)
**File:** [ServiceAreasPage.tsx:226-234](apps/admin/src/pages/ServiceAreasPage.tsx#L226)

Server validates that activeProviderCount >= minProvidersToLaunch before activating. Client doesn't pre-warn. Admin clicks Activate, gets a 422 server error toast. **Fix:** client-side button disabled (with tooltip) when condition not met.

---

## LOW / INFO

- **MarketingPage uses useAuthStore correctly** (line 138-140). Edit/Create/Deactivate buttons gated to super_admin. First F-phase page with proper client-side role gate. Apply this pattern to F03/F04/F05 other pages.
- **Promo redemption banner** (line 470-483) is a strong example of "truth-in-UI." Keep it; document the cutover.
- **Service area Bug 320/322 fix verified** — server-side PH lat/lng bounds enforcement at admin.routes.ts:800-806 (commented). Migration 074 enforces same at DB level. Defense in depth correctly applied.
- **CHANNEL_OPTIONS** in MarketingPage matches the server enum (verified by reading the validators in F02 dispatch). No drift.
- **Pricing rules type=peak_hours `peakDaysOfWeek`** is array of 0-6 integers — well-typed.
- **RecurringPage status filter** is well-typed (active/paused/cancelled). Only status set, no other filters.
- **SupportTicketsPage internal note** flag is a strong UX feature; just needs audit trail on flag changes.
- **CatalogPage tree expansion (categories → subcategories → addons)** is a clean nested table pattern.
- **PricingRulesPage Phase 14 D05 fix** — multiplier client-side max=5.0 (line 354) correctly enforces the cap. Server validators must enforce same.
- **MarketingPage Bug 44 + Bug 152 banner** is the right approach to disabled features.

---

## Cross-cutting families this phase newly fed

- **Server-side `requireAdmin` (admin OR super_admin) on money/launch-impacting writes** (CRIT-130 family): + 2 sites in F05 (pricing rules, service areas) — total now 5+ sites.
- **No client-side role gate** (MED-301 / MED-323 family): + 6 sites in F05 (CatalogPage, PricingRulesPage, RecurringPage, ServiceAreasPage, BusinessAccountsPage, SupportTicketsPage).
- **Hardcoded reason on destructive actions** (MED-342 — new family): + 2 sites (recurring cancel, business suspend).
- **Pesos-to-centavos float math without Math.round** (MED-345 family extends from F02 MED-285 + new): + 4 sites in F05 (CatalogPage subcategory basePrice/minPrice/maxPrice + MarketingPage discountValue for fixed_centavos).
- **Date inputs converted as UTC midnight = 8 AM Manila** (MED-344 family extends from CRIT-139): + 1 site (MarketingPage promo validUntil).
- **PII exposure to junior admins** (CRIT-132 family): + 4 sites in F05 (RecurringPage customer info, BusinessAccountsPage owner/manager, SupportTicketsPage user info, CatalogPage iconUrl).
- **Free-text iconUrl / link fields** (CRIT-125 family): + 1 site (CatalogPage iconUrl).
- **No detail page for surface where admin needs context** (MED-347 family — new): BusinessAccountsPage, RecurringPage.
- **Native `confirm()` for destructive ops** (MED-317 family): + 2 sites (CatalogPage subcategory + addon delete).
- **Marketing-attribution fraud vector** (CRIT-143 — new family): no audit-of-adjustments trail on campaign attribution.

---

## Phase F running totals (after F05)

| | Lines fully read | Findings docs |
|---|---:|---|
| F01 (Foundations) | 1,180 | 1 |
| F02 (Money + booking + dispute) | 5,079 | 1 |
| F03 (User + provider + staff + identity + audit) | ~4,500 | 1 |
| F04 (Compliance + data-rights + notification templates) | ~2,743 | 1 |
| **F05 (Catalog + pricing + marketing + ops)** | **~4,400** | **1** |
| **Phase F total so far** | **~17,902** | **5** |

| | New CRITs | New MEDs |
|---|---:|---:|
| F05 | 5 (CRIT-142 through CRIT-146) | 18 (MED-341 through MED-358) |

**Cumulative audit totals after F05:**
- ~70,583 lines fully read
- **146 CRITICAL** bugs (1 invalidated → **145 real**, +5 this phase)
- **358 MEDIUM** bugs (+18)

**Top F05 fixes by impact:**

1. **CRIT-142 (pricing rules + service areas not super_admin gated)** — junior admin can spike pricing 5× or pause Boracay. Bundle with the staff permissions dispatch. Critical pre-launch.
2. **CRIT-144 (catalog admin endpoints not super_admin gated)** — junior admin can change base price for every service. Same dispatch.
3. **CRIT-143 (marketing attribution direct edit)** — fraud vector. Replace direct edit with structured adjustment workflow.
4. **CRIT-145 (Math.round drift in subcategory price)** — money precision. CI lint to enforce.
5. **CRIT-146 (promo codes inert in v1.0)** — operational risk at v1.1 cutover; document.

---

## What's left in Phase F

### F06 — Dashboard / analytics / settings (~1,969 lines, NEXT)
- `apps/admin/src/pages/DashboardPage.tsx` (505)
- `apps/admin/src/pages/AnalyticsPage.tsx` (537)
- `apps/admin/src/pages/SystemSettingsPage.tsx` (427)
- `apps/admin/src/pages/settings/CancellationPolicyPage.tsx` (500)

### F07 — UI components (~1,000 lines)
- DataTable, Dialog, Pagination, KpiCard, Chart, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Label, LoadingState, Select, Skeleton, Switch, Tabs, Textarea, Tooltip, icons/index

After F07: PHASE-F-SUMMARY-AND-HANDOFF.md → Phase G (migrations + RLS) → Phase H (test quality audit) → Phase I (master AI-coder dispatch).

---

## Discipline notes from this phase

1. **The pattern of "phase 14 D05 fixed validation but didn't fix the role gate"** repeats. Bug 320/322 shipped tight PH lat/lng bounds + `.strict()` Zod schema rejection — but the route still uses `requireAdmin`. The validation is good; the authorization is missing. Future remediation dispatches should always check both layers.

2. **MarketingPage shows the right pattern.** `useAuthStore` import + `isSuperAdmin` boolean + `{isSuperAdmin && <Button>...</Button>}`. Apply this as the default template for every admin page that has any mutation.

3. **Truth-in-UI banners are a discovery signal.** The promo-not-wired banner (CRIT-146) and the erasure-not-erasing warning (CRIT-136 from F04) are flags placed by honest engineers who knew the gap and shipped anyway. Phase I should aggregate these.

4. **Money math floats without Math.round** — appears across at least 3 places now (F02 MED-285, F05 CRIT-145, F05 MED-345). A CI lint banning `Number(...) * 100` without Math.round would catch all current and future occurrences.

5. **The `Cancel` and `Suspend` actions on RecurringPage / BusinessAccountsPage hardcode the reason.** This is worse than not having a reason — the audit trail looks present but is useless. Audit fields with hardcoded values are misleading.

6. **MarketingPage attribution editor** is the kind of subtle CRIT-grade finding that wouldn't show up in any automated scan. It's an antipattern (direct DB-edit without structure) that's only obvious when reading the admin code with attention to motive.
