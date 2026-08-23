# Screen-by-screen UX, linkage, and responsive ledger

Date: 2026-08-23
Status: active audit, not a completion certificate
Scope: 103 routed mobile screens, 8 mobile layouts, 35 admin pages, shared services, and cross-role operating links

## How to read this ledger

This document exists to prevent a shared shell, a passing mount test, or an API inventory from being misreported as a screen-by-screen UX audit.

Responsive evidence:

- `W`: the screen contains explicit phone/tablet/desktop composition logic.
- `S`: the screen is protected by the shared responsive web shell and content-width constraints, but its internal composition still needs per-screen wide visual evidence.
- `N`: native/device-specific behavior means browser composition is secondary, but browser fallback still needs a deliberate state.
- `L`: routing or navigation layout, not a task screen.

Verification state:

- `SOURCE`: route, service imports, navigation, and existing tests were reconciled.
- `RENDER`: a real rendered-output test exists.
- `WIDE`: a dedicated wide-layout behavioral test exists.
- `LIVE`: browser evidence exists at the named viewport.
- `HOLD`: a documented money, legal, privacy, or architecture decision blocks behavior changes.

No row is considered UX-complete until its main task, empty/loading/error states, cross-role effect, and appropriate viewport behavior have evidence. Generic route-mount tests do not satisfy that bar.

## Cross-role linkage codes

| Code | Customer side | Provider side | Admin/company side |
| --- | --- | --- | --- |
| `IDENTITY` | registration, profile, consent | onboarding, vetting, team | people, staff, compliance, audit |
| `DISCOVERY` | home, category, search, provider profile | services, area, portfolio, reviews | catalog, service areas, provider eligibility, marketing |
| `BOOKING` | request, quotes, pay, active job | leads, quote, job execution | bookings, dispatch, communications |
| `MONEY` | checkout, wallet credit, receipt | earnings, payout, withdrawal | financials, payouts, pricing, reconciliation |
| `SUPPORT` | support inbox, safety, dispute | support inbox, help, dispute context | support queue, disputes, communication moderation |
| `RETENTION` | recurring, projects, Suki, referrals | clients, schedule, insights | recurring, projects, marketing, analytics |
| `GOVERNANCE` | terms, notification choices, data rights | standards, terms, account controls | compliance, consent, audit, settings |

## Mobile layout wrappers

| Layout | Role/purpose | Responsive state | Finding |
| --- | --- | --- | --- |
| `app/_layout.tsx` | global providers, auth hydration, app frame | L | Shared frame is not proof of inner-screen composition. |
| `app/(tabs)/_layout.tsx` | customer bottom tabs and desktop navigation handoff | L/W | Bottom tabs hide when the persistent desktop workspace is active. |
| `app/(provider-tabs)/_layout.tsx` | provider tabs and desktop navigation handoff | L/W | Provider owner navigation is role aware. |
| `app/auth/_layout.tsx` | public identity stack | L | Auth screens remain centered/constrained rather than task-dense. |
| `app/customer/_layout.tsx` | customer nested stack | L | Relies on global frame. |
| `app/provider/_layout.tsx` | provider nested stack | L | Relies on global frame. |
| `app/provider-onboarding/_layout.tsx` | provider application sequence | L | Needs step continuity checks across all ten screens. |
| `app/support/_layout.tsx` | shared customer/provider support stack | L | Correct shared ownership, but role-specific context must stay visible. |

## Entry, auth, and customer screens

