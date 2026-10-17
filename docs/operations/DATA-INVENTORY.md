# Personal data inventory

Written 2026-10-14 as part of adopting the engineering standard (D40, standard
section O, backlog item BL-02). It describes master `8d319a18`, which is what
runs on the live tester server.

**What this is.** Engineering facts: what personal data the product stores,
where, who can see it, and what the code does today to delete or export it.
It is the input the DPO and the attorney need for the retention matrix (E21)
and a privacy impact assessment.

**What this is not.** It is not legal advice, and it is not reviewed by the
DPO or an attorney. It does not set any retention period. Where this file says
"kept", it means the code has no step that removes the data. It does not mean
keeping it is allowed or required. No retention period has been approved
(E21).

Table and folder names come from `packages/api/migrations/` and
`packages/api/src/`. Facts were read from the code on 2026-10-14. Live row
counts were not read. Re-checked on 2026-10-17 for public safety: server
detail that would help an attacker is in the private records (not in the
repo), with a pointer left here. The backup wording was shortened again that
evening, to match INTEGRATIONS.md.

## 1. Where personal data lives

| Place | What is there | Notes |
|---|---|---|
| Main database (PostgreSQL) on the tester server | Almost everything in section 2 | One rented server, shared with other businesses' apps. The hosting country is not recorded in the repo. |
| Uploads volume on the same server, public area | Booking and completion photos, signatures, dispute evidence, review and portfolio photos, chat photos sent before APK 1.0.4 | No cloud storage is used: production settings force local disk (`docker-compose.prod.yml`, `S3_BUCKET: ""`). The web server serves this area to anyone who has a link. Each link contains a random id, so it cannot be guessed, but it can be shared (repair item R-ACC-12). |
| Uploads volume, private folders | `onboarding/` (provider ID documents), `private-artifacts/` (data exports, request and chat media, project documents), `feedback/` (tester screenshots) | The API reads these files only through signed-in routes or short-lived signed links. The web server blocks direct access to the ID-document and private-artifact folders. For tester screenshots, the extra web-server rule (the UX-860 fix) is in the repo but not applied on live yet, because the live web server still runs its 2026-08-24 configuration (`LAUNCH-LIMITATIONS.md` sections 126 and 132). Until then the screenshots are protected another way, recorded in `LAUNCH-LIMITATIONS.md` section 60, and an outside check on 2026-10-12 found a screenshot address refused. It was not re-checked for this file. Details are in the private records (not in the repo). |
| Redis | Short-lived cached API answers (some are per signed-in user), rate-limit counters, background job data | Copies only. They expire on timers. Account deletion does not clear them. |
| Server logs | API logs, with phone numbers, emails, TINs and similar masked by the logger (`docs/SECURITY-POSTURE.md` SEC-005). Web server access logs, which hold IP addresses. | No log rotation or retention is set in `docker-compose.prod.yml`. Settings on the server itself were not checked. |
| Backups on the server | Each backup set holds a full database dump and a full copy of the uploads volume (`docs/runbooks/postgres-restore.md`) | The backup script deletes sets older than 14 days, when its retention step runs. Whether the nightly schedule is installed was not checked. Recovery from losing the whole server is not proven and alerts do not reach a person yet (BL-10, BL-11); details in the private records (not in the repo). Extra backups taken before each release are kept on the server for rollback (`LAUNCH-LIMITATIONS.md` section 126). |
| Phones | Android: sign-in tokens and the user record in encrypted storage, cleared at sign-out (`apps/mobile/src/services/secure-storage.ts`). Feedback drafts. | |
| Browsers | Web app: sign-in tokens and the user record in browser local storage, not encrypted (`secure-storage.web.ts`) | |
| Outside services | Only when switched on. See `INTEGRATIONS.md`. One hand-off works today with no switch: when a provider taps for directions, the app opens Google Maps or Waze with the job's coordinates, or the address text when there are no coordinates (`apps/mobile/app/provider/job/[id]/navigate.tsx`). | |
| Ken's computer and AI coding sessions | Private tester feedback bundles made by the pull script (`LAUNCH-LIMITATIONS.md` section 130), analysed in AI coding sessions | The tester notice says AI tools help sort what testers send (`legal/feedback.html`). |

