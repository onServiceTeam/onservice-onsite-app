# Phase 18 master screen inventory

Source: two background Explore agents, 2026-05-03. Endpoint URLs in
this file are HYPOTHESES — many were inferred rather than read directly.
They are corrected during the runtime sweeps when 404/500s surface.

## Admin web — 31 page files / 29 routed pages

| Page | File | Route | Required role | Purpose |
|---|---|---|---|---|
| LoginPage | apps/admin/src/pages/LoginPage.tsx | /login | none | Email/password + optional 2FA |
| ChangePasswordPage | apps/admin/src/pages/ChangePasswordPage.tsx | /change-password | any admin | LL#12 force-rotation target |
| NotFoundPage | apps/admin/src/pages/NotFoundPage.tsx | * | any | Catch-all 404 |
| DashboardPage | apps/admin/src/pages/DashboardPage.tsx | / | admin/super_admin/dpo | KPIs, revenue, alerts |
| ProvidersPage | apps/admin/src/pages/ProvidersPage.tsx | /providers | admin/super_admin/dpo | List, approve/reject/suspend/tier |
| ProviderDetailPage | apps/admin/src/pages/ProviderDetailPage.tsx | /providers/:id | admin/super_admin/dpo | 360 view: profile/jobs/financials/reviews/disputes/activity/notes |
| CustomersPage | apps/admin/src/pages/CustomersPage.tsx | /customers | admin/super_admin/dpo | List + search |
| CustomerDetailPage | apps/admin/src/pages/CustomerDetailPage.tsx | /customers/:id | admin/super_admin/dpo | 360 view + status/credit actions |
| BookingsPage | apps/admin/src/pages/BookingsPage.tsx | /bookings | admin/super_admin/dpo | List, filter, search |
| BookingDetailPage | apps/admin/src/pages/BookingDetailPage.tsx | /bookings/:id | admin/super_admin/dpo | Overview/timeline/evidence/money/audit + super-admin actions |
| CatalogPage | apps/admin/src/pages/CatalogPage.tsx | /catalog | admin/super_admin/dpo | Categories/subcategories/addons CRUD |
| DisputesPage | apps/admin/src/pages/DisputesPage.tsx | /disputes | admin/super_admin/dpo | List + resolve + escalate |
| DisputeDetailPage | apps/admin/src/pages/DisputeDetailPage.tsx | /disputes/:id | admin/super_admin/dpo | Full dispute case |
| FinancialsPage | apps/admin/src/pages/FinancialsPage.tsx | /financials | admin/super_admin/dpo | Escrow, payouts, GMV, reconciliation, BIR |
| PayoutsPage | apps/admin/src/pages/PayoutsPage.tsx | /payouts | admin/super_admin/dpo | Approve/reject/complete |
| NotificationTemplatesPage | apps/admin/src/pages/NotificationTemplatesPage.tsx | /notification-templates | admin/super_admin/dpo | CRUD templates |
| RecurringPage | apps/admin/src/pages/RecurringPage.tsx | /recurring | admin/super_admin/dpo | List + cancel |
| BusinessAccountsPage | apps/admin/src/pages/BusinessAccountsPage.tsx | /business-accounts | admin/super_admin/dpo | Corporate accounts |
| ServiceAreasPage | apps/admin/src/pages/ServiceAreasPage.tsx | /service-areas | admin/super_admin/dpo | Coverage zones |
| AnalyticsPage | apps/admin/src/pages/AnalyticsPage.tsx | /analytics | admin/super_admin/dpo | Charts/exports |
| AuditLogPage | apps/admin/src/pages/AuditLogPage.tsx | /audit-log | admin/super_admin/dpo | Unified audit trail |
| SystemSettingsPage | apps/admin/src/pages/SystemSettingsPage.tsx | /settings | super_admin | Platform settings |
| CancellationPolicyPage | apps/admin/src/pages/settings/CancellationPolicyPage.tsx | /settings/cancellation-policy | super_admin | Cancellation tiers |
| SupportTicketsPage | apps/admin/src/pages/SupportTicketsPage.tsx | /support-tickets | admin/super_admin/dpo | Ticket queue |
| StaffRolesPage | apps/admin/src/pages/StaffRolesPage.tsx | /staff | super_admin | Admin user mgmt |
| PricingRulesPage | apps/admin/src/pages/PricingRulesPage.tsx | /pricing-rules | admin/super_admin/dpo | Dynamic pricing |
| MarketingPage | apps/admin/src/pages/MarketingPage.tsx | /marketing | admin/super_admin/dpo | Campaigns/promos |
| DispatchConsolePage | apps/admin/src/pages/DispatchConsolePage.tsx | /dispatch | admin/super_admin/dpo | Live ops monitor |
| CompliancePage | apps/admin/src/pages/CompliancePage.tsx | /compliance | super_admin | DSR/consent ops |
| DataProtectionLogPage | apps/admin/src/pages/DataProtectionLogPage.tsx | /data-protection-log | super_admin | Data access trail |
| ConsentVersionsPage | apps/admin/src/pages/ConsentVersionsPage.tsx | /consent-versions | super_admin | T&C/privacy versioning |

## Mobile — 84 screen files

### Public + auth
- index.tsx, onboarding.tsx
- auth/login.tsx, auth/register.tsx, auth/otp-verify.tsx

### Customer tabs (4)
- (tabs)/home.tsx, (tabs)/bookings.tsx, (tabs)/profile.tsx, (tabs)/wallet.tsx

### Customer screens (40)
- account-management, addresses, address-picker, payment-methods, notifications, notification-settings
- booking/{form,configure,job-request,checkout,confirm,complete,[id],tracker,photos,quotes,review,tip,dispute,payment-failed,change-order,make-recurring}
- category/[id], search, provider/[id]
- chat/[id], help, safety-and-support
- wallet-topup, recurring/index, recurring/[id], referral, suki-pros, terms, data-rights

### Provider tabs (4)
- (provider-tabs)/dashboard, jobs, earnings, provider-profile

### Provider screens (28)
- account-management
- job/active, job/[id], job/[id]/{checklist,photos,quote,navigate,change-order,complete}
- portfolio, certifications, skills, services, service-area, schedule, availability, calendar, reviews, settings, notifications
- payouts, payout-settings, withdraw, tier-progression
- chat/[id], help, suki-customers

### Provider onboarding (9)
- role-select, categories, terms, service-area, documents, identity-verification, selfie, background-check-status, review-pending

## Verification approach

- Admin: drive each route in headless Chromium, check console errors + screenshot + anchor text
- Mobile: hit each consumed API endpoint live; read each screen file for null/error/empty-state bugs
- Both: verify DB state after writes