| Route file | Linkage | Primary data/service | Responsive | Current evidence and next check |
| --- | --- | --- | --- | --- |
| `app/index.tsx` | IDENTITY | auth session | S | SOURCE/RENDER. Verify redirect state at phone/tablet/desktop. |
| `app/onboarding.tsx` | IDENTITY | local onboarding state | S | SOURCE/RENDER. Wide carousel composition pending. |
| `app/auth/login.tsx` | IDENTITY | auth store/API | S | SOURCE/RENDER. Constrained form is acceptable; live keyboard/error checks remain. |
| `app/auth/otp-verify.tsx` | IDENTITY | auth store/API | S | SOURCE/RENDER. OTP expiry/resend and wide focus order remain. |
| `app/auth/register.tsx` | IDENTITY/GOVERNANCE | auth API, terms | S | SOURCE/RENDER. Consent linkage exists; wide form check remains. |
| `app/(tabs)/home.tsx` | DISCOVERY/BOOKING | address, catalog, booking | W | SOURCE/RENDER/LIVE 820/1280. Stitch discovery hierarchy retained. |
| `app/(tabs)/bookings.tsx` | BOOKING | booking service | W | SOURCE/RENDER/LIVE shell. Two-column list exists; detailed wide state check remains. |
| `app/(tabs)/wallet.tsx` | MONEY | payment service | W/HOLD | SOURCE/RENDER. Customer credit must never expose provider withdrawal behavior. |
| `app/(tabs)/profile.tsx` | IDENTITY/GOVERNANCE | auth API | W | SOURCE/RENDER. Desktop sections use responsive spacing; route-link review remains. |
| `app/customer/account-management.tsx` | GOVERNANCE | data-management service | S/HOLD | SOURCE/RENDER. Destructive account actions need deliberate wide confirmation UI. |
| `app/customer/address-picker.tsx` | DISCOVERY/BOOKING | address + service-area services | W/N/HOLD | SOURCE/RENDER via Bugs UX-050/051. Search is limited to configured service areas, city wins over shared province, approximate city centers cannot masquerade as exact pins, barangay is required, coverage is checked, and browser geolocation is the honest no-map fallback. Third-party autocomplete/geocoding for booking another property in a browser remains D24. |
| `app/customer/addresses.tsx` | BOOKING | address + service-area services | W/HOLD | SOURCE/RENDER via Bug UX-054. CRUD states exist, desktop forms/lists are constrained, coordinate status is visible, and current-location capture writes verified coordinates. A saved address without coordinates stays visible but is not bookable; remote browser geocoding remains D24. |
| `app/customer/booking/[id].tsx` | BOOKING/SUPPORT/MONEY | booking, booking photos | W | SOURCE/RENDER/WIDE via Bug UX-019. Desktop summary/actions stay beside service context. Tablet visual check remains. |
| `app/customer/booking/change-order.tsx` | BOOKING/MONEY | booking, payment | S/HOLD | SOURCE/RENDER. Server contract exists; money wording and wide comparison need review. |
| `app/customer/booking/checkout.tsx` | MONEY/BOOKING | booking, payment | S/HOLD | SOURCE/RENDER. UX-052 prevents a coordinate-less/out-of-area booking from reaching this money step. E14 blocks the invalid PayMongo hosted flow. |
| `app/customer/booking/complete.tsx` | BOOKING/SUPPORT | booking API | S | SOURCE/RENDER. Confirmation, dispute, and review exits linked. Wide hierarchy pending. |
| `app/customer/booking/configure.tsx` | DISCOVERY/BOOKING | booking API | W | SOURCE/RENDER/WIDE via Bugs UX-043/046. Customer scope and pricing type survive discovery-to-booking linkage; the form is constrained for tablet/desktop reading. |
| `app/customer/booking/confirm.tsx` | BOOKING/MONEY | booking service | S | SOURCE/RENDER. Booking/pay/support exits linked; desktop summary pending. |
| `app/customer/booking/dispute.tsx` | SUPPORT/BOOKING | booking service | S/HOLD | SOURCE/RENDER. Provider response workflow is unresolved in E04. |
| `app/customer/booking/form.tsx` | BOOKING | local booking state | S | SOURCE/RENDER. Calendar/time wide composition pending. |
| `app/customer/booking/job-request.tsx` | BOOKING | booking service | W | SOURCE/RENDER/WIDE via Bugs UX-043/046. Quote/per-unit scope is retained from discovery and shown before request submission; the wide form is constrained for reading. |
| `app/customer/booking/make-recurring.tsx` | RETENTION/BOOKING | booking API | S | SOURCE/RENDER. Recurring-admin linkage exists; wide schedule preview pending. |
| `app/customer/booking/pay.tsx` | MONEY/BOOKING | booking, payment | S/HOLD | SOURCE/RENDER. Payment-failure and confirm exits linked. |
| `app/customer/booking/payment-failed.tsx` | MONEY/SUPPORT | booking + support services | W/HOLD | SOURCE/RENDER via Bug UX-055. Contact Support opens a prefilled payment case with booking and failure context instead of detouring through generic Help. The PayMongo recovery path remains E14. |
| `app/customer/booking/photos.tsx` | BOOKING/SUPPORT | booking photo/upload | S/N | SOURCE/RENDER. Device capture and browser upload fallback need evidence. |
| `app/customer/booking/quotes.tsx` | BOOKING/MONEY | booking quotes | W | SOURCE/RENDER/WIDE via Bugs UX-020/021. Tablet/desktop comparison grid and vector empty state added. |
| `app/customer/booking/review.tsx` | BOOKING/RETENTION | review service | S | SOURCE/RENDER. Provider/admin review linkage exists; wide form pending. |
| `app/customer/booking/tip.tsx` | MONEY/RETENTION | tip, payment, booking | S/HOLD | SOURCE/RENDER. Money path remains server canonical. Wide summary pending. |
| `app/customer/booking/tracker.tsx` | BOOKING/SUPPORT | booking, socket | W/N | SOURCE/RENDER/WIDE via Bug UX-027. Tablet/desktop map-and-status workspace preserves honest service-location behavior; no fake provider pin. Live authenticated customer visual evidence remains. |
| `app/customer/category/[id].tsx` | DISCOVERY | catalog service | W | SOURCE/RENDER via Bug UX-043. Responsive provider grid exists; every service has published scope or an honest pricing-aware fallback, and a confirmation step preserves the selected category/service context. Wide live visual evidence remains. |
| `app/customer/chat/[id].tsx` | BOOKING/SUPPORT | messaging, socket, upload | W | SOURCE/RENDER/WIDE via Bug UX-030. Booking status, schedule, location, details, and tracker exits stay beside the conversation. Live authenticated customer visual evidence remains. |
| `app/customer/data-rights.tsx` | GOVERNANCE | compliance service | S/HOLD | SOURCE/RENDER. Admin DSR linkage exists; identity/legal states must stay canonical. |
| `app/customer/help.tsx` | SUPPORT | support routes + static help | W | SOURCE/RENDER. Real support inbox and case creation are primary; displayed staffed hours now match the canonical 8 AM-6 PM PHT SOP. |
| `app/customer/notification-settings.tsx` | GOVERNANCE | API settings | S | SOURCE/RENDER. Admin template linkage exists; wide grouping pending. |
| `app/customer/notifications.tsx` | BOOKING/SUPPORT | notification service | S | SOURCE/RENDER. Booking deep links exist; wide inbox composition pending. |
| `app/customer/payment-methods.tsx` | MONEY | payment presentation | S/HOLD | SOURCE/RENDER. Saved-method behavior and live payment provider remain launch-sensitive. |
| `app/customer/projects/index.tsx` | RETENTION | project service | W | SOURCE/RENDER. Responsive list exists; admin Projects counterpart linked. |
| `app/customer/projects/new.tsx` | RETENTION/BOOKING | project service | S | SOURCE/RENDER. Desktop form and admin visibility pending. |
| `app/customer/projects/[id].tsx` | RETENTION/BOOKING | project service | S | SOURCE/RENDER. Project-to-booking timeline split pending. |
| `app/customer/provider/[id].tsx` | DISCOVERY/RETENTION | provider, review | S | SOURCE/RENDER/LIVE via Bugs UX-043/048/049. Admin provider and portfolio links exist; provider service cards use canonical catalog scope and fixed/hourly/per-unit/quote pricing before the correct booking path. UX-048 proves hourly booking uses the catalog hourly rate; UX-049 prevents a legacy base price from masquerading as a quote price. Wide profile layout remains. |
| `app/customer/recurring/index.tsx` | RETENTION | recurring API | W | SOURCE/RENDER. Responsive list exists; admin Recurring counterpart linked. |
| `app/customer/recurring/[id].tsx` | RETENTION/BOOKING | recurring API | S | SOURCE/RENDER. Edit/cancel implications and wide preview pending. |
| `app/customer/referral.tsx` | RETENTION | referral service | S | SOURCE/RENDER. Marketing/analytics counterpart exists; metric truth review pending. |
| `app/customer/safety-and-support.tsx` | SUPPORT/GOVERNANCE | support routes | W/HOLD | SOURCE/RENDER via Bug UX-065. Safety reporting opens a prefilled urgent case while 911 remains the immediate-danger path. Unresolved guarantee/legal wording stays on hold. |
| `app/customer/search.tsx` | DISCOVERY | catalog/search API | S | SOURCE/RENDER via Bug UX-046. Results retain category/service/scope/pricing context and hourly services no longer enter the custom-quote path. Wide filters remain. |
| `app/customer/suki-pros.tsx` | RETENTION/DISCOVERY | Suki service | S | SOURCE/RENDER. Provider loyalty counterpart exists; wide card grid pending. |
| `app/customer/terms.tsx` | GOVERNANCE | canonical legal content | S/HOLD | SOURCE/RENDER. Final disclaimer remains F#10. |
| `app/customer/wallet-topup.tsx` | MONEY | payment service | S/HOLD | SOURCE/RENDER. Production has 12 attempts and all remain awaiting; E14 confirms the constructed hosted URL is invalid and blocks implementation pending Checkout Session vs client-flow approval plus test keys. |

