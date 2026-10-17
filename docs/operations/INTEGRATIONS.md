# Integrations register

Written 2026-10-14 as part of adopting the engineering standard (D40, standard
section R, backlog item BL-03). It replaces an older list that lived only in
Claude's private notes (dated 2026-06-29 and partly out of date). It describes
master `8d319a18`, which is what runs on the live tester server. Re-checked
on 2026-10-17 for public safety: details that would help an attacker moved to
the private records, with a pointer left here. Corrected again on the evening
of 2026-10-17 (the PayMongo hold covers the payment routes, not every path;
shorter Maps key, backup and agent-access wording).

**Rules for this file.** No secret values and no credential locations. Where a
service has a key, the file says what the key can do, not where it is kept.
Details about the server and its keys are in private records (not in the
repo). Nothing here is enforced by GitHub: GitHub protection is off by Ken's
choice (D40).

## How to read the maturity labels

The standard's ladder, lowest to highest:

1. **Researched:** someone has read about it.
2. **Documented:** the adapter is built in our code and tested with stand-ins.
3. **Commercially approved:** Ken has an account, accepted the terms and, where
   personal data flows, approved the company as a data processor.
4. **Sandbox validated:** a real call to the vendor's test mode worked, with a
   record.
5. **Production configured:** real-customer production has the settings.
6. **Production verified:** checks on real-customer production passed.

There is no real-customer production yet. So levels 5 and 6 are never used
below. "Tester server" says what is set on the live tester server instead.
Each label is the highest level with evidence found on 2026-10-14. Where the
evidence is missing, the label stays lower.

## Summary

