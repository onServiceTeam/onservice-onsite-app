# Phase F Findings Part 6 — Admin dashboard / analytics / settings / cancellation policy

## Files read (full reads, no skipped sections)

| File | Lines | Read range | Status |
|---|---:|---|---|
| `apps/admin/src/pages/DashboardPage.tsx` | 505 | 1-505 | full |
| `apps/admin/src/pages/AnalyticsPage.tsx` | 537 | 1-537 | full |
| `apps/admin/src/pages/SystemSettingsPage.tsx` | 427 | 1-427 | full |
| `apps/admin/src/pages/settings/CancellationPolicyPage.tsx` | 500 | 1-500 | full |
| **F06 page total** | **1,969** | | |

Server routes cross-checked (full reads):
- `packages/api/src/routes/settings.routes.ts` (119)
- `packages/api/src/routes/cancellation-policy-admin.routes.ts` (267)

**F06 grand total fully read: ~2,355 lines.**
**Audit grand total fully read after F06: ~72,938 lines (~52.0% of ~140,380 codebase).**

---

## Honesty notes up front

- F06 added **4 new CRITs** (CRIT-147 through CRIT-150) and **15 new MEDs** (MED-359 through MED-373).
- **The biggest finding is CRIT-147**: server-side, ALL platform settings (commission rates, fees, escrow periods, security knobs) are gated by `rbacMiddleware('admin', 'super_admin')` — both roles allowed. Junior admin can change `commission_rate_founding` from 0.10 to 0.50 in one click. Single most-leveraged knob in the platform is junior-admin editable.
- **CancellationPolicyPage is the gold-standard pattern.** Properly gated to super_admin (client + server). 1-hour in-place edit window. Real-time refund preview. New versions auto-close the previous via `effective_to`. Bug 1170/1198 fixes verified. **This is the template for all other admin mutation pages.**
- AnalyticsPage A/B Tests tab correctly feature-flag-gated (Phase 14 D13 Bug 45). The flag-driven tab filter is a clean pattern.
- DashboardPage exposes guarantee fund runway, platform revenue, escrow balance to all admins. Sensitive BI (a junior admin wearing two hats — at a competitor — could leak liquidity status).
- AnalyticsPage ChurnTab is a phone-number scraping vector — junior admin paginates through every customer's phone + spend. PII exfiltration in plain sight.
- F06 also confirmed Bug 1170/1198 + Phase 14 D02 cancellation policy work is real and well-architected.

---

## CRITICAL bugs (continuing numbering after CRIT-146)