## Provider onboarding, owner, and staff screens

| Route file | Linkage | Primary data/service | Responsive | Current evidence and next check |
| --- | --- | --- | --- | --- |
| `app/provider-onboarding/role-select.tsx` | IDENTITY | auth API | S | SOURCE/RENDER. Sequence continuity pending. |
| `app/provider-onboarding/categories.tsx` | IDENTITY/DISCOVERY | catalog service | W | SOURCE/RENDER. Responsive category grid exists. |
| `app/provider-onboarding/service-area.tsx` | IDENTITY/DISCOVERY | onboarding state | S | SOURCE/RENDER. Admin service-area linkage needs visual explanation. |
| `app/provider-onboarding/documents.tsx` | IDENTITY/GOVERNANCE | upload service | S/N | SOURCE/RENDER. Device capture and document-state evidence pending. |
| `app/provider-onboarding/identity-verification.tsx` | IDENTITY/GOVERNANCE | verification flow | S/HOLD | SOURCE/RENDER. Must follow approved identity vendor/contract. |
| `app/provider-onboarding/selfie.tsx` | IDENTITY/GOVERNANCE | upload/camera | S/N | SOURCE/RENDER. Real camera evidence remains F#3/device work. |
| `app/provider-onboarding/vetting.tsx` | IDENTITY/GOVERNANCE | onboarding answers | S | SOURCE/RENDER. Stitch step/status hierarchy should be applied. |
| `app/provider-onboarding/terms.tsx` | GOVERNANCE | auth/provider API | S/HOLD | SOURCE/RENDER. Legal text remains canonical. |
| `app/provider-onboarding/background-check-status.tsx` | IDENTITY/GOVERNANCE | provider API | S | SOURCE/RENDER. Admin provider-review counterpart exists. |
| `app/provider-onboarding/review-pending.tsx` | IDENTITY | provider API | S | SOURCE/RENDER. Status and support exit need wide check. |
| `app/(provider-tabs)/dashboard.tsx` | BOOKING/RETENTION | provider, booking | W | SOURCE/RENDER/LIVE 820/1280. Tablet fills the viewport; desktop uses the provider operations rail. |
| `app/(provider-tabs)/jobs.tsx` | BOOKING | provider bookings | W | SOURCE/RENDER. Two-column list exists; 768/1024/1280 visual evidence pending. |
| `app/(provider-tabs)/earnings.tsx` | MONEY | payment/API | W/HOLD | SOURCE/RENDER. Wide stat composition exists; financial labels need source/freshness review. |
| `app/(provider-tabs)/provider-profile.tsx` | IDENTITY/DISCOVERY | provider API | S | SOURCE/RENDER. Stitch portfolio/profile hierarchy pending. |
| `app/provider/account-management.tsx` | GOVERNANCE | data-management | S/HOLD | SOURCE/RENDER. Destructive action confirmation and wide layout pending. |
| `app/provider/availability.tsx` | RETENTION/BOOKING | provider API | W | SOURCE/RENDER/WIDE via Bugs UX-083/085/087/088. Tablet/desktop separates current controls from date overrides; the form validates exact HH:MM windows before submit and server detail messages survive the generic envelope. Live wide evidence pending. |
| `app/provider/calendar.tsx` | RETENTION/BOOKING | provider API | W | SOURCE/RENDER/WIDE/LIVE 820/1280 via Bug UX-029. Month grid and selected-day schedule are side by side without overflow; live QA caught and fixed the panel flex-basis collapse. |
| `app/provider/certifications.tsx` | IDENTITY/DISCOVERY | provider, upload | W/N | SOURCE/RENDER/WIDE/LIVE 768/1366 via Bugs UX-091-098/100-104. Real calendar dates are normalized and validated, browser upload uses the file picker and a fetch-generated multipart boundary, raw DOM date inputs keep a 48 px target and stack before their values truncate, existing private documents use an on-file state instead of exposing their path, replacement-photo state cannot leak between credentials, every provider edit resets verification, and tablet/desktop uses a bounded certification-and-form workspace. Native camera evidence remains F#3/device work. |
| `app/provider/chat/[id].tsx` | BOOKING/SUPPORT | messaging, socket, upload | W | SOURCE/RENDER/WIDE/LIVE 820/1280 via Bugs UX-031/032. Customer/job context stays beside the thread, and support-record guidance is visible without overflow. |
| `app/provider/clients.tsx` | RETENTION | provider CRM | W | SOURCE/RENDER. Two-column list exists; wide spacing/visual evidence pending. |
| `app/provider/clients/[id].tsx` | RETENTION/BOOKING | provider CRM | S | SOURCE/RENDER. Client history/detail split pending. |
| `app/provider/help.tsx` | SUPPORT | support/help links | W | SOURCE/RENDER. Shared support inbox/case workflow is linked and displayed staffed hours match the canonical 8 AM-6 PM PHT SOP. |
| `app/provider/insights.tsx` | RETENTION | provider CRM | S | SOURCE/RENDER. Metric definitions/source/freshness are required. |
| `app/provider/job/[id].tsx` | BOOKING/SUPPORT | booking, provider | W | SOURCE/RENDER/WIDE/LIVE 820/1280 via Bugs UX-028/075/079. Job record keeps canonical earnings and execution actions in a persistent side rail, sends every browser/native direction entry to the real navigation workspace, supports address-only destinations, and opens that workspace after a successful Start Navigation transition. |
| `app/provider/job/[id]/change-order.tsx` | BOOKING/MONEY | booking API | S/HOLD | SOURCE/RENDER. Customer approval/admin money linkage exists. |
| `app/provider/job/[id]/checklist.tsx` | BOOKING/SUPPORT | booking photos/API | S/HOLD | SOURCE/RENDER. `Report Issue` remains E05; do not invent endpoint. |
| `app/provider/job/[id]/complete.tsx` | BOOKING/MONEY | booking, photos | S | SOURCE/RENDER. Completion/customer confirmation/admin booking link exists. |
| `app/provider/job/[id]/navigate.tsx` | BOOKING | booking, provider | W/N | SOURCE/RENDER/WIDE/BROWSER 768/1280 via Bugs UX-075/076/079. The real job flow now reaches this bounded directions workspace; Google Maps/Waze actions require a loaded address or coordinates, and arrival remains disabled without server-verifiable job coordinates. No fake map or ETA. |
| `app/provider/job/[id]/photos.tsx` | BOOKING/SUPPORT | booking photos | S/N | SOURCE/RENDER. Device capture/browser upload evidence pending. |
| `app/provider/job/[id]/quote.tsx` | BOOKING/MONEY | booking, CRM templates | S | SOURCE/RENDER. Customer quotes/admin booking counterpart linked. Wide builder pending. |
| `app/provider/job/active.tsx` | BOOKING/SUPPORT | booking, provider staff | S | SOURCE/RENDER via Bug UX-078. Its address-only browser directions control now reaches the canonical navigation workspace; broader Stitch evidence/checklist hierarchy remains open. |
| `app/provider/leads.tsx` | BOOKING | booking API/socket | W | SOURCE/RENDER. Responsive lead grid exists. |
| `app/provider/notifications.tsx` | BOOKING/SUPPORT | notification service | S | SOURCE/RENDER. Deep-link correctness and wide inbox pending. |
| `app/provider/payout-settings.tsx` | MONEY | API | W/HOLD | SOURCE/RENDER via Bugs UX-069-072. Launch mode is truthfully manual-only, legacy non-manual preferences are preserved and identified as inactive, saved rails use canonical destination validation, and the desktop/tablet workspace is bounded. A full automatic engine remains deferred under launch limitation 38. |
| `app/provider/payouts.tsx` | MONEY | payout API | S/HOLD | SOURCE/RENDER. Admin Payouts counterpart linked; wide ledger pending. |
| `app/provider/portfolio.tsx` | DISCOVERY/RETENTION | provider, upload | S/N | SOURCE/RENDER. Stitch before/after hierarchy pending. |
| `app/provider/quote-templates.tsx` | BOOKING/RETENTION | provider CRM | S | SOURCE/RENDER. Desktop template editor pending. |
| `app/provider/reminders.tsx` | RETENTION | provider CRM | S | SOURCE/RENDER. Client/job linkage and wide list pending. |
| `app/provider/reviews.tsx` | DISCOVERY/RETENTION | provider/review API | S | SOURCE/RENDER. Customer review/admin moderation linkage exists. |
| `app/provider/schedule.tsx` | RETENTION/BOOKING | provider schedule | W | SOURCE/RENDER/WIDE/LIVE 820/1280 via Bugs UX-022/077/084/086. Seven-day grid and desktop operations rail verified without overflow; a load failure locks editing, database TIME values serialize to editable HH:MM, and impossible/reversed server ranges are rejected. |
| `app/provider/service-area.tsx` | DISCOVERY/BOOKING | provider/API | S | SOURCE/RENDER. Admin market controls counterpart exists. |
| `app/provider/services.tsx` | DISCOVERY/BOOKING | catalog, provider | S/HOLD | SOURCE/RENDER. E16 proves fixed provider-price display conflicts with the catalog price persisted on bookings; service price/edit behavior is paused pending the price-source decision. Wide editor remains pending. |
| `app/provider/settings.tsx` | GOVERNANCE | push service | S | SOURCE/RENDER. Notification/account routes need grouped wide settings. |
| `app/provider/skills.tsx` | DISCOVERY | local/service linkage | S | SOURCE/RENDER. Must stay consistent with Services and admin Catalog. |
| `app/provider/standards.tsx` | GOVERNANCE | canonical content | S/HOLD | SOURCE/RENDER. Policy language cannot be invented from Stitch. |
| `app/provider/suki-customers.tsx` | RETENTION | Suki service | S | SOURCE/RENDER. Customer Suki counterpart linked; wide list pending. |
| `app/provider/team.tsx` | IDENTITY/BOOKING | provider staff | W | SOURCE/RENDER/WIDE via Bugs UX-080/081/082/089. Provider invites normalize and bound PH phone/email/role values on both client and route, explain in-app discovery honestly, and split invite/member work on wide screens. Staff assignment and admin review linkage remains intact. |
| `app/provider/tier-progression.tsx` | RETENTION/DISCOVERY | provider API | S | SOURCE/RENDER. Tier rules and admin provider actions linked. |
| `app/provider/withdraw.tsx` | MONEY | payment/API | S/HOLD | SOURCE/RENDER via Bug UX-074. Provider-only manual withdrawal now prefills saved method/account while keeping them editable; admin Payouts counterpart is linked. Wide layout verification remains. |
| `app/staff/invites.tsx` | IDENTITY/BOOKING | provider staff | W | SOURCE/RENDER/WIDE via Bugs UX-089/090. D23's customer-profile and desktop-rail discovery path is restored before role conversion; acceptance remains contact-matched and the wide invitation grid is bounded. |
| `app/staff/jobs.tsx` | BOOKING | provider staff | S | SOURCE/RENDER. Desktop scoped job list pending. |
| `app/staff/job/[id].tsx` | BOOKING/SUPPORT | booking, provider | S | SOURCE/RENDER. Must not expose provider-owner controls. |
| `app/support/index.tsx` | SUPPORT | support service | W | SOURCE/RENDER/WIDE via Bug UX-062. Shared customer/provider inbox uses a bounded desktop workspace and two-column case grid. |
| `app/support/new.tsx` | SUPPORT | support service | W | SOURCE/RENDER/WIDE via Bugs UX-055/062/064/065. Booking, type, priority, subject, and description context survive entry; the server verifies booking ownership. |
| `app/support/[id].tsx` | SUPPORT | support service | W | SOURCE/RENDER/WIDE via Bugs UX-058/062. Desktop conversation width is bounded, send failures are visible, user replies reactivate waiting cases, and terminal cases remain read-only. |

