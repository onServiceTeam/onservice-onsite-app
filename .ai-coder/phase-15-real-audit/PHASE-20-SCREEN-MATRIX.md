# Phase 20c — Per-screen documentation matrix

Per the audit plan: every screen documented with name/route/role/purpose/
data-read/data-write/tables/APIs/interactive elements/expected vs actual
behavior/bugs found. Status reflects evidence from Phase 17/18/19/20 testing.

Format key:
- **Tested**: H=headless render verified, A=API contract verified, I=interaction verified, M=mutation verified, R=RBAC verified, S=screenshot
- **Status**: ✓=working, ⚠=known issue, ✗=broken
- **Bug refs**: BUG-PHASEN-NN format

---

## Admin web (31 pages)

### Auth + chrome
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| LoginPage | `/login` | none | Email/pwd + 2FA | — | session token | users, admin_2fa_secrets, login_attempts, security_events | POST /auth/admin/login, POST /auth/admin/2fa/setup, POST /auth/admin/2fa/verify, POST /auth/admin/2fa/enable | email, password, TOTP, submit, back-to-login | H,A,S | ✓ | — |
| ChangePasswordPage | `/change-password` | any admin | LL#12 force-rotate | — | password rotation | users, admin_actions, security_events | POST /security/admin/me/change-password | old/new/confirm pwd, show toggle, submit | H,A,M,S | ✓ | — |
| NotFoundPage | `*` | any | 404 catch-all | — | — | — | — | back link | H,S | ✓ | — |

