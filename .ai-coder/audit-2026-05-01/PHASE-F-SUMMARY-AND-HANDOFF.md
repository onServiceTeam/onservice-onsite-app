# Audit 2026-05-01 — Phase F COMPLETE — Admin web (29 pages + UI primitives) fully audited

**Status:** Phase A + B + C + D + E + F complete. Phase G (migrations + RLS) is next, then H (test quality), then I (master AI-coder dispatch).

**Master commit at audit start:** `b8bd2f2`. Working tree clean apart from `.ai-coder/audit-2026-05-01/` (untracked).

---

## Phase reads to date

| Phase | Status | Lines fully read | Findings docs |
|---|---|---:|---|
| A — Inventory + risk ranking | ✅ Done | n/a | INVENTORY.md |
| B — Money path | ✅ Done | 13,599 | B01–B09 (9 docs) |
| C — Auth + RBAC + sessions | ✅ Done | 6,075 | C01–C05 (5 docs) |
| D — Customer mobile | ✅ Done | 18,979 | D01–D12 (12 docs) |
| E — Provider mobile | ✅ Done | 14,031 | E01–E06 (6 docs) |
| **F — Admin web** | ✅ **DONE** | **~21,111** | **F01–F07 (7 docs)** |
| G — Migrations + RLS | Pending | 0 | — |
| H — Test quality audit | Pending | 0 | — |
| I — Master AI-coder dispatch | Pending | 0 | — |

**Codebase total: ~140,380 lines.** Coverage so far: **~73,795 / 140,380 = ~52.6%**.

---

## Phase F summary — what was audited

### F01 — Foundations (1,180 lines, 0 CRITs, 8 MEDs)
- main.tsx, App.tsx, AdminLayout, Header, Sidebar, lib/api, lib/use-admin-socket, stores/auth.store, hooks/useFeatureFlags, config/admin.config, LoginPage
- Bug 1251 (HttpOnly cookies + CSRF) verified.
- Bug 1271 (native fetch wrapper, transparent 401→refresh→retry) verified.
- Sentry guard on DSN env, lazy-loaded routes, React Query global config — all sound.
- MED-272: AdminLayout only gates by `isAuthenticated`; per-route role guards missing for 22+ admin routes.

### F02 — Money / booking / dispute (5,079 lines, 8 CRITs, 21 MEDs)
- BookingsPage, BookingDetailPage (1,068), FinancialsPage (1,405), PayoutsPage, DispatchConsolePage (865), DisputesPage, DisputeDetailPage (868)
- CRIT-120: Payouts approve/reject/complete not super_admin gated.
- CRIT-121: DisputesPage list-level Resolve unguarded.
- CRIT-122: DispatchConsole map defaults to Manila (Boracay launch family).
- CRIT-123/124: cancel-without-refund-preview + dispute resolve estimate may differ from server.
- CRIT-125: Receipt PDF / dispute evidence URLs are direct S3 presigned links (NPC + privacy).
- CRIT-126: DispatchConsole silently swallows feed errors.
- CRIT-127: Reassign provider dropdown capped at 200.

### F03 — User / provider / staff / identity / audit (4,500 lines, 7 CRITs, 20 MEDs)
- CustomersPage, CustomerDetailPage (1,117), ProvidersPage, ProviderDetailPage (952), StaffRolesPage, AuditLogPage
- CRIT-128: **Government ID + selfie not stored anywhere** (server admin response type literally encodes `governmentIdUrl: null`). Couples with Phase E CRIT-115. **Launch-blocking — NPC + AMLA + business risk.**
- CRIT-129: 'founding' tier missing from admin filter + tier-change dropdowns.
- CRIT-130: Provider mutations (approve/reject/suspend/reactivate/tier) only `requireAdmin` server-side.
- CRIT-131: Review hide no super_admin gate, no reason field.
- CRIT-132: PII (phone/email/IP/user-agent) visible to all admins on every detail page + audit log.
- CRIT-133/134: Wallet credit/adjust unbounded; can drive wallet negative.
- CRIT-135: Audit log raw `oldValues`/`newValues` exposed to admins; password hashes / TOTP secrets / PayMongo tokens may leak.