## Admin pages, company purpose, and suspicion-first status

Every admin page below is reopened for first-principles review. `Existing` means code and tests exist, not that the workflow is accepted.

| Route/page | Company operator purpose | User-side counterpart | Stitch reference | Current status |
| --- | --- | --- | --- | --- |
| `/login` Login | secure staff entry and 2FA | none | design system | RENDER/LIVE 390/820/1280 via UX-026; responsive company context and 44 px controls added |
| `/change-password` | forced credential rotation | none | governance | Existing; focused workflow |
| `/` Dashboard | queue-first command center | all lifecycle events | admin command center | Reworked; metric definitions/freshness still open |
| `/analytics` | demand, quality, retention, growth decisions | discovery/booking/retention | command/growth | Existing; definitions and unsafe A/B prompts open |
| `/providers` | vetting, availability, risk, status | provider onboarding/profile | trust and safety | Existing; queue ownership and saved views open |
| `/providers/:id` | provider 360 case record | provider profile/team/jobs/money/certifications | case workspace | Team review decisions use a reasoned in-page workflow. Bug UX-099 adds provider-scoped certification evidence, secure private-document access, verification eligibility, and required rationale when verification is removed. Certification baselines pass at 1280/1440/1920. Linked chronology remains open. |
| `/customers` | account/support/risk queue | customer account | command center | Existing; saved views/entity search open |
| `/customers/:id` | customer 360 case record | profile/bookings/wallet/support | case workspace | Existing; action consistency and chronology open |
| `/bookings` | fulfilment and exception queue | customer bookings/provider jobs | command center | Existing; queue ownership/saved views open |
| `/bookings/:id` | unified booking case, evidence, money, audit | booking detail/job execution | case workspace | Reworked in prior batch; destructive preview consistency open |
| `/dispatch` | live assignment and exception response | tracker/provider jobs | command center | Existing; map/live-state honesty and operator density open |
| `/catalog` | taxonomy, intake, price model | discovery/request/provider services | catalog config | Reworked via Bugs UX-044/045/047. Production-derived scope counts, missing-scope queue, exact customer preview, visible incomplete state, 30-character active-service API gate, and read-only ordinary-admin inspection now align company publishing with customer discovery. The business still must author all 29 production scopes. Seven visual states pass at 1280/1440/1920. |
| `/projects` | recurring/multi-job oversight | customer projects/provider jobs | operations | Existing; lifecycle ownership open |
| `/recurring` | recurring work exceptions | customer recurring/provider calendar | operations | Existing; case linkage open |
| `/service-areas` | market launch, capacity, coverage | address/search/provider area | catalog config | Existing; impact preview and safe activation open |
| `/disputes` | trust queue and assignment | customer dispute/provider context | trust and safety | Existing; SLA model absent, do not invent countdowns |
| `/disputes/:id` | evidence, messages, decision record | customer dispute/provider response | case workspace | Reworked partly; provider response remains E04 |
| `/support-tickets` | triage, owner, public/internal conversation | shared support routes | case workspace | W via Bugs UX-056-063. Search, booking/account filters, deep-linked cases, correct customer/provider identity, named owner, account/booking reverse links, and audited create-on-behalf intake are wired. SLA clocks remain deliberately absent. |
| `/communications` | reported-message moderation | customer/provider chat | trust and safety | Reworked via Bugs UX-033 through UX-036. Opens on the review queue, preserves the exact reported-message focus, links booking/customer/provider case records, and requires an audit rationale before clearing a report. Populated/loading/empty/error visual baselines pass at 1280/1440/1920. Global record search remains open. |
| `/feedback` | own and triage third-party product research | customer/provider/admin feedback form | case workspace | Added via Bugs UX-037 through UX-041. Defaults to new, filters by app area, preserves original evidence, masks contact/free-text PII for ordinary admins, and requires a named owner plus audited note for triaged/done work. Populated/loading/empty/error baselines pass at 1280/1440/1920. |
| `/financials` | reconciliation, escrow, tax, receipt control | customer pay/provider earnings | payout/command | W via Bug UX-073. Manual withdrawal operations are explicit and the fake Upcoming Scheduled KPI is removed; money actions remain server-authoritative. |
| `/payouts` | provider disbursement queue | provider payouts/withdrawal | payout management | Existing; batch preview/dual-control decision open |
| `/pricing-rules` | canonical price policy | booking configure/quotes | catalog config | Existing; customer impact preview open |
| `/settings/cancellation-policy` | approved policy display/editor | cancellation UI | governance | HOLD E09 due server/display contradiction |
| `/business-accounts` | business onboarding and account queue | business booking/billing | people/operations | Existing; ownership and saved views open |
| `/business-accounts/:id` | business 360, members, contracts, invoices | customer/business surfaces | case workspace | Manager uses named active staff; invoice mark-paid uses an auditable in-page dialog |
| `/marketing` | campaign and promotion operations | home/referral/notifications | growth ops | Existing; metric/source truth and budget controls open |
| `/notification-templates` | lifecycle content governance | customer/provider notifications | growth ops | Existing; preview/versioning/approval open |
| `/compliance` | NPC/BIR operating workspace | terms/data rights | compliance | Existing; only DPO/super-admin authority is accepted |
| `/data-protection-log` | DSR/deletion/export queue | data rights/account management | data privacy | Existing; identity verification and deadline evidence open |
| `/consent-versions` | legal content publication and signatures | terms/registration | data privacy | HOLD final legal wording where applicable |
| `/audit-log` | immutable governance and incident history | all actions | audit log | Existing; global entity correlation/export review open |
| `/staff` | staff access and role administration | none | governance | HOLD fine-grained authorization architecture; raw user-ID add flow is a defect |
| `/settings` | platform configuration with audit reasons | all runtime behavior | governance | Existing; change impact/restart/rollback presentation open |
| `*` Not Found | safe recovery | none | design system | Existing |

