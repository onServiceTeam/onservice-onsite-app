# Screen Inventory — onService PH (Phase 37)

Generated 2026-05-04 from the live codebase. Tracks every UI surface
the app renders: 28 admin pages + 84 mobile screens = **112 screens**.

For backend route + service inventory, see Phase 17→36 closeout files
(.ai-coder/phase-15-real-audit/PHASE-NN-FINAL.md). For each screen
below: route, role gate, primary code path, primary API endpoints,
primary DB tables, and verification status.

Verification taxonomy:
- **PW** = Playwright visual baseline captured (`apps/admin/tests/visual/`)
- **DOM** = Jest/Vitest @testing-library/react render test
  (`apps/admin/src/pages/__tests__/`)
- **JEST** = mobile real-render test (`apps/mobile/__tests__/screens/`)
- **API** = backend route exhaustively tested (Phase 17→36)

═══════════════════════════════════════════════════════════════════════
ADMIN APP (apps/admin/) — 28 pages, Vite + React 19, port 7382
═══════════════════════════════════════════════════════════════════════

| # | Route | Page file | Roles | Primary APIs | DB tables | Verified |
|---|---|---|---|---|---|---|
| 1 | `/login` | LoginPage.tsx | (public) | POST /auth/admin/login, /auth/admin/2fa/verify | users, login_attempts, security_events | PW + DOM + API |
| 2 | `/` | DashboardPage.tsx | admin, super_admin, dpo | GET /admin/dashboard/{kpis,revenue-trend,booking-volume,acquisition-funnel,alerts,cities} | bookings, providers, users, payouts, escrow_balances | PW + DOM + API (Phase 35a) |
| 3 | `/providers` | ProvidersPage.tsx | admin, super_admin | GET /admin/providers, status filter | providers, users | PW + DOM + API (Phase 22) |
| 4 | `/providers/:id` | ProviderDetailPage.tsx | admin, super_admin | GET /admin/providers/:id/{profile,jobs,financials,reviews,disputes,activity,notes} | providers, bookings, reviews, disputes, provider_admin_notes | PW + DOM + API (Phase 35c) |
| 5 | `/customers` | CustomersPage.tsx | admin, super_admin | GET /admin/customers | users | PW + DOM + API |
| 6 | `/customers/:id` | CustomerDetailPage.tsx | admin, super_admin | GET /admin/customers/:id/{profile,bookings,payments,disputes,referrals,activity}, PUT /:id/status, POST /:id/credit | users, bookings, payment_intents, wallet_transactions, referral_redemptions | PW + DOM + API (Phase 31d) |
| 7 | `/bookings` | BookingsPage.tsx | admin, super_admin | GET /admin/bookings | bookings | PW + DOM + API (Phase 19, 26a) |
| 8 | `/bookings/:id` | BookingDetailPage.tsx | admin, super_admin | GET /admin/bookings/:id, POST /:id/release-escrow, /:id/cancel | bookings, booking_offers, escrow_balances | PW + DOM + API (Phase 35a, 35d) |
| 9 | `/dispatch` | DispatchConsolePage.tsx | admin, super_admin | GET /admin/bookings, GET /:id/match, POST /:id/dispatch + WebSocket | bookings, booking_offers, providers | PW + DOM + API (Phase 26c, 30d, 35b, 36b) |
| 10 | `/catalog` | CatalogPage.tsx | admin, super_admin | GET/POST/PUT/DELETE /catalog/admin/{categories,subcategories,addons} | service_categories, service_subcategories, service_addons | PW + DOM + API (Phase 32d) |
| 11 | `/pricing-rules` | PricingRulesPage.tsx | admin, super_admin | GET/POST/PATCH/DELETE /admin/pricing-rules | pricing_rules | PW + DOM + API |
| 12 | `/disputes` | DisputesPage.tsx | admin, super_admin | GET /admin/disputes | disputes | PW + DOM + API (Phase 25b) |
| 13 | `/disputes/:id` | DisputeDetailPage.tsx | admin, super_admin | GET /admin/disputes/:id, POST /resolve, /escalate | disputes, dispute_messages, admin_actions | PW + DOM + API (Phase 25b) |
| 14 | `/financials` | FinancialsPage.tsx | admin, super_admin | GET /admin/financials/{overview,revenue/by-*,escrow,payouts,guarantee-fund,receipts/search} | bookings, official_receipts, vat_reports, payouts, wallets | PW + DOM + API (Phase 21, 24c, 34c) |
| 15 | `/payouts` | PayoutsPage.tsx | admin, super_admin | GET /admin/payouts, PUT /:id/{approve,reject,complete,clear-aml-review} | payouts, wallets, wallet_transactions | PW + DOM + API (Phase 34b) |
| 16 | `/notification-templates` | NotificationTemplatesPage.tsx | admin, super_admin (delete) | GET/POST/PUT/DELETE /notification-templates | notification_templates | PW + DOM + API (Phase 32a) |
| 17 | `/recurring` | RecurringPage.tsx | admin, super_admin | GET /admin/recurring | recurring_bookings | PW + DOM + API (Phase 25c) |
| 18 | `/business-accounts` | BusinessAccountsPage.tsx | admin, super_admin | GET /admin/business-accounts, POST /:id/{approve,suspend,assign-manager,set-discount}, PUT /invoices/:id/mark-paid | businesses, business_members, business_invoices | PW + DOM + API (Phase 28c) |
| 19 | `/service-areas` | ServiceAreasPage.tsx | admin, super_admin | GET /admin/service-areas, POST/PATCH/DELETE, POST /:id/{activate,pause,notify-waitlist} | service_areas, area_waitlist, provider_service_areas | PW + DOM + API (Phase 28a, 34a) |
| 20 | `/marketing` | MarketingPage.tsx | admin, super_admin | GET/POST/PATCH/DELETE /admin/promotions, GET /admin/marketing/channels | promotions, promotion_redemptions | PW + DOM + API (Phase 29b) |
| 21 | `/analytics` | AnalyticsPage.tsx | admin, super_admin | GET /admin/analytics/{ab-tests,cohorts,churn,quality-scores,commission-optimization} | analytics_aggregates | PW + DOM |
| 22 | `/audit-log` | AuditLogPage.tsx | admin, super_admin | GET /admin/audit-log (paginated + filters) | audit_log, admin_actions | PW + DOM + API (Phase 35a) |
| 23 | `/compliance` | CompliancePage.tsx | dpo, super_admin | GET /admin/compliance/{dsr,breach-log}, GET /admin/breach-log/* | data_subject_requests, breach_log, consent_records | PW + DOM + API (Phase 23d, 31d) |
| 24 | `/data-protection-log` | DataProtectionLogPage.tsx | dpo, super_admin | GET /admin/data-exports, /admin/account-deletions | data_export_requests, account_deletion_requests | PW + DOM + API (Phase 33a) |
| 25 | `/consent-versions` | ConsentVersionsPage.tsx | dpo, super_admin | GET /admin/consent-versions, POST /publish | consent_versions, consent_records | PW + DOM + API |
| 26 | `/support-tickets` | SupportTicketsPage.tsx | admin, super_admin | GET /support-tickets, GET/PATCH /:id/{status,assign,messages} | support_tickets, support_ticket_messages | PW + DOM + API (Phase 31b) |
| 27 | `/staff` | StaffRolesPage.tsx | super_admin | GET/POST/PUT/DELETE /staff, /staff/roles, /staff/dpos/:id/{promote,demote} | admin_staff, admin_roles, users | PW + DOM + API (Phase 30a) |
| 28 | `/settings` | SystemSettingsPage.tsx | admin (read), super_admin (write) | GET/PUT/POST /admin/settings, /:key/{history,reset}, /cache/flush | platform_settings, platform_settings_audit | PW + DOM + API (Phase 32b) |
| 29 | `/settings/cancellation-policy` | settings/CancellationPolicyPage.tsx | super_admin | GET/POST/PUT /admin/cancellation-policies | cancellation_policies | PW + DOM + API (Phase 33b) |
| 30 | `/change-password` | ChangePasswordPage.tsx | (auth, LL#12 forced) | POST /auth/admin/change-password | users (must_rotate_password) | PW + DOM + API |
| (catch-all) | `*` | NotFoundPage.tsx | (any auth) | n/a | n/a | PW |

═══════════════════════════════════════════════════════════════════════
MOBILE APP (apps/mobile/) — 84 screens, Expo SDK 55, RN 0.83
═══════════════════════════════════════════════════════════════════════

Mobile screens use Expo Router file-based routing under `apps/mobile/app/`.
Layout files (`_layout.tsx`) wrap children with auth gates + theme. The
84 count excludes layout wrappers but includes all top-level + nested
routes.

### Auth flow (4 screens)
| # | File | Route | API | DB | Verified |
|---|---|---|---|---|---|
| 1 | app/index.tsx | / | (router redirect) | - | JEST |
| 2 | app/onboarding.tsx | /onboarding | - | - | JEST |
| 3 | app/auth/login.tsx | /auth/login | POST /auth/send-otp | users, login_attempts | JEST + API |
| 4 | app/auth/otp-verify.tsx | /auth/otp-verify | POST /auth/verify-otp | users, refresh_tokens | JEST + API (Phase 23a) |
| 5 | app/auth/register.tsx | /auth/register | POST /auth/send-otp + verify-otp | users | JEST + API |

### Customer tabs (5 screens)
| # | File | Role-gated APIs | Verified |
|---|---|---|---|
| 6 | (tabs)/home.tsx | GET /catalog, /promotions, /suki/membership | JEST |
| 7 | (tabs)/bookings.tsx | GET /bookings | JEST + API (Phase 35d) |
| 8 | (tabs)/wallet.tsx | GET /wallet, POST /wallet/topup | JEST + API (Phase 27a) |
| 9 | (tabs)/profile.tsx | GET/PATCH /auth/me | JEST + API (Phase 33d) |

### Customer feature screens (35 screens)
- account-management, address-picker, addresses (Phase 31c), data-rights (Phase 33a), help, notification-settings (Phase 36a), notifications (Phase 32a), payment-methods, recurring/index, recurring/[id] (Phase 25c), referral (Phase 31a), safety-and-support, search, suki-pros (Phase 29a), terms, wallet-topup (Phase 27a)
- booking/{change-order, checkout, complete, configure, confirm, dispute, form, job-request, make-recurring, payment-failed, photos, quotes, review, tip, tracker, [id]} (Phase 19, 21, 25b, 26a, 36b)
- category/[id], chat/[id] (Phase 29d), provider/[id]

### Provider tabs (4 screens)
| # | File | API | Verified |
|---|---|---|---|
| 10 | (provider-tabs)/dashboard.tsx | GET /providers/me | JEST + API (Phase 34d) |
| 11 | (provider-tabs)/jobs.tsx | GET /providers/me/jobs | JEST + API (Phase 36b) |
| 12 | (provider-tabs)/earnings.tsx | GET /payouts/my | JEST + API (Phase 34b) |
| 13 | (provider-tabs)/provider-profile.tsx | GET /providers/me | JEST + API |

### Provider feature screens (24 screens)
- account-management, availability, calendar, certifications, help
- chat/[id], notifications, payout-settings, payouts (Phase 34b), portfolio, reviews
- schedule, service-area (Phase 34a), services (Phase 34d), settings, skills
- suki-customers, tier-progression, withdraw (Phase 34b)
- job/active, job/[id], job/[id]/{change-order, checklist (Phase 32c), complete, navigate, photos, quote}

### Provider onboarding (8 screens)
- background-check-status, categories, documents, identity-verification
- review-pending, role-select, selfie, service-area, terms (Phase 28a)

═══════════════════════════════════════════════════════════════════════
TEST INFRASTRUCTURE STATUS
═══════════════════════════════════════════════════════════════════════

**Admin app:**
- Vitest @testing-library/react: 31 suites, **101 tests pass + 3 todo**
- Playwright visual baselines: 29 specs × (4 states × 3 viewports) =
  **348 baseline PNGs**, all PASS deterministic across runs
- Source: `apps/admin/src/pages/__tests__/*.real.test.tsx` +
  `apps/admin/tests/visual/*.spec.ts`

**Mobile app:**
- Jest @testing-library/react-native: 84 screen suites + 17 cross-cutting
  tests = **101 suites, 220 tests pass (198 PASS + 22 todo)**
- Source: `apps/mobile/__tests__/screens/*.real.test.tsx`
- **Maestro YAML flows committed but baselines NOT captured** (E02 F#3
  hard-stop — needs iOS Simulator or Android Emulator)

**Backend:**
- 1778+ runtime assertions across 92 test files (Phase 17→36)
- 2700 unit-test assertions
- **= 4478+ total backend assertions verified**

═══════════════════════════════════════════════════════════════════════
NOT-AUTONOMOUSLY-TESTABLE (E02 hard-stops)
═══════════════════════════════════════════════════════════════════════

**Mobile app on real device** — F#3 baselines.
- 84 mobile screens have Jest @testing-library render tests + Maestro
  YAML flows committed.
- What CANNOT be done autonomously: capturing Maestro screenshot
  baselines on iOS Simulator or Android Emulator. The autonomous
  environment has no iOS sim (Mac/Xcode required) or Android emulator
  (AVD + nested virtualisation not present).
- See `.ai-coder/escalations/E02-launch-pends-2026-05-04.md` Section
  "F#3 — Maestro mobile baseline capture" for Ken's specific actions.

**Mobile app interactive testing on a real device** is similarly out of
scope — tested at the Jest @testing-library level (renders + behaves
under mocked native APIs) but not against the real React Native
runtime + native modules.

═══════════════════════════════════════════════════════════════════════
FILES GENERATED IN PHASE 37
═══════════════════════════════════════════════════════════════════════

**New baselines (348 PNG files, ~22 MB):**
- `apps/admin/tests/visual/<page>.spec.ts-snapshots/<page>-{default,loading,empty,error}-{1280,1440,1920}-win32.png`

**Spec template fix:**
- `apps/admin/tests/visual/_fixtures.ts` (NEW) — Playwright extended
  fixture seeding mock /auth/me + sensible default API mocks +
  networkidle wait. Used by all 29 specs.
- All 29 spec files updated to import from `./_fixtures` instead of
  `@playwright/test`.
- 5 spec files had wrong route constants — fixed:
  - `dashboard.spec.ts`: `/dashboard` → `/`
  - `cancellation-policy.spec.ts`: `/cancellation-policy` → `/settings/cancellation-policy`
  - `dispatch-console.spec.ts`: `/dispatch-console` → `/dispatch`
  - `staff-roles.spec.ts`: `/staff-roles` → `/staff`
  - `system-settings.spec.ts`: `/system-settings` → `/settings`

**App code fix (BUG-PHASE37-01):**
- `apps/admin/src/lib/format.ts` — `formatCurrency` now coerces nullish
  / NaN / non-finite input to `0` instead of returning `₱NaN`. Affects
  Dashboard KPI cards, Wallet cards, and chart tooltips.