### F04 — Compliance / data-rights / notification templates (2,743 lines, 6 CRITs, 20 MEDs)
- CompliancePage (812), ConsentVersionsPage, DataProtectionLogPage (605), NotificationTemplatesPage
- CRIT-136: **Erasure DSR "Mark complete" doesn't actually erase data.** UI literally tells the DPO this. Server `markDsrComplete` flips status='completed' regardless. **NPC RA 10173 §16(d) violation. Launch-blocking.** Single biggest finding of the audit.
- CRIT-137: Consent version publish `requireAdmin` only — junior admin can force every customer to re-consent.
- CRIT-138: Notification template editor unguarded, no XSS sanitization, no test-send, no preview, no multi-language.
- CRIT-139: Free-text consentType allows typos to create duplicate types in DB; effectiveAt accepts retroactive dates; UTC midnight = 8 AM Manila bug.
- CRIT-140: DSR responsePayloadUrl is plain user-typed URL. No S3 wrapping. Customer's full data export leaks via referrer + browser history.
- CRIT-141: Two parallel DSR endpoints (PATCH /dsr/:id `requireAdmin` vs POST /dsr/:id/{complete,reject,...} super_admin where applicable) — junior admin bypasses dedicated guards via PATCH.

### F05 — Catalog / pricing / marketing / ops (4,400 lines, 5 CRITs, 18 MEDs)
- CatalogPage, PricingRulesPage, MarketingPage (1,301), RecurringPage, ServiceAreasPage, BusinessAccountsPage, SupportTicketsPage
- CRIT-142: Pricing rules + service area mutations all `requireAdmin` only. Junior admin can spike platform-wide pricing 5× or pause Boracay launch.
- CRIT-143: Marketing campaign edit lets admin manually override `attributedSignups` / `attributedFirstBookings` / `attributedRevenueCentavos`. Direct attribution-fraud vector.
- CRIT-144: Catalog admin endpoints all `requireAdmin` only.
- CRIT-145: Subcategory price `Number(price) * 100` without `Math.round` — money precision drift.
- CRIT-146: Promo redemption disabled in v1.0 (truth-in-UI banner). Codes inert until v1.1; risk of post-launch retroactive activation issues.

### F06 — Dashboard / analytics / settings / cancellation policy (2,355 lines, 4 CRITs, 15 MEDs)
- DashboardPage, AnalyticsPage, SystemSettingsPage, settings/CancellationPolicyPage
- CRIT-147: `settings.routes.ts` mounts `rbacMiddleware('admin', 'super_admin')` at router level — junior admin can edit ALL platform settings (commissions, fees, escrow, security knobs).
- CRIT-148: Dashboard exposes guarantee fund runway + platform revenue + escrow balance to all admins.
- CRIT-149: AnalyticsPage ChurnTab exposes customer phone+name+spend to all admins (PII exfiltration vector).
- CRIT-150: `is_sensitive` flag exists but UI shows sensitive values plaintext (also in audit history).
- **CancellationPolicyPage IS the gold-standard pattern.** Properly gated, 1-hour in-place edit window, real-time refund preview, server enforces `rbacMiddleware('super_admin')`.

### F07 — UI components (854 lines, 0 CRITs, 6 MEDs)
- All 21 components in `apps/admin/src/components/ui/` fully read.
- Components are well-architected. Most use Radix UI primitives for accessibility.
- Real findings about UI usage (inline modal divs, native confirm()) are page-level, captured in F02-F06.

---

## Phase F headline counts

| Severity | Phase F additions | Cumulative total |
|---|---:|---:|
| **CRITICAL** | **+30 (1 demoted to MED-301 → 29 real)** | **150 (1 invalidated → 149 real)** |
| **MEDIUM** | **+108 (MED-272 through MED-379)** | **379** |

(Phase F adds CRIT-120 through CRIT-150; CRIT-132 was originally a StaffRolesPage finding that demoted to MED-301 after server cross-grep showed correct super_admin gate. CRIT-132 was then re-numbered to PII-exposure finding.)