### CRIT-147 — `settings.routes.ts` mounts `rbacMiddleware('admin', 'super_admin')` at the router level; junior admin can edit ALL platform settings (commissions, fees, escrow, security)
**Files:**
- [apps/admin/src/pages/SystemSettingsPage.tsx:1-427](apps/admin/src/pages/SystemSettingsPage.tsx) — entire page; no useAuthStore
- [packages/api/src/routes/settings.routes.ts:14-15](packages/api/src/routes/settings.routes.ts#L14)

```ts
// settings.routes.ts:14-15 — router-level middleware
router.use(authMiddleware);
router.use(rbacMiddleware('admin', 'super_admin'));  // ← BOTH allowed
```

```tsx
// SystemSettingsPage.tsx — entire page
// (no `useAuthStore` import; client never checks role)
```

The platform's economic and security configuration is a single endpoint surface:

- **Commissions**: `commission_rate_founding`, `commission_rate_new`, `commission_rate_verified`, `commission_rate_pro`, `commission_rate_elite`
- **Fees**: `service_fee_pct`, `payment_processing_fee_pct`, `delivery_fee_centavos`
- **Escrow**: `escrow_hold_period_hours`, `dispute_grace_period_hours`
- **Cancellation**: see CancellationPolicyPage (correctly super_admin-gated).
- **Auth**: `auth_lock_threshold`, `jwt_access_ttl_seconds`, `jwt_refresh_ttl_seconds`, `password_min_length`
- **Provider**: `provider_min_kyc_age_days`, `provider_payout_min_amount_centavos`
- **Security**: `mfa_required_after_n_signins`, `session_idle_timeout_minutes`
- **Cache**: `settings_cache_ttl_seconds`

**Attack scenario (junior admin, role='admin', intended permissions: support tickets only):**

1. Open /settings.
2. Click Commissions category.
3. Click pencil on `commission_rate_founding` (currently 0.10 = 10% commission).
4. Type 0.50 (50% commission).
5. Reason field is **OPTIONAL** (line 347 `placeholder="Change reason (optional, audited)"`).
6. Click Save → mutation fires, no confirm.
7. Cache TTL 60 seconds → within 1 minute, every booking in flight charges 50% commission instead of 10%.
8. Founding-tier providers see income drop 80% in real time.
9. Provider mass-cancellations begin within 5 minutes.

Or worse:
- `auth_lock_threshold` set to 1000 → brute-force protection effectively disabled.
- `jwt_access_ttl_seconds` set to 86400000 → access tokens never expire, stolen tokens never rotate.
- `mfa_required_after_n_signins` set to 9999 → MFA effectively disabled for all admins.

Server-side, `rbacMiddleware('admin', 'super_admin')` accepts BOTH roles. There is NO further check. Audit log captures the change but the change has already happened.

**Fix dispatch:**
```
1. Server (settings.routes.ts:15):
   - Replace `rbacMiddleware('admin', 'super_admin')` with `rbacMiddleware('super_admin')`.
   - Add per-key permission tags: each setting has a `min_role` column ('admin' | 'super_admin' | 'cto').
     - All money/security/auth settings: 'super_admin' minimum.
     - Read-only display settings (e.g., `analytics_default_window_days`): 'admin' OK.
   - Service layer enforces the per-key role check before update.

2. Server: bound checks on critical settings:
   - commission rates: 0.0 - 0.50 max (currently no enforcement client OR server visible).
   - jwt_access_ttl_seconds: max 86400 (1 day).
   - auth_lock_threshold: max 100.
   - Reject out-of-bound values with 422.

3. Server: REQUIRED reason field for any setting marked `is_sensitive` OR with `min_role >= super_admin`.
   - PUT /:key returns 422 if reason missing AND setting requires it.

4. Client (SystemSettingsPage):
   - Add useAuthStore. Display "Super-admin access required" empty state for junior admins (mirror of CancellationPolicyPage line 168-177).
   - Add typed-CONFIRM input on save for high-stakes settings (commission, auth, escrow).
   - Bound checks before submit (use the server's min/max).
   - Reason field REQUIRED ≥20 chars for all changes; visual indicator.

5. Two-person rule for highest-stakes settings:
   - Commission rates + escrow_hold_period_hours: super_admin proposes → second super_admin co-signs.

6. Tests:
   - Render SystemSettingsPage with role='admin' → redirect to access-denied screen.
   - PUT /settings/commission_rate_founding with role='admin' → 403.
   - PUT with super_admin but no reason → 422 "reason required for sensitive setting".
   - PUT with reason but value out of bound → 422.

7. Bundle with the staff permissions dispatch (CRIT-23/56/120/121/130/131/137/142).
```

**Runtime verification:**
1. Seed admin@onservice.us (super_admin) and support@onservice.us (admin only).
2. Log in as support@onservice.us → /settings → "Super-admin access required" screen.
3. curl PUT /api/v1/admin/settings/commission_rate_founding with support's session → 403.
4. As super_admin → can navigate, must enter reason ≥20, must type CONFIRM-COMMISSION-CHANGE for commission settings.
5. Audit log row written with full diff + reason.

---

### CRIT-148 — DashboardPage exposes guarantee fund runway + platform revenue + escrow balance to all admins (no role gate)
**Files:**
- [apps/admin/src/pages/DashboardPage.tsx:1-505](apps/admin/src/pages/DashboardPage.tsx) — entire page; no useAuthStore
- [apps/admin/src/pages/DashboardPage.tsx:407-426](apps/admin/src/pages/DashboardPage.tsx#L407) — wallet cards

```tsx
// DashboardPage.tsx:407-426 — wallets row, ALL admins see this
<WalletCard title="Platform Escrow" amount={k.escrowBalance} description="Held in escrow" />
<WalletCard title="Platform Revenue" amount={k.platformRevenue} description="Commission + fees" valueColor="text-emerald-600" />
<WalletCard title="Guarantee Fund" amount={k.guaranteeFund} description={`${k.guaranteeFundRunwayMonths} months runway`} warning={k.guaranteeFundRunwayMonths < 3} />
```

**Real-world impact:**

- **Liquidity intelligence leak.** A junior admin with a side gig at a competitor (or a former employee whose access wasn't revoked) sees `guaranteeFundRunwayMonths < 3` and can publish that the platform is liquidity-stressed. Bank run on provider payouts. Customer trust collapses.
- **Commission revenue exposure.** Competitors learn the actual platform take (commission + fees) by total. They can outbid the platform's commission to providers.
- **Escrow balance** is the float; if exposed, an attacker with insider access can plan timing of attacks (e.g., dispute fraud right before escrow release sweep).

The `pendingDisputes`, `escalatedDisputes`, `staleDisputes` counts also leak operational status.

**Fix dispatch:**
```
1. Server (admin.routes.ts dashboard endpoints OR new dashboard.routes.ts):
   - GET /admin/dashboard/kpis → split into /admin/dashboard/kpis/operational (admin OK) and /admin/dashboard/kpis/financial (super_admin only).
   - Operational KPIs: active bookings, pending disputes, signups, today's bookings.
   - Financial KPIs: revenue, escrowBalance, platformRevenue, guaranteeFund, guaranteeFundRunwayMonths.
   - Server-side gate: financial endpoint requires super_admin OR `dashboard.financial_view` permission.

2. Client (DashboardPage):
   - Conditional render: financial KPIs hidden for non-super-admin.
   - useAuthStore + permissions check.
   - For non-super-admin, show only Operational Alerts + Quick Actions + Cities.

3. Cities row (line 442-462) shows activeProviders + todayBookings per city — operational, OK for admin to see.

4. Tests:
   - Render DashboardPage with role='admin' → no Wallet cards section.
   - With super_admin → wallets visible.
   - Server: GET /dashboard/kpis/financial with role='admin' → 403.

5. Bundle with the staff permissions dispatch.
```

---

### CRIT-149 — AnalyticsPage ChurnTab exposes customer phone+name+spend to ALL admins (PII exfiltration vector)
**File:** [apps/admin/src/pages/AnalyticsPage.tsx:266-339](apps/admin/src/pages/AnalyticsPage.tsx#L266)

```tsx
// ChurnTab — line 315-323 — every admin sees full customer phone + spend
{data?.data.map((c) => (
  <tr key={c.userId} className="border-t">
    <td className="px-3 py-2 font-medium">{c.name || '—'}</td>
    <td className="px-3 py-2 text-slate-600">{c.phone}</td>  ← PII unconditional
    <td className="px-3 py-2 text-center text-slate-600">{c.lastBookingDate ? ... : 'Never'}</td>
    <td className="px-3 py-2 text-center">{c.totalBookings}</td>
    <td className="px-3 py-2 text-center">{formatCurrency(c.totalSpent)}</td>  ← spend unconditional
    <td className="px-3 py-2 text-center font-bold">{c.riskScore}</td>
    <td className="px-3 py-2 text-center"><span className={...}>{c.riskLevel}</span></td>
  </tr>
))}
```

Junior admin pages through this list, captures phone numbers + total spent for every customer. Combined with the customer's name, this is a full PII export via screen scrape. Even worse: the `riskLevel='critical'` filter shows the LEAST-engaged customers (most likely to be poached by a competitor with a discount offer).

**Real-world impact:** competitor phishes a junior admin (or former staff with stale access). Junior admin opens /analytics → Churn → Critical → exports the full at-risk customer database via copy-paste or browser DevTools. Competitor sends targeted SMS marketing to those phone numbers ("Try our service, ₱100 off your first booking"). Customer churn accelerates.

NPC RA 10173 §11 (data minimization): admins should only see PII relevant to their role. Junior admin doing support tickets does not need the entire churn-risk database.

**Fix dispatch:**
```
1. Server (analytics endpoint /admin/analytics/churn):
   - Require super_admin OR perm 'analytics.churn_view'.
   - Junior admin gets aggregated counts only (e.g., "234 critical, 567 high, 1234 medium") — no per-customer rows.

2. Apply to all of AnalyticsPage:
   - CohortTab, ChurnTab, QualityTab, CommissionTab → gate to super_admin OR analytics permission.
   - A/B Tests can be admin OK (no PII).

3. Client (AnalyticsPage):
   - useAuthStore. Hide tabs for non-super-admin (except A/B Tests if feature flag enabled).

4. Tests:
   - Render AnalyticsPage with role='admin' → only A/B Tests tab visible.
   - With super_admin → all tabs.
   - Server: GET /admin/analytics/churn with role='admin' → 403.

5. Bundle with the PII redaction dispatch (CRIT-132).
```

---

### CRIT-150 — `is_sensitive` flag on platform settings exists in the schema but UI shows sensitive values plaintext
**File:** [apps/admin/src/pages/SystemSettingsPage.tsx:194-203](apps/admin/src/pages/SystemSettingsPage.tsx#L194)

```ts
function formatValue(s: PlatformSetting): string {
  if (s.isSensitive) return s.value;  // ← shows raw value, no masking
  if (s.unit === '%') return `${s.value}%`;
  if (s.unit === 'centavos') {
    const pesos = Number(s.value) / 100;
    return `₱${pesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  }
  if (s.unit) return `${s.value} ${s.unit}`;
  return s.value;
}
```

The schema has `isSensitive: boolean` (line 53 of the interface). Setting authors can mark a setting as sensitive (e.g., a webhook secret, a feature flag with security implications, an internal API key). But the UI's `formatValue` for sensitive settings returns the raw value with no masking.

If platform_settings has rows like:
- `paymongo_webhook_secret` (isSensitive=true, value="whsec_abc123...")
- `internal_metrics_token` (isSensitive=true, value="bearer_xyz789...")
- `feature_flag_admin_master_kill` (isSensitive=true, value="enabled")

These are displayed in plaintext to ANY admin (per CRIT-147, server doesn't even gate to super_admin). Anyone watching the screen reads the secret.

The audit log history view (line 391-416) ALSO shows old → new value of sensitive settings: `<span className="font-mono">{h.old_value ?? '∅'}</span> → <span className="font-mono">{h.new_value}</span>`. **Past secrets are leaked retroactively.**

**Fix dispatch:**
```
1. Client (formatValue, line 195):
   if (s.isSensitive) return '••••••••';  // mask by default

2. Add a "Reveal" button next to sensitive settings — click reveals for 5 seconds, audit log row written ('sensitive_setting_revealed').

3. Server: when value is requested and is_sensitive=true, return masked value by default. Add ?reveal=true query param requiring super_admin to return real value.

4. History view: never show old/new values of sensitive settings. Show `[REDACTED] → [REDACTED]` with reason + change time.

5. Bundle with CRIT-135 (audit log secret leak) — same family of secret-exposure-via-admin-UI.

6. Tests:
   - Render setting with isSensitive=true → `••••••••` shown.
   - Click Reveal → 5s window, audit row written.
   - History view of sensitive setting → never shows actual value.
```

---

## MEDIUM bugs (continuing from MED-358)

### MED-359 — None of DashboardPage / AnalyticsPage / SystemSettingsPage import `useAuthStore` (CancellationPolicyPage does, correctly)
**Files:** DashboardPage:1-42, AnalyticsPage:1-7, SystemSettingsPage:1-37

CRIT-132 / MED-301 / MED-323 / MED-341 family. Apply the CancellationPolicyPage pattern (line 76, 168-177).

### MED-360 — Settings save has NO confirm dialog; one click changes platform-wide commission
**File:** [apps/admin/src/pages/SystemSettingsPage.tsx:189-192](apps/admin/src/pages/SystemSettingsPage.tsx#L189)

`saveEdit()` → `updateMutation.mutate(...)`. No interstitial. Same MED-315 family (immediate-mutation antipattern).

### MED-361 — Settings reason field is OPTIONAL; should be REQUIRED ≥20 chars for all sensitive settings
**File:** [apps/admin/src/pages/SystemSettingsPage.tsx:343-349](apps/admin/src/pages/SystemSettingsPage.tsx#L343)

```tsx
<input ... placeholder="Change reason (optional, audited)" ... />
```

Reason field has no length validation. Submission proceeds with empty reason. Audit log captures `change_reason: null`. Same family as MED-342 (hardcoded reasons).

### MED-362 — Settings client-side does NOT validate against displayed `minValue` / `maxValue` range
**File:** [apps/admin/src/pages/SystemSettingsPage.tsx:308-313](apps/admin/src/pages/SystemSettingsPage.tsx#L308)

```tsx
{(s.minValue !== null || s.maxValue !== null) && (
  <p className="text-xs text-gray-400 mt-1">
    Range: {s.minValue ?? '—'} – {s.maxValue ?? '—'}
    {s.unit ? ` ${s.unit}` : ''}
  </p>
)}
```

Range is displayed but the input (line 319-325) accepts any value. Server presumably validates and returns 422; admin sees error toast and re-edits. Bad UX. **Fix:** disable Save button if value is out of [min, max].

### MED-363 — Settings cache flush button has no confirm or rate limit visible to admin
**File:** [apps/admin/src/pages/SystemSettingsPage.tsx:230-238](apps/admin/src/pages/SystemSettingsPage.tsx#L230)

Click → cache flushed. If 50 admin sessions click in 5 minutes, the cache is constantly busted, causing every settings read to hit DB. **Fix:** server-side rate limit (1 flush per 60 seconds per admin); client-side disable for 60s after click.

### MED-364 — DashboardPage `/service-areas/${city.id}` link target route doesn't exist (per F05 ServiceAreasPage)
**File:** [apps/admin/src/pages/DashboardPage.tsx:443](apps/admin/src/pages/DashboardPage.tsx#L443)

ServiceAreasPage shows the list at `/service-areas` but doesn't have a per-area detail route at `/service-areas/:id`. Click → 404 OR redirect. **Fix:** verify route + add detail page (per F05 MED-347 family).

### MED-365 — DashboardPage `/financials/reports` link doesn't exist
**File:** [apps/admin/src/pages/DashboardPage.tsx:391-396](apps/admin/src/pages/DashboardPage.tsx#L391)

F02 audit covered FinancialsPage (multi-tab) but no `/reports` sub-route. Quick action button is broken. Either remove or implement the deep-link.

### MED-366 — DashboardPage `refreshedAt` set on render, never updates after refetch
**File:** [apps/admin/src/pages/DashboardPage.tsx:191](apps/admin/src/pages/DashboardPage.tsx#L191)

`const refreshedAt = new Date().toLocaleTimeString('en-PH');` — computed once at render. After 60s auto-refetch, the timestamp is stale. Admin reading "Last: 14:23:45" thinks data is current; it's actually 4 minutes old. **Fix:** track `dataUpdatedAt` from useQuery.

### MED-367 — DashboardPage uses browser default timezone for `toLocaleTimeString`, not Asia/Manila
**File:** [apps/admin/src/pages/DashboardPage.tsx:191](apps/admin/src/pages/DashboardPage.tsx#L191)

`new Date().toLocaleTimeString('en-PH')` — locale is en-PH but timezone defaults to browser. Admin in another timezone sees their local time, not Manila. **Fix:** specify `{ timeZone: 'Asia/Manila' }`.

### MED-368 — AnalyticsPage A/B test status mutations (Start/Pause/End/Resume) fire immediately, no confirm
**File:** [apps/admin/src/pages/AnalyticsPage.tsx:144-147](apps/admin/src/pages/AnalyticsPage.tsx#L144)

`End` on an active test irrecoverably ends it. Clicking by mistake stops a running experiment with weeks of data collection. Same family as MED-315.

### MED-369 — AnalyticsPage QualityTab "Recompute Scores" no confirm, no rate limit visible
**File:** [apps/admin/src/pages/AnalyticsPage.tsx:396-398](apps/admin/src/pages/AnalyticsPage.tsx#L396)

Click → expensive computation kicks off. No frequency limit. Junior admin clicking every 30s could DoS the DB. **Fix:** server-side rate limit (1/hour per admin); client-side disable + ETA display ("Last computed 2 hours ago — next available in 58 minutes").

### MED-370 — CancellationPolicyPage `provider_no_show_credit_php` is in PESOS; rest of platform stores money in centavos (consistency drift)
**File:** [apps/admin/src/pages/settings/CancellationPolicyPage.tsx:43, 73, 244, 408](apps/admin/src/pages/settings/CancellationPolicyPage.tsx#L43)

The interface has `provider_no_show_credit_php: number` (note `_php` suffix for pesos). Server stores in pesos too (per Bug 1170 dispatch). The rest of the platform (bookings.totalAmount, walletTransactions.amount, payments.amount, settings with `unit: 'centavos'`) all store in centavos.

This is a documented inconsistency from the cancellation policy table design. Risk: future code that reads this column without knowing the unit treats it as centavos and divides by 100, displaying a 100× smaller value. **Fix:** migrate to centavos for consistency, or rename to `provider_no_show_credit_pesos` for explicit clarity at every read site.

### MED-371 — CancellationPolicyPage no diff view between versions
**File:** [apps/admin/src/pages/settings/CancellationPolicyPage.tsx:466-497](apps/admin/src/pages/settings/CancellationPolicyPage.tsx#L466)

Version history table shows version, dates, tier_count, no-show credit, creator. To compare v3 vs v4 tier configs, admin must open each separately. **Fix:** add "Compare" button on row → show side-by-side tier diff.

### MED-372 — CancellationPolicyPage `SAMPLE_BOOKING_PHP = 1000` hardcoded for preview
**File:** [apps/admin/src/pages/settings/CancellationPolicyPage.tsx:62](apps/admin/src/pages/settings/CancellationPolicyPage.tsx#L62)

Preview always assumes ₱1,000 booking. For a Boracay launch where median booking might be ₱500 or ₱2,500, the preview doesn't reflect reality. **Fix:** make preview booking amount editable.

### MED-373 — Dashboard alerts feed swallows errors silently (CRIT-126 family)
**File:** [apps/admin/src/pages/DashboardPage.tsx:138-141](apps/admin/src/pages/DashboardPage.tsx#L138)

```ts
queryFn: async () => {
  try {
    return await fetchJson<...>('/api/v1/admin/compliance/dsr-alerts');
  } catch {
    return [];
  }
}
```

DSR alerts query swallows error, returns empty array. Dashboard shows "No alerts" when really the feed is broken. Same family as F02 CRIT-126 (DispatchConsole silent feed failure).

---

## LOW / INFO

- **CancellationPolicyPage is the gold-standard admin mutation page.** Use as template for fixing F03/F04/F05 pages without role gates:
  - useAuthStore + early return with EmptyState (line 76, 168-177)
  - 1-hour in-place edit window (line 162-166)
  - Real-time refund preview (line 154-160)
  - Server-side rbacMiddleware('super_admin') (cancellation-policy-admin.routes.ts:37)
  - Validators that compute fee_percent automatically from refund_percent
  - Audit logger ('cancellation_policy_version_created' / '_edited_in_place')

- **Phase 14 D02 + Bug 1170/1198 fixes verified.** Cancellation policy schema (migration 071), service, validators, admin routes, admin UI all consistent. Real work, not theatre.

- **A/B Tests feature-flag tab filter** at AnalyticsPage line 14, 500-503 — clean pattern. Phase 14 D13 Bug 45 verified.

- **DashboardPage useAdminSocketEvent** for live alert push (line 91-93). Real-time invalidation is correct.

- **Settings audit history view** (SystemSettingsPage line 391-416) shows old → new with reason. Decent. Just needs sensitive-redaction (CRIT-150) and required reason (MED-361).

- **`refetchInterval: 60_000` on dashboard KPIs** is reasonable. Server load = (N admins × 1 dashboard tab × 1/60s).

- **CancellationPolicyPage refund_percent locked to 100 - fee_percent invariant** (line 331) — math guard.

- **Analytics CommissionTab** is read-only suggestion view; doesn't actually change commission rates (those are SystemSettings → see CRIT-147).

---

## Cross-cutting families this phase newly fed

- **`rbacMiddleware('admin', 'super_admin')`** at router level allowing both roles equally on money-affecting endpoints (CRIT-147 — extends CRIT-130/142): + 1 site (settings.routes.ts).
- **No client-side role gate** (MED-301 family): + 3 sites (Dashboard, Analytics, SystemSettings).
- **No confirm dialog on destructive mutations** (MED-315 family): + 4 sites (Settings save, Settings reset, Cache flush, Recompute scores, A/B status mutations).
- **PII exposure to junior admins** (CRIT-132 family): + 1 critical site (ChurnTab phone+spend).
- **Sensitive secret leak via admin UI** (CRIT-135 family): + 1 site (SystemSettings sensitive value display + history).
- **Broken admin links to non-existent routes** (MED-364/365 — new family): + 2 sites (Dashboard /service-areas/:id, /financials/reports).
- **Unit drift (pesos vs centavos)** (MED-370 — new family): + 1 site (cancellation policy provider_no_show_credit_php).
- **Stale "last refreshed" timestamps** (MED-366 — new family): + 1 site.
- **Browser-local timezone instead of Asia/Manila** (MED-367 — new family): + 1 site; likely repeats across pages.

---

## Phase F running totals (after F06)

| | Lines fully read | Findings docs |
|---|---:|---|
| F01 (Foundations) | 1,180 | 1 |
| F02 (Money + booking + dispute) | 5,079 | 1 |
| F03 (User + provider + staff + identity + audit) | ~4,500 | 1 |
| F04 (Compliance + data-rights + notification templates) | ~2,743 | 1 |
| F05 (Catalog + pricing + marketing + ops) | ~4,400 | 1 |
| **F06 (Dashboard + analytics + settings + cancellation policy)** | **~2,355** | **1** |
| **Phase F total so far** | **~20,257** | **6** |

| | New CRITs | New MEDs |
|---|---:|---:|
| F06 | 4 (CRIT-147 through CRIT-150) | 15 (MED-359 through MED-373) |

**Cumulative audit totals after F06:**
- ~72,938 lines fully read (~52.0% of ~140,380)
- **150 CRITICAL** bugs (1 invalidated → **149 real**, +4 this phase)
- **373 MEDIUM** bugs (+15)

**Top F06 fixes by impact:**

1. **CRIT-147 (settings.routes.ts allows admin role to edit ALL platform settings)** — single biggest finding of F06. Bundle with the staff permissions dispatch. **Critical pre-launch.**
2. **CRIT-149 (ChurnTab PII exfiltration)** — junior admin scrapes phone numbers + spend. Bundle with PII redaction dispatch.
3. **CRIT-150 (sensitive settings shown plaintext)** — bundle with CRIT-135 (audit log secret leak).
4. **CRIT-148 (dashboard financial KPIs visible to all admins)** — split dashboard into operational + financial endpoints.
5. **MED-361 (settings reason optional)** — make required ≥20 chars for sensitive settings.

---

## What's left in Phase F

### F07 — UI components (~1,000 lines, NEXT)
- `apps/admin/src/components/ui/` — DataTable, Dialog, Pagination, KpiCard, Chart, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Label, LoadingState, Select, Skeleton, Switch, Tabs, Textarea, Tooltip, icons/index

These are the foundational components used by every page. Watch for:
- Accessibility (aria, keyboard, focus management)
- XSS via uncontrolled rendering (e.g., DataTable cell renderers passing user input to dangerouslySetInnerHTML)
- Theming inconsistencies
- Untyped props that allow any value
- Hidden coupling (e.g., DataTable assumes a specific server response shape)

After F07: write **PHASE-F-SUMMARY-AND-HANDOFF.md** consolidating F01-F07. Then Phase G (migrations + RLS, ~4,000 lines, 88 SQL files). Then Phase H (test quality audit). Then Phase I (master AI-coder dispatch synthesizing 149+ CRITs into ~25-30 launch-ready dispatches).

---

## Discipline notes from this phase

1. **CancellationPolicyPage is the proof that the team CAN ship a properly gated, well-validated, defensively-architected admin mutation surface.** The pattern is in the codebase. The other pages (CRIT-128, 130, 137, 142, 144, 147, etc.) just need the same treatment. Phase I dispatch should explicitly reference CancellationPolicyPage as the template.

2. **`rbacMiddleware('admin', 'super_admin')`** at router level vs `rbacMiddleware('super_admin')` is a one-character difference that lands a CRIT. Server-side audit MUST examine every router.use('rbacMiddleware...') for the role list. CI lint: any rbacMiddleware including 'admin' on a /admin/settings, /admin/pricing-rules, /admin/service-areas, or /admin/cancellation-policies route must be flagged.

3. **The financial dashboard exposure (CRIT-148)** is a class of finding that won't show up in any automated scan. It's a "what does a junior admin learn by opening this page" question. Phase I dispatch should include a Junior-Admin Scout test: log in as a junior admin, navigate every page, screenshot what they see. Anything beyond support-ticket-related data is a finding.

4. **The ChurnTab vector (CRIT-149)** is the single biggest PII exposure surface in the admin. Bundle with the redact-pii wrapper dispatch.

5. **Settings server-side validation gap** — server enforces `min_value`/`max_value` per setting (per the schema). But there's no enforcement that the entire setting CATEGORY (e.g., commissions) fits a global business rule like "no commission > 30%". Add a per-category validator.

6. **Cache flush button DoS vector (MED-363)** is an underestimated server-load concern. Each flush forces re-read of every settings row from DB. At launch with 50 admin sessions on the dashboard, even one accidental flush per minute is significant.