| Service | Purpose | Maturity | Tester server today | Needs Ken |
|---|---|---|---|---|
| PayMongo | Card, GCash, Maya and wallet top-up payments | Documented. Not sandbox validated. | Held off in code: the payment routes refuse before any write (E14). One dormant background charge path does not go through the hold yet (tracked as BL-24; details in the private records). Wallet payments work without it. | Yes (E14) |
| Semaphore | SMS sign-in codes | Documented | Carriers will not deliver until corporate documents are filed (D37). Test accounts use a shared test code and get no SMS (`LAUNCH-LIMITATIONS.md` section 129). | Yes |
| Resend | Email sign-in codes | Documented | Not working: no account, no domain records (`LAUNCH-LIMITATIONS.md` section 127). | Yes |
| Cloudflare Turnstile | Anti-bot check after repeated wrong codes | Documented. Request contract tested in CI (`docs/SECURITY-POSTURE.md` SEC-002). | No keys as of 2026-10-11 (`LAUNCH-LIMITATIONS.md` section 126). | Yes (create keys) |
| Expo push service and Firebase Cloud Messaging | Phone notifications | Documented (send path built) | Not configured: no Firebase project, so Android phones get no push (sections 131 and 132). | Yes (Firebase project) |
| Google Maps SDK for Android | Maps in the Android app | Documented. A key is built into each tester APK. | Not checked on a real phone. Maps key settings in Google Cloud: a Ken check tracked in the private records. | Yes (console check) |
| OpenStreetMap tiles | Map background in the admin Dispatch Console | Documented | Probably blocked on live by the admin content rules. Not checked in a browser. | No |
| Google Maps and Waze directions links | Turn-by-turn directions for a provider going to a job | Documented (a hand-off, not an integration with a key) | Works today whenever a provider taps for directions. Not checked on a real phone. | Yes (privacy notice wording) |
| Sentry | Error reports from API, admin and app | Documented (wired in all three) | Not set up, according to the records: `docs/runbooks/launch-cutover.md` Item 6 is still open. Not re-checked on the server. | Yes (account) |
| Slack incoming webhook | Ops alerts | Documented | Off: the webhook setting is empty (section 132). | Yes (channel) |
| S3-compatible object storage | File storage, and an archive for tax documents | Documented | Not used. Files are on the server's own disk. The tax archive is held (E22). | Only to switch |
| Hetzner | The rented server | In use | One server, shared with other businesses' apps | |
| GoDaddy | DNS for `onservice.ph` and `onservice.com.ph` | In use | No email records yet (section 127) | Yes (email records) |
| HTTPS certificates | Encryption for the public sites | In use | Not all certificates run to the same date: one in use expires on 2026-11-24 and must be renewed on the shared server before then (private records). | Yes (if the renewal needs a reload of the shared server) |
| GitHub | Code hosting and CI | In use | Public repository. Protection off (D40). | Yes (D40 point 4) |
| Anthropic (Claude Code) | The AI coding service that writes and tests the code and makes tester releases | In use | Runs only in live sessions, within the authorization register (DRAFT) | Yes (Claude's GitHub identity: `STANDARD-V2-ADOPTION.md`, Ken decision 7) |
| Expo and EAS tooling | App build tooling | In use for local builds | Tester APKs are built on Ken's computer, not in EAS cloud builds | |

## Details

### PayMongo (payments)

- **Code:** `packages/api/src/services/payment.service.ts`,
  `packages/api/src/routes/webhook.routes.ts`,
  `packages/api/src/services/external-payment-hold.service.ts`.
- **Data sent:** amount, booking reference and the customer's payment choice.
  Our code does not collect card numbers. The payment routes send nothing
  today because of the hold.
- **Credential scope:** a server-side secret key that can create payment
  intents and refunds on the merchant account, and a webhook signing secret
  that lets the server check incoming messages. Which keys are set, and of
  which kind, is in private records.
- **Failure behaviour:** today the payment routes answer 503 with
  "temporarily unavailable" before any database write or PayMongo call (E14).
  One dormant background charge path does not go through the hold yet. It is
  tracked (adoption backlog BL-24; details in the private records).
  Webhooks are checked with a signature, a 5-minute replay window and
  duplicate handling. Failed gateway actions go on a retry queue that drains
  every 5 minutes (`jobs/workers.ts`). Gaps to fix before E14 is lifted: the
  payment-intent and refund calls have no timeout and no idempotency key
  (`payment.service.ts:71`, `:399`; backlog BL-06).
- **Cost and limits:** per-transaction fees. Not recorded here.
- **Exit plan:** not written.
- **Owner decisions:** E14 (the authorization flow), E11 (open), launch-cutover
  Item 7 (merchant onboarding). The public Terms page still describes PayMongo
  as the live processor holding money in escrow, which is attorney work.

### Semaphore (SMS)

- **Code:** `packages/api/src/services/sms.service.ts`.
- **Data sent:** phone number and the message text (a sign-in code).
- **Credential scope:** an API key that sends SMS and spends prepaid credit.
- **Failure behaviour:** bounded timeout and redirects refused
  (`sms.service.ts:74-82`). Phone sign-in can be switched off with
  `PHONE_OTP_SIGN_IN_ENABLED=0` without a new app release (section 127).
- **State:** Philippine carriers will not deliver our SMS until they receive
  our corporate registration documents (D37). Phone codes stay on until email
  sending works (section 127). Whether any real SMS was ever delivered was not
  checked for this file.
- **Owner decisions:** carrier registration documents; funding the account.

### Resend (email)

- **Code:** `packages/api/src/services/email-code-delivery.service.ts`.
- **Data sent:** email address, name, and the sign-in code.
- **Credential scope:** a sending key. Resend lets a key be limited to sending
  only.
- **Failure behaviour:** bounded timeout and redirects refused
  (`email-code-delivery.service.ts:160-167`). If an admin's emailed code
  fails, sign-in falls back to the authenticator app, so admins are not locked
  out (section 127). Delivery means "accepted by Resend", not "reached the
  inbox".
- **Cost and limits:** the free plan allows 3,000 emails a month and 100 a day
  (`docs/operations/email-sending-setup.md`).
- **Owner decisions:** create the account, add the domain records in GoDaddy,
  and approve Resend as a data processor before it carries sign-in email. It
  must then be named in the privacy notice.

### Cloudflare Turnstile (anti-bot)

- **Code:** `packages/api/src/services/security.service.ts`; the apps use
  `TurnstileModal`.
- **Data sent:** the browser or phone's challenge answer and the visitor's
  network signals, handled by Cloudflare.
- **Credential scope:** a site key built into the apps (public by design) and a
  server secret key that checks answers.
- **Failure behaviour:** fails closed. With no secret, or on any error, the
  check fails (`security.service.ts`), unless a relaxed test mode is on. On
  the tester server, with no keys, a phone locked out after repeated wrong
  codes stays locked for the lockout period (section 126).
- **Owner decisions:** create the keys (free). Launch-cutover Item 5.

### Expo push service and Firebase Cloud Messaging (notifications)

- **Code:** `packages/api/src/services/notification.service.ts`,
  `packages/api/src/services/push-retry.service.ts`; the app uses
  `expo-notifications`.
- **Data sent:** the phone's push token and the notification title and text.
  Expo passes Android messages to Google's Firebase service.
- **Credential scope:** an optional Expo access token for sending. Android
  delivery also needs a Firebase project linked to the app.
- **Failure behaviour:** in-app notifications are still saved in the database
  and shown in the app. Two defects: the send call has no timeout
  (`notification.service.ts:449`), and failed sends go on a retry queue that
  nothing drains. `processPushRetries` (`push-retry.service.ts:86`) is never
  called, although a comment at `notification.service.ts:490` says a scheduled
  worker picks the rows up (backlog BL-05).
- **Owner decisions:** create a Firebase project (free). Name Google in the
  privacy notice when it is switched on.

### Google Maps SDK for Android

- **Code:** `react-native-maps` in `apps/mobile`. The Android build requires a
  Maps key (`apps/mobile/app.config.ts`). The web app shows a preview instead
  of a map.
- **Data sent:** map requests from the phone, including the area being viewed.
- **Credential scope:** an Android Maps key built into the APK. Maps key
  settings in Google Cloud: a Ken check tracked in the private records (not
  in the repo).
- **Failure behaviour:** not checked.
- **Owner decisions:** the Maps key settings check in Google Cloud (private
  records). No address search service is built (D24).

### OpenStreetMap tiles (admin Dispatch Console)

- **Code:** `apps/admin/src/pages/DispatchConsolePage.tsx` with Leaflet. The
  tile address is the `map_tile_url` setting, defaulting to OpenStreetMap
  (`packages/api/src/services/settings.service.ts`).
- **Data sent:** the admin browser asks OpenStreetMap's servers for map
  pictures of the area shown.
- **Credential scope:** none.
- **Failure behaviour:** the content rules the web server sends for the admin
  site (`nginx/nginx.conf`, `img-src`) do not list the tile host, and the
  2026-08-24 version that live still runs does not either. So the background
  tiles are probably blocked on live, while local runs (no web server rules)
  show them. Not checked in a browser against live.
- **Cost and limits:** OpenStreetMap's public tile servers have a usage
  policy. Heavier use needs a paid tile provider. Not checked.

### Google Maps and Waze directions links (provider hand-off)

- **Code:** `apps/mobile/app/provider/job/[id]/navigate.tsx`. The provider's
  navigation screen builds a Google Maps directions link and a Waze link and
  opens the one the provider taps. Screen tests check that the buttons appear
  only with a usable destination and that the Google Maps button opens a link
  with the job's coordinates
  (`apps/mobile/__tests__/bug-ux-076-provider-navigation-action-gating.test.tsx`,
  `apps/mobile/__tests__/bug-phase110-01-navigate-dead-eta-styles.test.tsx`).
- **Data sent:** the job's coordinates when the booking has them, otherwise
  the job address text (street, barangay, city, province). This is the
  customer's home or job location. It goes to Google (or Waze, which Google
  owns) from the provider's phone or browser, only when the provider taps.