---

## Phase F — top 10 fixes by impact (ranked)

1. **CRIT-136 — Erasure DSR doesn't actually erase data.** NPC §16(d) violation. UI admits the gap. Launch-blocking.
2. **CRIT-128 — Government ID + selfie not stored.** No DB columns. NPC + AMLA + sending strangers to homes. Launch-blocking.
3. **CRIT-147 — All platform settings editable by junior admin.** One click changes commission rate platform-wide.
4. **CRIT-149 — ChurnTab phone+name+spend exposed to all admins.** PII exfiltration vector.
5. **CRIT-130 + CRIT-131 + CRIT-142 + CRIT-144 + CRIT-148** — same family: server-side `requireAdmin` allowing junior admin to do super-admin-grade operations. **Single dispatch fixes all.**
6. **CRIT-138 — Notification template editor unguarded.** Phishing vector (any admin edits push body to malicious link, all customers receive).
7. **CRIT-137 — Consent version publish unguarded.** Junior admin forces platform-wide re-consent.
8. **CRIT-135 — Audit log raw oldValues/newValues exposes secrets** (passwords, TOTP, PayMongo tokens).
9. **CRIT-150 — Sensitive settings shown plaintext** (couples with CRIT-135 audit log secret leak).
10. **CRIT-125 + CRIT-128 + CRIT-140** — same family: PII files (PDFs, KYC, DSR responses) accessible via long-lived presigned URLs. Single dispatch wraps all in proxied `/download` endpoints.

---

## Cross-cutting families confirmed by Phase F

These appear repeatedly across Phase F and prior phases. Phase I dispatch must address all of them.

1. **Server-side `rbacMiddleware('admin', 'super_admin')` or `requireAdmin` on money/launch-impacting writes** (CRIT-130/131/142/144/147 — also CRIT-23/56/120/121 from prior phases). 10+ sites. **Single dispatch: tighten role gates + introduce per-permission flags.**
2. **No client-side role gate** (MED-272/301/323/341/359 family). 23+ admin routes only gated by `isAuthenticated`. Single dispatch: `<RequireRole>` HOC + per-route role guards.
3. **PII exposure to junior admins** (CRIT-132/149 family). Phone, email, IP, user-agent, customer churn lists, sensitive BI on Dashboard. Single dispatch: `<RedactPii>` wrapper + granular `customers.view_pii` / `audit.view_user_pii` permissions.
4. **Onboarding theatre / KYC not stored** (CRIT-115/117/128 family). Mobile silently swallows 404s; admin sees "not stored — see HONESTY-CHECK"; provider approved with zero KYC record. Launch-blocking.
5. **Erasure not actually performed** (CRIT-136). NPC violation. Launch-blocking.
6. **Money math drift** (CRIT-13/42/75/81/83/145 family + MED-285/345). `Number(price) * 100` without `Math.round`. CI lint.
7. **Boracay launch unsupported by hardcoded geo** (CRIT-77/92/93/111/116/122 family). Manila defaults across customer + provider + admin. Single dispatch + CI guard.
8. **`'founding'` tier enum drift** (CRIT-97/129 family). 7+ sites missing 'founding' option.
9. **No confirm dialogs on destructive mutations** (MED-283/315/360/368 family). Single-click changes platform-wide commission, hides reviews, suspends providers, ends A/B tests.
10. **Hardcoded reasons** (MED-342) — `reason: 'Admin cancellation'` / `'Admin action'` makes audit log useless.
11. **Status enum drift between client filters and server values** (MED-302/303/304 family).
12. **Inline modal divs vs shared `<Dialog>`** (MED-293/309/337) — pages skip the shared component.
13. **Native `confirm()` for destructive ops** (MED-317/356/338 family).
14. **Free-text inputs that should be enums** (CRIT-139 family — consent type, notification slug, promo code).
15. **Date inputs converted as UTC midnight = 8 AM Manila** (CRIT-139, MED-344 — promo validUntil, consent effectiveAt).
16. **Direct S3 presigned URLs in admin UI** (CRIT-125/128/140 family). Single dispatch: proxy through `/download` routes with audit-on-access.
17. **Audit log secret leak** (CRIT-135) — sensitive-field denylist needed at auditMiddleware.
18. **`is_sensitive` flag display gap** (CRIT-150).
19. **Junior admin can deactivate themselves** (MED-318) — locks platform out.
20. **No multi-language support** (MED-335 — Tagalog for Boracay launch).
21. **Stub TODOs shipped to production** (CRIT-95/MED-321/322 family — Tax Documents tab, Regulatory Reports tab).
22. **TOCTOU on preview vs actual money math** (CRIT-124 — dispute resolve estimate may differ from server).
23. **Marketing attribution direct edit** (CRIT-143) — fraud vector.
24. **Two parallel API paths for same operation** (CRIT-141 — DSR PATCH vs dedicated POST endpoints).
25. **Promo redemption inert in v1.0** (CRIT-146) — operational risk at v1.1 cutover.