## 2. Categories of personal data

Roles referred to below are the account roles in
`packages/api/src/types/user.types.ts`: customer, provider, provider team
member (`provider_staff`), admin, super admin and DPO.

| # | Category | Where (tables and folders) | Who can see it | What the code does today |
|---|---|---|---|---|
| 1 | Accounts and sign-in: name, phone, email, role, photo, sign-in codes, sessions, devices for push | `users`, `refresh_tokens`, `otp_codes`, `email_code_challenges`, `email_sign_in_challenges`, `email_link_challenges`, `sign_in_email_identities`, `push_tokens`, `notification_preferences` | The person. Admin detail pages mask phone and email for everyone except super admins, with a Reveal button that is logged (D25; `customer-admin.service.ts:339` and the provider, booking and staff equivalents). Gap: the admin provider list and dispute detail still show full values (R-ACC-08). | Account deletion (section 3) replaces the name with "Deleted User", sets a random phone and email, and removes the photo. It deletes refresh tokens, push tokens and the email sign-in records (`email_code_challenges`, `email_sign_in_challenges`, `email_link_challenges`, `sign_in_email_identities`). It does not touch `otp_codes` (the real phone number and a hash of each phone sign-in code) or `notification_preferences` (`anonymizeUser` in `data-management.service.ts`). No job or code path removes `otp_codes` rows, so the original phone number stays in the database after deletion. Finished email sign-in code records are deleted after 90 days by a job that runs every 5 minutes (`platform.config.ts`, `jobs/workers.ts`). |
| 2 | Addresses and location | `user_addresses` (saved addresses with coordinates), `bookings` (job address and coordinates), `providers` and `provider_service_areas` (provider base and areas), `area_waitlist` (name, phone, email and location of people outside service areas) | The person. Invited or assigned providers see job details. Admins. | Saved addresses are deleted at account deletion. Job addresses on bookings are kept (`LAUNCH-LIMITATIONS.md` section 45). No step removes waitlist rows. |
| 3 | Job requests and bookings: descriptions, answers to intake questions, budget, job time, quotes, change orders, checklists | `bookings` (`description`, `intake_answers`, `budget_min`, `budget_max`), `booking_quotes`, `quote_line_items`, `booking_offers`, `job_request_invites`, `change_orders`, `change_order_line_items`, `booking_checklists`, `booking_checklist_items`, `recurring_bookings`, `recurring_instances`, `projects`, `project_documents` | The customer, invited or assigned providers, admins | Kept. Not changed by account deletion. |
| 4 | Request and chat media from APK 1.0.4 on: photos, videos, voice notes | `job_media` table; files in `private-artifacts/job-media/` | The customer and the providers allowed on that request or thread, through signed links that last 10 minutes. A provider who loses the request is cut off within a minute. Admin views are logged (`job_media_viewed`). | Unattached uploads are removed after 24 hours and stray temporary files after 48 hours. Account deletion marks the person's media deleted, and the clean-up job then removes the files (`job-media.config.ts`; `data-management.service.ts`). |
| 5 | Booking photos, signatures, dispute evidence, review and portfolio photos, older chat photos | `booking_photos`, `booking_images`, `booking_signatures`, `dispute_evidence`, `review_images`, `provider_portfolios`, `bookings.job_photos`; files in the public upload area | Anyone who has the link (R-ACC-12). In the apps: booking participants and admins. | Kept. The files are not removed at account deletion (section 45). |
| 6 | Chat and request threads | `conversations`, `messages` | The people in the conversation. Admins through the moderation pages. | At account deletion the person's sent message text becomes "[deleted]". Older chat photos remain (section 45). |
| 7 | Reviews | `reviews`, `review_images` | Public review text inside the app; admins | At account deletion the person's review comments are emptied. Photos remain. |
| 8 | Support and disputes | `support_tickets`, `support_ticket_messages`, `disputes`, `dispute_messages`, `dispute_evidence` | The people involved; admins | Kept (section 45). |
| 9 | Payments, wallet and money records | `wallets`, `wallet_transactions`, `payment_intents`, `payouts` (including the provider's payout account), `tips`, `booking_financial_terms`, `webhook_events`, `gateway_retry_queue`, `reconciliation_snapshots`, `official_receipts`, `vat_monthly_reports`, `business_invoices` and related tables | The person for their own wallet; admin finance pages. A full map of which admin role may see which money record is not done (`docs/SECURITY-POSTURE.md` SEC-008). | Kept. Customer card and e-wallet details are not collected today, because external payments are held (E14). Provider payout accounts (GCash, Maya or bank) are collected and stored (`providers.payout_destination_account`, `payouts.destination_account`). Tax and financial retention needs the attorney and accountant (E21, E22). |
| 10 | Provider identity checks (KYC): government ID images, selfie, NBI clearance, ID number, TIN, certifications, application drafts and history | `providers` (`government_id_number`, `tin`, `nbi_clearance_url`, `nbi_expiry_date`, payout preferences), `provider_documents`, `provider_certifications`, `provider_application_drafts`, `provider_application_revisions`, `provider_application_decisions`, `provider_admin_notes`; files in `onboarding/` | The provider. Admins, through the signed-in document route only (`docs/SECURITY-POSTURE.md` SEC-004). | Application drafts expire 30 days after they were last saved and are then deleted (`provider-application-draft.service.ts`). At account deletion the business name and description are cleared, the NBI link field is emptied and the provider is deactivated. The ID number, TIN and the document files remain (section 45). |
| 11 | Provider team members | `provider_staff` and related tables | The provider who owns the team; admins (masked as in row 1) | Kept. |
| 12 | Security and activity records | `audit_log`, `admin_actions` (including contact reveals and media views), `security_events` (IP, device), `login_attempts` (phone, IP), `blocked_ips`, `device_fingerprints` (device id, last IP), `platform_settings_audit`, `breach_log` | Admins and super admins, with different masking per screen. The routes below admit only those two roles. Customer and provider activity tabs: IP addresses and device details are masked for admins and raw for super admins (`customer-admin.service.ts`, `provider-admin.service.ts`). General audit log (`/audit-log`): masked for every role, super admin included. Security Events and Blocked IPs lists: raw IP addresses and device fingerprints for any admin or super admin (`admin.routes.ts` `/security-events`, `/blocked-ips`). The DPO opens the breach log through DPO-only routes (`breach-log.routes.ts`). The shared helper `maskPiiForRole` (`packages/api/src/utils/pii-mask.ts`) is written to show a DPO raw IP addresses, but its only caller passes a fixed role that masks everything. | Sign-in attempts older than 90 days are deleted by a clean-up that runs once a month (`jobs/workers.ts`, `security-cleanup`). Nothing removes the others. Account deletion does not remove device records or security events. |
| 13 | Notifications | `notifications`, `push_retry_queue` | The person; admins | Kept. |
| 14 | Tester feedback | `feedback_sessions`, `feedback_entries`, `feedback_uploads` (version 2), `feedback_submissions` (version 1); screenshots in `feedback/`, with photo metadata removed | Admins on the Tester Feedback page; a key-protected export for the pull script | Screenshots never attached to an answer become eligible for removal after 24 hours, but the clean-up that removes them runs once a month, up to 200 per run (`jobs/workers.ts`, `security-cleanup`). So they can stay for about a month, although `LAUNCH-LIMITATIONS.md` section 130 says 24 hours. An admin can erase one tester's session and screenshots (`feedback-study-admin.service.ts` `eraseSession`). Copies already pulled to Ken's computer have no deletion procedure. Retention is Ken's open feedback-v2 decision D2 (`LAUNCH-LIMITATIONS.md` section 130). |
| 15 | Data rights and consent records | `data_subject_requests`, `data_export_requests`, `account_deletion_requests`, `consent_records`; export files in `private-artifacts/` | The person; the DPO and super admins handle requests (`docs/operations/10-money-and-compliance-ops.md` section 8.1) | Export files expire 7 days after they are made, and a job every 10 minutes then deletes the file (`data-management.service.ts` `expireOldExports`). The request records are kept. |
| 16 | Promotions and referrals | `referral_codes`, `referral_redemptions`, `promo_redemptions`, `suki_memberships`, `suki_rewards`, `marketing_campaigns`, `ab_test_assignments`, `booking_slot_waitlist` | The person; admins | Kept. |

## 3. Data rights: export, correction and deletion

There are two ways in, and they do not meet (E43, open).

1. **Data Rights screen** in the app (`apps/mobile/app/customer/data-rights.tsx`).
   A customer asks to download, correct or delete. Each request becomes a
   `data_subject_requests` row in the DPO queue, with a 15-day internal
   response target. E40 forbids calling that target a legal deadline until
   counsel approves the wording. The DPO works the queue in the admin Privacy
   Workspace and Data Protection Log (`docs/operations/10-money-and-compliance-ops.md`
   section 8.1). Closing a request does not itself change any data.
2. **Account management screens** for customers and providers
   (`apps/mobile/app/customer/account-management.tsx`,
   `apps/mobile/app/provider/account-management.tsx`). These call the API
   directly (`packages/api/src/routes/account.routes.ts`):
   - **Export:** JSON or CSV of the database records listed in
     `gatherUserData` (`packages/api/src/services/data-management.service.ts`).
     Uploaded files (photos, voice notes, ID images) are not included. The
     file is private and expires after 7 days.
   - **Deletion:** a 30-day cooling-off, which the person can cancel. Then a
     daily job (18:00 UTC) runs the partial anonymization described in rows
     1 to 10 above (`anonymizeUser`). This path skips the DPO queue.

**What deletion does not reach today:** phone sign-in code records
(`otp_codes`, which hold the real phone number and are never removed),
notification preferences, job addresses, booking photos and signatures, older
chat photos, support and dispute content, provider ID numbers, TINs and
document files, money records, security and device records, copies in backups
until those age out, copies in Redis until they expire, and tester bundles on
Ken's computer. `LAUNCH-LIMITATIONS.md` section 45 and E21 record most of
this. The `otp_codes` and notification preference gaps were found while
writing this file (`anonymizeUser` in `data-management.service.ts`).

## 4. Where the public notices do not match the code

These need the attorney. Claude can draft, but must not publish them.

- The privacy notice says personal data is anonymized or deleted within 30
  days of account deletion (`legal/privacy.html`, Data Retention). The code
  waits 30 days and then anonymizes only part of it (section 3).
- The privacy notice names only PayMongo as an outside company. Other
  services that would receive personal data when switched on are listed in
  `INTEGRATIONS.md`. It also does not say that a customer's job location goes
  to Google or Waze when the provider opens directions.
- The tester notice says a tester's data "will be deleted completely"
  (`legal/feedback.html`). The admin erase covers the server, not copies
  already pulled for analysis.

## 5. Not decided

| Question | Owner | Record |
|---|---|---|
| How long each table, folder, backup, log and copy is kept | DPO and attorney, then Ken | E21 |
| One deletion path that always reaches the DPO queue | Ken | E43 |
| Wording of the request deadline and breach classification | Counsel | E40 |
| How long tester feedback is kept | Ken | Feedback-v2 decision D2 (`LAUNCH-LIMITATIONS.md` section 130). Not the same as `.ai-coder/decisions/D02-cancellation-policy.md`. |
| Which country the data is hosted in, for the privacy notice | Ken | Not recorded in the repo |
| Making booking photos, signatures, dispute evidence and older chat photos private | Engineering (no decision needed) | R-ACC-12 |
| Masking contact details on the admin provider list and dispute detail | Engineering (no decision needed) | R-ACC-08 |
| A privacy impact assessment | DPO | None in the repo. `LAUNCH-LIMITATIONS.md` section 26 only says it is "scheduled for Q2". |
| NPC DPO registration | Ken | `docs/runbooks/launch-cutover.md` Item 1 |