- **Credential scope:** none. These are public links, not an account.
- **Failure behaviour:** if the phone cannot open the link, the app shows a
  message asking the provider to install the app or check the browser.
- **Owner decisions:** the privacy notice does not mention this hand-off
  (`DATA-INVENTORY.md` section 4). That wording is attorney work.

### Sentry (error reports)

- **Code:** `@sentry/node` in the API (`packages/api/src/server.ts`), `@sentry/react`
  in admin (`apps/admin/src/main.tsx`), `@sentry/react-native` in the app
  (`apps/mobile/app/_layout.tsx`). Each starts only when its project key is
  set. The API strips signed media links from reports.
- **Data sent:** error details, which can include parts of requests.
- **Credential scope:** one project key per app. These keys only allow sending
  reports.
- **State:** not set up, according to the records (launch-cutover Item 6 is
  open; not re-checked on the server). So errors are only in server logs, and
  no error alert reaches anyone.
- **Owner decisions:** a Sentry account (free tier expected, not checked) and
  approval as a data processor.

### Slack incoming webhook (alerts)

- **Code:** `packages/api/src/services/slack-alert.service.ts`; used by the
  back-office request alerts (`marketplace-alert.service.ts`).
- **Data sent:** alert titles and short summaries.
- **Credential scope:** a webhook address. Anyone who has it can post to that
  channel.
- **Failure behaviour:** when unset it only writes a log line, and it never
  throws. The post has no timeout (`slack-alert.service.ts:75`).
- **Owner decisions:** pick the channel and create the webhook.

### S3-compatible object storage

- **Code:** `packages/api/src/services/upload.service.ts` (uploads),
  `packages/api/src/utils/s3-bir.ts` (tax documents).
- **State:** not used. `docker-compose.prod.yml` sets `S3_BUCKET` to empty, so
  files go to the server's own disk (`LAUNCH-LIMITATIONS.md` section 36). Tax
  document writes are held (E22, section 46).