---

## What's left

### Phase G — Migrations + RLS (~4,000 lines, 88 SQL files, ~1 session)

Read every migration in `packages/api/migrations/` in order. Watch for:
- **Money columns: NUMERIC vs INTEGER** — currency-as-decimal precision bugs (couples with CRIT-145).
- **RLS policies (or absence)** — some tables may have no row-level security.
- **NOT NULL gaps** — server code assumes NOT NULL; migration didn't enforce.
- **FK gaps** — orphaned rows possible.
- **Index drift** — server queries use indexes that may not exist.
- **provider_kyc tables** — should exist per CRIT-128 fix dispatch. Migration NOT YET WRITTEN. Phase G will note this gap.
- **erasure_executions table** — should exist per CRIT-136 fix dispatch. Migration NOT YET WRITTEN.
- **marketing_campaign_adjustments table** — should exist per CRIT-143 fix dispatch. Migration NOT YET WRITTEN.

### Phase H — Test quality audit (~20,000 lines, ~2 sessions)

Per CLAUDE.md F#7 audit lesson. Patterns to look for:
- `expect(existsSync(...)).toBe(true)` — file-existence-as-test
- `expect(closeout.match(/Bug NNNN/)).toBeTruthy()` — source-content regex tests
- Multi-bug test names (forbidden per CLAUDE.md)
- `it.todo` skipped without specific reason
- "Render but don't assert" — test mounts component but doesn't verify behavior
- Phase 14 R5/R6/R7 remediation tests verified (per Phase E E06 LOW notes — likely some are real-render but don't assert correct data shape).

### Phase I — Master AI-coder dispatch (~1 session)

Synthesize 149 CRITs + 379 MEDs + cross-cutting families into ~25-30 deployable dispatches. Each dispatch:
- **Title + impact statement** (1 paragraph)
- **Files to edit** (with line numbers from F01-F07 + Phase A-E findings)
- **Migration steps** if any (couple to Phase G missing-migrations list)
- **Server changes** (route gating, validators, services, middleware)
- **Client changes** (UI, role gates, confirm dialogs, preview previews)
- **Tests required** (real-render + assertion, not file-existence)
- **Runtime verification protocol** (Docker setup, seed scripts, click-paths, screenshot checks per Ken's brief)
- **Rollback plan**
- **Bundle reference** to which CRITs this dispatch closes (e.g., "closes CRIT-23, CRIT-56, CRIT-120, CRIT-121, CRIT-130, CRIT-131, CRIT-137, CRIT-142, CRIT-144, CRIT-147, CRIT-148, CRIT-149")

Use **CancellationPolicyPage** as the explicit gold-standard template for all admin mutation dispatches.

Phase I synthesizes everything into a runnable plan an AI coder can execute on Ken's machine without human team support.

---

## Resume prompt for next session

> "Continue the audit from `.ai-coder/audit-2026-05-01/`. Phase F is COMPLETE. Read PHASE-F-SUMMARY-AND-HANDOFF.md (this file) first to load state. Then begin **Phase G — Migrations + RLS**. Inventory `packages/api/migrations/` (88 SQL files, ~4,000 lines total). Read every migration in order. Write findings/G01-migrations-and-rls.md with CRITs continuing at CRIT-151 and MEDs continuing at MED-380. Same protocol: full reads, file:line citations, code snippets, fix dispatches with tests + runtime verification, honest line ranges. Watch for: NUMERIC vs INTEGER money columns, RLS policy gaps, NOT NULL gaps, FK gaps, index drift. Note any tables that should exist per Phase F CRITs but don't (provider_kyc per CRIT-128, erasure_executions per CRIT-136, marketing_campaign_adjustments per CRIT-143). After Phase G, write PHASE-G-SUMMARY-AND-HANDOFF.md. Then Phase H (test quality audit, ~20,000 lines, 2 sessions). Then Phase I (master AI-coder dispatch — synthesis of 149+ CRITs into ~25-30 dispatches with full Docker + runtime verification protocols, using CancellationPolicyPage as the gold-standard template)."

---

## Discipline notes carried forward from Phase F

1. **CancellationPolicyPage IS the proof the team can ship correct admin mutation pages.** Pattern: useAuthStore + early-return EmptyState for non-super-admin / server-side `rbacMiddleware('super_admin')` / 1-hour in-place edit window / real-time preview / atomic version close-out. Phase I should reference this explicitly.

2. **`rbacMiddleware('admin', 'super_admin')` vs `rbacMiddleware('super_admin')`** at router level is a one-character difference that lands a CRIT. CI lint should enforce: any rbac middleware that includes 'admin' on a /admin/settings, /admin/pricing-rules, /admin/service-areas, /admin/cancellation-policies, /admin/notification-templates, or /admin/compliance/consent-versions route must be flagged.

3. **Truth-in-UI warnings are CRIT-discovery signals.** The "Government ID — not stored — see HONESTY-CHECK" comment (CRIT-128) and the erasure-not-erasing dialog warning (CRIT-136) and the promo-not-wired banner (CRIT-146) — three findings, three places where the team documented gaps in the UI. Phase I should grep the codebase for "HONESTY-CHECK", "TODO", "not yet implemented" patterns to find any that weren't caught.

4. **Phase 14 dispatches landed real fixes alongside the gaps.** Bug 1170/1198 (cancellation policy), Bug 1251/1271 (HttpOnly cookies), Bug 320/322 (PH bounds), Bug 401/402 (audit-log self-audit + DPO consent gate), Bug 1366 (breach log API), Bug 44/45/152 (feature-flag-gated tabs) — all verified in Phase F as real, defensible work. Phase 14 is NOT all theatre. The findings are the GAPS, not a wholesale dismissal.

5. **The audit honestly crossed 50%.** 73,792 / 140,380 = ~52.6%. Phase G + H + I should bring it to 100% by ~3-4 more sessions.

6. **Don't conflate "page lacks role gate" with "endpoint is unprotected."** Several Phase F CRITs would have been over-counted without server cross-checks. F03 originally found 8 CRITs but I demoted CRIT-132 (StaffRolesPage privilege escalation) to MED-301 after reading staff.routes.ts and confirming server super_admin gate. Cross-grep is mandatory.

7. **Bundle dispatches in Phase I.** The staff-permissions super-dispatch alone closes 10+ CRITs across phases. The PII-redaction dispatch closes 5+. The launch-blocking dispatch (CRIT-128 + CRIT-136 + CRIT-115/117) is the highest priority — without it, launch is illegal under NPC + AMLA.

---

## Estimated remaining audit budget

| Phase | Estimate (lines) | Estimated sessions |
|---|---:|---:|
| G — Migrations + RLS | 4,000 | 1 |
| H — Test quality audit | 20,000 | 2 |
| I — Master AI-coder dispatch | n/a (synthesis) | 1 |
| **Total remaining** | **~24,000** | **~4 sessions** |

Already invested: ~9 sessions (A through F) = ~73,792 lines = ~52.6% of codebase line-by-line + cross-grep verified.
Total program estimate: ~13 sessions to 100% audit + Phase I dispatch.