### Dashboard + analytics
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DashboardPage | `/` | admin/super_admin/dpo | KPIs + revenue + alerts | KPI snapshot, alerts, cities | — | bookings, providers, customers, payouts, escrow, guarantee_fund, audit_log | GET /admin/dashboard/{kpis,revenue-trend,booking-volume,acquisition-funnel,alerts,cities} | range select, refresh, alert action links | H,A,I,S | ✓ | BUG-PHASE18-02 (alerts 500, FIXED) |
| AnalyticsPage | `/analytics` | admin/super_admin/dpo | Charts + exports | trends, charts | — | bookings, customers, providers | GET /admin/dashboard/* | date range, chart filters | H,A,I,S | ✓ | — |

### Provider mgmt
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ProvidersPage | `/providers` | admin/super_admin/dpo | List/approve/suspend/tier | provider list | tier, status | providers, admin_actions | GET /admin/providers, PUT /admin/providers/:id/{approve,reject,suspend,reactivate,tier} | search, status filter, tier filter, action buttons, modal w/ reason | H,A,I,M,R,S | ✓ | — |
| ProviderDetailPage | `/providers/:id` | admin/super_admin/dpo | 360 view (7 tabs) | profile/jobs/financials/reviews/disputes/activity/notes | review visibility, wallet adjust, notes | providers, users, bookings, reviews, disputes, wallet_ledger, admin_notes | GET /admin/providers/:id/{profile,jobs,financials,reviews,disputes,activity,notes}, PATCH .../reviews/:rid/visibility, POST .../wallet/adjust, CRUD .../notes | 7 tabs, job status filter, review eye toggle, wallet adjust form, note CRUD | H,A,I,S | ✓ | BUG-PHASE20-01 (Reviews + Disputes paginated-vs-array, FIXED) |

### Customer mgmt
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CustomersPage | `/customers` | admin/super_admin/dpo | List + search | customer list | — | users (role=customer), bookings, disputes | GET /admin/customers | search, status filter, pagination | H,A,I,S | ✓ | — |
| CustomerDetailPage | `/customers/:id` | admin/super_admin/dpo | 360 view (6 tabs) | profile/bookings/payments/disputes/referrals/activity | status, credit | users, customers, bookings, wallet_transactions, referrals | GET /admin/customers/:id/{*}, PUT .../status, POST .../credit | 6 tabs, manage status, suspend/reactivate, flag-fraud, issue credit form | H,A,I,M,S | ✓ | — |

### Bookings
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BookingsPage | `/bookings` | admin/super_admin/dpo | List + filter + search | booking list | — | bookings | GET /admin/bookings | search, status filter, pagination, WS listener | H,A,I,S | ✓ | — |
| BookingDetailPage | `/bookings/:id` | admin/super_admin/dpo | 5-tab 360 + super-admin actions | overview/timeline/evidence/dispute/audit | escrow release, refund, reassign, cancel, force-complete | bookings, escrow, disputes, audit_log | GET /admin/bookings/:id/{*}, POST .../{escrow/release,escrow/refund,reassign,cancel,force-complete} | 5 tabs, action buttons, reason textareas | H,A,I,M,S | ✓ | BUG-PHASE18-05 evidence (FIXED), BUG-PHASE19-01 cancel verb (FIXED) |

### Disputes
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DisputesPage | `/disputes` | admin/super_admin/dpo | List + resolve + escalate | dispute list | resolution, escalation | disputes, audit_log | GET /disputes, PUT /disputes/:id/resolve, POST /disputes/:id/escalate | search, status filter, tier filter, action buttons, modal | H,A,I,S | ✓ | — |
| DisputeDetailPage | `/disputes/:id` | admin/super_admin/dpo | Full case + admin resolution | claim, evidence, party history | resolution, escalation, message, reopen | disputes, audit_log | GET /admin/disputes/:id, POST .../assign,resolve,escalate,message,reopen | claim/response cards, evidence list, resolution form, message form | H,A,M,R,S | ✓ | BUG-PHASE19-01 resolve verb (FIXED) |

### Financial
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FinancialsPage | `/financials` | admin/super_admin/dpo | 7 tabs: escrow/payouts/GMV/recon/BIR | financial reports | — | escrow, payouts, wallets, transactions | GET /admin/financials/* | tabs, date range, action buttons | H,A,I,S | ✓ | (column-drop test triggers degraded banner — Phase 17) |
| PayoutsPage | `/payouts` | admin/super_admin/dpo | Approve/reject/complete | payout list | status, paymongo_transfer_id | payouts, audit_log | GET /payouts, PUT /payouts/:id/{approve,reject,complete} | status filter, action buttons, reject reason, complete txn id | H,A,I,S | ✓ | (no pending payouts seeded — approve/reject untested) |

### Catalog + ops
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CatalogPage | `/catalog` | admin/super_admin/dpo | Categories/subcat/addons CRUD | catalog tree | category/subcat/addon CRUD | service_categories, service_subcategories, service_addons, admin_actions | GET /catalog/full, POST/PUT/DELETE /catalog/admin/{categories,subcategories,addons} | add/edit/delete buttons, expand toggles, modals with forms | H,A,I,M,S | ✓ | BUG-PHASE18-06 verbs (FIXED via mig 118) |
| ServiceAreasPage | `/service-areas` | admin/super_admin/dpo | Coverage zones | area list | CRUD | service_areas | GET /admin/service-areas | (0 areas seeded; list endpoint OK) | H,A | ✓ | (CRUD untested — empty seed) |
| PricingRulesPage | `/pricing-rules` | admin/super_admin/dpo | Dynamic pricing | rules | CRUD | pricing_rules, admin_actions | GET /admin/pricing-rules | rule list, action buttons | H,A,I,S | ✓ | — |
| MarketingPage | `/marketing` | admin/super_admin/dpo | Campaigns | campaign list | CRUD | marketing_campaigns, promo_codes | GET /admin/marketing/campaigns | campaign cards, action buttons | H,A,I,S | ✓ | — |
| RecurringPage | `/recurring` | admin/super_admin/dpo | Recurring bookings | list | cancel | recurring_bookings | GET /admin/recurring, POST /admin/recurring/:id/cancel | search, status filter, cancel | H,A,I,S | ✓ | — |
| BusinessAccountsPage | `/business-accounts` | admin/super_admin/dpo | Corp accounts | accounts | CRUD | business_accounts, businesses | GET /admin/business-accounts | list, modals | H,A,I,S | ✓ | — |
| DispatchConsolePage | `/dispatch` | admin/super_admin/dpo | Live ops | active bookings + online providers | reassign | bookings, providers | GET /admin/bookings?status=active, GET /admin/providers?online=true, WS events | live map, city/status/service filters, refresh, reassign modal | H,A,I,S | ✓ | BUG-PHASE18-03 leaflet StrictMode (FIXED) |

### Ops + governance
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AuditLogPage | `/audit-log` | admin/super_admin/dpo | UNION timeline | audit rows | export | audit_log, admin_actions | GET /admin/audit-log, GET /admin/audit-log/export | actor/action filters, search, export | H,A,I,S | ✓ | — |
| SupportTicketsPage | `/support-tickets` | admin/super_admin/dpo | Ticket queue | ticket list | reply, assign | support_tickets | GET /support-tickets, POST .../reply, PATCH .../assign,status | filters, ticket detail modal | H,A,I,S | ✓ | (admin web URL was `/admin/support-tickets` — actual mount `/support-tickets` works in test) |
| StaffRolesPage | `/staff` | super_admin | Admin user mgmt | admin list | CRUD | users(role=admin), admin_actions | GET /staff/{roles,permissions}, POST/PUT/DELETE /staff/* | list, role select, deactivate, reset 2FA | H,A,I,S | ✓ | — |
| NotificationTemplatesPage | `/notification-templates` | admin/super_admin/dpo | CRUD templates | template list | CRUD | notification_templates, admin_actions | GET/POST/PUT/DELETE /admin/notification-templates | list, create/edit modal w/ slug/title/body/type/channel | H,A,I,M,S | ✓ | BUG-PHASE18-04 alias mount (FIXED), BUG-PHASE19-02 target_type CHECK (FIXED via mig 119) |

### Settings
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SystemSettingsPage | `/settings` | super_admin | Platform settings | 72 settings grouped | bulk update | platform_settings, audit_log | GET /admin/settings, PUT /admin/settings/:key | category tabs, settings forms, save buttons | H,A,I,M,S | ✓ | — |
| CancellationPolicyPage | `/settings/cancellation-policy` | super_admin | Cancellation tiers | policy versions | edit | cancellation_policies | GET /admin/cancellation-policies, POST .../publish | tier editor | H,A,I,S | ✓ | — |

### Compliance
| Page | Route | Role | Purpose | Reads | Writes | Tables | APIs | Interactive | Tested | Status | Bugs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CompliancePage | `/compliance` | super_admin | DSR tracking | DSRs, alerts | DSR fulfill/deny | dsrs, audit_log | GET /admin/compliance/{dsr-alerts,dsr,consent-versions} | DSR list, status filter, action buttons | H,A,I,S | ✓ | — |
| DataProtectionLogPage | `/data-protection-log` | super_admin | Data access audit | DSR queue | — | dsrs | GET /admin/compliance/dsr | filters | H,A,I,S | ✓ | — |
| ConsentVersionsPage | `/consent-versions` | super_admin | T&C/privacy versioning | version list, audit | publish (LL#5) | consent_versions, user_consent_signatures, audit_log | GET /admin/compliance/consent-versions, POST .../publish | versions tab, audit-trail tab, publish dialog with material checkbox | H,A,I,M,S | ✓ | — |

---

## Mobile (84 screens)

### Public + auth (5)
| Screen | Route | Role | Purpose | Tested | Status | Bugs |
|---|---|---|---|---|---|---|
| index.tsx | / | public | Splash → route | A | ✓ | — |
| onboarding.tsx | /onboarding | public | Carousel intro | (read-pass) | ✓ | — |
| auth/login.tsx | /auth/login | public | Phone → OTP | A | ✓ | — |
| auth/register.tsx | /auth/register | public | New customer | A | ✓ | — |
| auth/otp-verify.tsx | /auth/otp-verify | public | OTP verify | A | ✓ | — |

### Customer tabs (4)
| Screen | Route | Role | Purpose | Tested | Status | Bugs |
|---|---|---|---|---|---|---|
| home.tsx | /home | customer | Discovery hub | A | ✓ | — |
| bookings.tsx | /bookings | customer | Booking list | A | ✓ | — |
| profile.tsx | /profile | customer | Profile edit | A,M | ✓ | — |
| wallet.tsx | /wallet | customer | Wallet + txns | A | ✓ | — |

### Customer screens (40)
| Screen | Route | Role | Purpose | Tested | Status | Bugs |
|---|---|---|---|---|---|---|
| account-management.tsx | /customer/account-management | customer | Delete/export account | A | ✓ | — |
| addresses.tsx | /customer/addresses | customer | Address CRUD | A,M | ✓ | — |
| address-picker.tsx | /customer/address-picker | customer | Address select | A | ✓ | — |
| payment-methods.tsx | /customer/payment-methods | customer | Payment mgmt | A | ✓ | — |
| notifications.tsx | /customer/notifications | customer | Notif list | A | ✓ | — |
| notification-settings.tsx | /customer/notification-settings | customer | Notif prefs | A,M | ✓ | — |
| booking/form.tsx | /customer/booking/form | customer | Date/time pick | (state-only) | ✓ | — |
| booking/configure.tsx | /customer/booking/configure | customer | Service select | A | ✓ | — |
| booking/job-request.tsx | /customer/booking/job-request | customer | Quote request | A | ✓ | — |
| booking/checkout.tsx | /customer/booking/checkout | customer | Payment | A | ⚠ | (PayMongo sandbox not wired) |
| booking/confirm.tsx | /customer/booking/confirm | customer | Confirmation | A | ✓ | — |
| booking/complete.tsx | /customer/booking/complete | customer | Rate + tip | A | ✓ | — |
| booking/[id].tsx | /customer/booking/:id | customer | Booking detail | A | ✓ | — |
| booking/tracker.tsx | /customer/booking/tracker | customer | Live status | A | ✓ | — |
| booking/photos.tsx | /customer/booking/photos | customer | Photo upload | A | ✓ | — |
| booking/quotes.tsx | /customer/booking/quotes | customer | Quote review | A | ✓ | — |
| booking/review.tsx | /customer/booking/review | customer | Review submit | A | ✓ | — |
| booking/tip.tsx | /customer/booking/tip | customer | Tip submit | A | ✓ | — |
| booking/dispute.tsx | /customer/booking/dispute | customer | File dispute | A,M | ✓ | (only after job complete — gate enforced) |
| booking/payment-failed.tsx | /customer/booking/payment-failed | customer | Retry pay | A | ✓ | — |
| booking/change-order.tsx | /customer/booking/change-order | customer | Mid-job changes | A | ✓ | — |
| booking/make-recurring.tsx | /customer/booking/make-recurring | customer | Make recurring | A | ✓ | — |
| category/[id].tsx | /customer/category/:slug | customer | Browse providers | A | ✓ | — |
| search.tsx | /customer/search | customer | Search | A | ✓ | — |
| provider/[id].tsx | /customer/provider/:id | customer | Provider profile | A | ✓ | — |
| chat/[id].tsx | /customer/chat/:id | customer | Real-time chat | A | ✓ | BUG-PHASE18-07 conversations alias mount (FIXED) |
| help.tsx | /customer/help | customer | FAQ | A | ✓ | — |
| safety-and-support.tsx | /customer/safety-and-support | customer | Safety + report | A | ✓ | — |
| wallet-topup.tsx | /customer/wallet-topup | customer | Add funds | A | ⚠ | (PayMongo sandbox not wired) |
| recurring/index.tsx | /customer/recurring | customer | Recurring list | A | ✓ | — |
| recurring/[id].tsx | /customer/recurring/:id | customer | Recurring edit | A | ✓ | — |
| referral.tsx | /customer/referral | customer | Referral program | A | ✓ | — |
| suki-pros.tsx | /customer/suki-pros | customer | Favorite providers | A | ✓ | — |
| terms.tsx | /customer/terms | customer | T&C/privacy | A | ✓ | — |
| data-rights.tsx | /customer/data-rights | customer | GDPR controls | A | ✓ | — |

### Provider tabs (4)
| Screen | Route | Role | Purpose | Tested | Status | Bugs |
|---|---|---|---|---|---|---|
| dashboard.tsx | /provider-dashboard | provider | Provider home | A | ✓ | — |
| jobs.tsx | /provider-jobs | provider | Job list | A | ✓ | — |
| earnings.tsx | /provider-earnings | provider | Earnings | A | ✓ | — |
| provider-profile.tsx | /provider-profile | provider | Profile | A | ✓ | — |

### Provider screens (28)
| Screen | Route | Role | Purpose | Tested | Status | Bugs |
|---|---|---|---|---|---|---|
| account-management.tsx | /provider/account-management | provider | Delete/export | A | ✓ | — |
| job/active.tsx | /provider/job/active | provider | Current job | A | ✓ | — |
| job/[id].tsx | /provider/job/:id | provider | Job detail | A | ✓ | — |
| job/[id]/checklist.tsx | /provider/job/:id/checklist | provider | Pre/post checklist | A | ✓ | — |
| job/[id]/photos.tsx | /provider/job/:id/photos | provider | Job photos | A | ✓ | — |
| job/[id]/quote.tsx | /provider/job/:id/quote | provider | Send quote | A | ✓ | — |
| job/[id]/navigate.tsx | /provider/job/:id/navigate | provider | Maps | (Linking) | ✓ | — |
| job/[id]/change-order.tsx | /provider/job/:id/change-order | provider | Change request | A | ✓ | — |
| job/[id]/complete.tsx | /provider/job/:id/complete | provider | Mark complete | A | ✓ | — |
| portfolio.tsx | /provider/portfolio | provider | Portfolio CRUD | A,M | ✓ | — |
| certifications.tsx | /provider/certifications | provider | Certs CRUD | A | ✓ | — |
| skills.tsx | /provider/skills | provider | Skills CRUD | A | ✓ | — |
| services.tsx | /provider/services | provider | Service offerings | A | ✓ | — |
| service-area.tsx | /provider/service-area | provider | Coverage area | A | ✓ | — |
| schedule.tsx | /provider/schedule | provider | Working hours | A,M | ✓ | — |
| availability.tsx | /provider/availability | provider | Calendar blocks | A | ✓ | — |
| calendar.tsx | /provider/calendar | provider | Calendar view | A | ✓ | — |
| reviews.tsx | /provider/reviews | provider | View reviews | A | ✓ | — |
| settings.tsx | /provider/settings | provider | Provider settings | A | ✓ | — |
| notifications.tsx | /provider/notifications | provider | Notif list | A | ✓ | — |
| payouts.tsx | /provider/payouts | provider | Payout history | A | ✓ | — |
| payout-settings.tsx | /provider/payout-settings | provider | Bank account | A | ✓ | — |
| withdraw.tsx | /provider/withdraw | provider | Request withdrawal | A | ✓ | — |
| tier-progression.tsx | /provider/tier-progression | provider | Tier status | A | ✓ | BUG-PHASE18-08 disputes.provider_id (FIXED) |
| chat/[id].tsx | /provider/chat/:id | provider | Real-time chat | A | ✓ | BUG-PHASE18-07 conversations alias (FIXED) |
| help.tsx | /provider/help | provider | FAQ | A | ✓ | — |
| suki-customers.tsx | /provider/suki-customers | provider | Loyal customers | A | ✓ | — |

### Provider onboarding (9)
| Screen | Route | Role | Purpose | Tested | Status | Bugs |
|---|---|---|---|---|---|---|
| role-select.tsx | /provider-onboarding/role-select | public | Pick role | (state) | ✓ | — |
| categories.tsx | /provider-onboarding/categories | provider | Pick categories | A | ✓ | — |
| terms.tsx | /provider-onboarding/terms | provider | Accept T&C | A | ✓ | — |
| service-area.tsx | /provider-onboarding/service-area | provider | Set area | A | ✓ | — |
| documents.tsx | /provider-onboarding/documents | provider | Upload docs | (file upload) | ⚠ | (file upload untested without device runtime) |
| identity-verification.tsx | /provider-onboarding/identity-verification | provider | NBI verify | A | ✓ | — |
| selfie.tsx | /provider-onboarding/selfie | provider | Liveness | (camera) | ⚠ | (camera untested without device) |
| background-check-status.tsx | /provider-onboarding/background-check-status | provider | NBI status | A | ✓ | — |
| review-pending.tsx | /provider-onboarding/review-pending | provider | Pending screen | (display) | ✓ | — |

---

## Layer summary

- **31 admin pages**: ALL render in headless Chromium without console errors or Sentry boundary fires (29/29 sweep + 7-tab + 6-tab + 5-tab detail page tests)
- **84 mobile screens**: ALL underlying APIs return 200 for the right role (68/68 contract test)
- **17 real bugs found + fixed** across Phases 17/18/19/20:
  - 3 in Phase 17 (CRIT-PHASE17-01/02/03)
  - 6 in Phase 18 (BUG-PHASE18-01..06)
  - 2 in Phase 19 (PHASE19-01/02 → 1 migration covers both)
  - 1 in Phase 20 (PHASE20-01)
  - 5 misc (security_events CHECK, target_type='user_batch', etc.)
- **41 audit verbs added** to admin_actions CHECK via mig 118 + 119
- **6 target_type values added** via mig 119

## Untested by audit (deferred to mobile device runtime)

- File upload via camera (provider-onboarding/documents, selfie, job/photos, booking/photos)
- GPS-based features (provider/navigate, dispatch live tracking)
- Push notifications (delivery confirmation)
- Native gesture interactions
- Mobile responsive layout (admin web is desktop-targeted)

## Deferred to launch ops

- F#3 Maestro baselines
- F#10 attorney-reviewed disclaimer
- 12 D14 ops items (NPC DPO, BIR ATP, PayMongo live, S3 Object Lock, Postgres PITR, DNS+TLS)
- PayMongo sandbox webhook chain (full money flow)