- **Failure behaviour on local disk:** new request media is refused when the
  uploads volume has under 5 GiB free (`packages/api/src/config/job-media.config.ts`).
- **Exit plan:** the code can move to any S3-compatible store by setting its
  values. Private files would then also need their own access rules.

### Hetzner (server)

- **What:** one rented server runs the API, database, Redis, web apps and
  uploads, shared with other businesses' apps behind a shared front proxy.
- **Failure behaviour:** if the server fails, everything stops. Recovery from
  losing the whole server is not proven and alerts do not reach a person yet
  (BL-10, BL-11); details in the private records (not in the repo).
- **Owner decisions:** acceptable data loss and downtime, and off-site backup
  storage (backlog BL-10). The hosting country should be stated in the privacy
  notice; it is not recorded in the repo.

### GoDaddy (DNS)

- **What:** DNS for the public names.
- **Gap:** `onservice.ph` has no email records (MX, SPF, DKIM, DMARC), so
  email cannot be sent reliably (section 127). `onservice.com.ph` also has no
  mail records (section 129).

### HTTPS certificates

- `docker-compose.prod.yml` defines a certbot container. How certificates are
  issued and renewed behind the shared front proxy is recorded in private
  records.
- A check during the 2026-10-16/17 handover review found that the
  certificates do not all expire together. One of them expires on 2026-11-24.
  Renewing it depends on steps on the shared server, so it is a dated item to
  plan with Ken (details in the private records, not in the repo).

### GitHub (code and CI)

- **What:** the public repository and GitHub Actions CI.
- **State:** master has no branch protection or rulesets. Secret scanning and
  Dependabot alerts are off (D40 point 4). CI results do
  not block a push. Gates B, D and E report green on master without running
  their real checks. GitHub settings would guard against accidents only, not
  against the account Claude uses.
- **Owner decisions:** the GitHub settings (D40 point 4), and Claude's GitHub
  identity (`.ai-coder/governance/STANDARD-V2-ADOPTION.md`, section 6, Ken
  decision 7).

### Anthropic (Claude Code)

- **What:** the AI coding service. It reads and writes the code, runs tests,
  and makes tester releases within the authorization register (row R2,
  DRAFT).
- **Data it receives:** source code, command output, and anything read in a
  session. That can include private records and tester feedback when it is
  analysed. The tester notice says AI tools help sort what testers send
  (`legal/feedback.html`).
- **Failure behaviour:** when the session ends or credit runs out, work stops.
  There is no runner that continues on its own.
- **Owner decisions:** the limits in the authorization register (DRAFT) and
  Claude's GitHub identity (`STANDARD-V2-ADOPTION.md`, Ken decision 7).

### Expo and EAS tooling

- The app config reads an EAS project id. Tester APKs are built on Ken's
  computer, not in EAS cloud builds (private release records). Over-the-air
  updates without a new APK are not built (section 128).

## Not used or not built

| Item | State |
|---|---|
| Provider payouts by API | Not built. An admin pays each provider by hand and records it (`LAUNCH-LIMITATIONS.md` section 38). |
| Identity check vendor for providers | None. ID documents and NBI clearances are reviewed by hand. |
| Address search and autocomplete | Not built (D24). |
| Calls and video | Not built. The plan is a self-hosted server (D26). |
| Zoho Books and Odoo | Not used by this repository. |
| Google Play and the Apple App Store | Not used. Ken chose the wording "Google Play listing coming soon" for the homepage (2026-10-14). Whether and when to list is open; the app is not listed. See `PLATFORM-SUPPORT.md` section 7. |
| Uptime monitor, alert manager, paging | Not deployed. Alerts do not reach a person yet (BL-11; repair item R-PLT-03). |

## Built and run on our own server (not outside services)

PostgreSQL, Redis, Socket.io live updates, Prometheus and Grafana, and the
nginx web server. They are covered by the server and backup notes above.

## Open questions for Ken

1. PayMongo: the E14 authorization flow and the E11 question.
2. Resend: account, domain records, and approval as a data processor.
3. Firebase: a project for Android push.
4. Sentry and Slack: accounts and an alert channel, then one test alert sent
   end to end (backlog BL-11).
5. Google Cloud: the Maps key settings check (private records).
6. Turnstile: create the keys.
7. Off-site backup storage and recovery targets (BL-10).
8. Whether integration prerequisites (Resend and DNS, Semaphore registration,
   Firebase, Maps key, Slack) join the launch runbook. That changes the launch
   definition, so it is Ken's call.