## Immediate findings generated by this ledger

1. Only 21 of 103 routed mobile screens currently have explicit internal responsive logic after this batch. The other 82 are shell-constrained and require task-specific wide review; this is not recorded as completion.
2. The next high-use desktop gaps are customer projects/notifications and provider earnings/client detail/quote builder, followed by the remaining shell-only settings and onboarding forms.
3. Admin still contains raw user-ID entry in staff access and dozens of generic browser-confirm operations across staff, analytics, catalog, money, compliance, and settings workflows. Confirmation itself is valid, but high-impact actions need consistent context, impact preview, reasons, and audit evidence rather than a generic browser prompt.
4. The admin shell and support/booking/dispute improvements are foundations. They do not make every page a coherent case workspace.
5. Fine-grained staff permissions, cancellation math, provider dispute response, checklist issue reporting, legal disclaimer text, and milestone escrow remain explicit holds. Visual work cannot silently decide them.
6. Production tester feedback was operationally orphaned: 10 submissions remained `new` because no employee queue, owner, decision note, or dismissal path existed. The new Tester Feedback workspace closes that company-process gap; the underlying screen reports still require individual current-code verification.
7. Provider automatic-payout controls were storage-only and two production providers had inactive non-manual preferences. E15 resolved launch posture to honest manual withdrawals without changing those production rows; a complete automatic engine remains a future finance/product decision.
8. Provider navigation had two browser-dead callers, an unreachable directions screen, and actions that were usable without a loaded destination. Bugs UX-075/076/078/079 connect the real job flow and successful en-route transition to one guarded external-navigation workspace without inventing a map or ETA. Bug UX-077 prevents schedule defaults from overwriting real hours after a load failure.

## Completion rule for future updates

When a row is advanced, record the exact test or browser evidence and the viewport. Do not change `S` to `W` merely because the shared shell prevented horizontal overflow. Do not mark a money or legal row complete until the matching server contract and decision record are resolved.
