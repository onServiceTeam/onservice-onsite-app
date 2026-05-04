# Escalation E02 — Launch-blocking items genuinely outside autonomous scope

**Date raised:** 2026-05-04
**Raised by:** Claude (Phase 36 closeout — user instruction explicitly
listed these items in the "continue without stopping" set)
**Status:** OPEN — every item below requires a human action that
Claude cannot perform autonomously per CLAUDE.md hard-stops.

## Why this file exists

The user instruction at the start of Phase 36 was:

> continue without stopping for the remaining surfaces (admin.routes.ts
> deeper, dispatch ranking, provider-admin, booking status matrix)
> remain candidates. Real-product items (45s offer cycle, quiet hours,
> BIR PDF runtime) and items genuinely outside autonomous scope per
> CLAUDE.md hard-stops (F#3, F#10, 12 D14 ops items)

I closed the four "remaining surfaces" (Phase 35) and the three
"real-product items" (Phase 36a/b/c). The third group — F#3, F#10, and
the 12 D14 ops items — cannot be completed by an autonomous agent. This
file documents WHY each one is blocked and what Ken needs to do, so
v1.0.0-launch-ready can move forward without me re-discovering this on
each session.

This is a CLAUDE.md hard-stop file, not a "Claude couldn't figure it
out" file. Each item below is explicitly outside autonomous scope.

## F#3 — Maestro mobile baseline capture

**What's needed:** 84 Maestro YAML flows are committed in
`apps/mobile/maestro/`. Capture 84-336 baseline PNGs (4 PNGs per flow:
initial / mid / final / error states) by running each flow against an
iOS Simulator or Android Emulator.

**Why I can't do this:**
- The autonomous environment has no iOS Simulator (macOS/Xcode
  required) and no Android Emulator (AVD + qemu not present in WSL).
- Maestro requires a connected device (real or virtual). Spinning up an
  emulator inside the autonomous container would need ~8GB RAM + nested
  virtualisation flags, neither of which is available.
- Per CLAUDE.md state-of-project section: "F#3 baseline capture — 84
  Maestro YAML flows committed; the 84-336 baseline PNGs need an iOS
  simulator or Android emulator session. Handoff:
  `.ai-coder/handoff/F3-maestro-baseline-capture.md`."

**What Ken needs to do:**
1. On a Mac with Xcode 15+ and an iOS Simulator (iPhone 15 Pro, iOS 17+):
   - Install Maestro CLI: `brew install maestro`
   - From repo root: `bash scripts/mobile/maestro-capture-baselines.sh`
     (needs to be created — see handoff)
   - Commit `apps/mobile/maestro/baselines/*.png` to a new branch
2. OR on a Linux box with Android Studio + AVD (Pixel 7, API 34):
   - Same commands targeting the emulator
3. Smoke-test 5 randomly-chosen flows manually before committing.

**Estimated time for Ken/contractor:** 2-4 hours one-time setup +
~15 minutes per re-run after UI changes.

**Handoff doc:** `.ai-coder/handoff/F3-maestro-baseline-capture.md`
(referenced in CLAUDE.md; should already exist).

## F#10 — Attorney-reviewed legal disclaimer wording

**What's needed:** The interim disclaimer wording on the customer +
provider terms screens needs to be replaced with attorney-reviewed PH-
specific language. The CI guard
`scripts/gates/d-cross-source-legal-disclaimer.sh` already prevents the
interim text from drifting; once final text lands, the guard's
allowlist gets updated.

**Why I can't do this:**
- I am not a lawyer. CLAUDE.md hard-stop #5 explicitly: "Legal-language
  requirement that needs an attorney (e.g., F#10 final disclaimer)."
- PH-specific consumer protection law (RA 7394) and DPA (RA 10173)
  language must be drafted by counsel licensed in the Philippines.
- I can review what's there and flag obvious issues, but the
  substantive legal text is for an attorney.

**What Ken needs to do:**
1. Email the interim wording (in `apps/mobile/src/screens/legal/` and
   `apps/admin/src/pages/Legal/`) to PH counsel.
2. Receive attorney-reviewed versions back.
3. Update the screens + bump the CI guard's allowlist version.
4. Update consent_versions table with the new version slug.
5. Trigger material-consent re-acknowledgement (LAUNCH-LIMITATIONS #5
   already wired — users will see "please re-accept" on app open).

**Decision file:** `.ai-coder/decisions/D14r-10-legal-disclaimer.md`
(per CLAUDE.md state-of-project).

**Estimated time:** 5-10 business days for attorney turnaround +
2 hours to apply the updated wording.

## 12 D14 operational items

These live in `docs/runbooks/launch-cutover.md`. None are coding
tasks; all are external-account / infrastructure / paperwork actions
that require credentials, money, or a physical visit.

### 1. NPC DPO registration (RA 10173 §22)

- **What:** Register the company's Data Protection Officer with the
  National Privacy Commission via npc.gov.ph DPO portal.
- **Why I can't:** Requires Ken's company TIN, business registration,
  and a designated DPO's personal info + government ID upload. I can't
  submit forms on behalf of a real legal entity.
- **What Ken does:** Visit npc.gov.ph/dpo, submit the form, receive
  registration number. Update the registration number in
  `platform_settings.npc_dpo_registration_number` (key needs to be
  added — pre-fix this is in our deferred list).

### 2. BIR ATP (Authority to Print) physical visit

- **What:** Get an Authority to Print Official Receipts approval from
  the Revenue District Office (RDO) where the company is registered.
- **Why I can't:** Requires Ken to physically visit the BIR RDO, file
  BIR Form 1906, and pay the fee.
- **What Ken does:** Visit RDO, submit Form 1906, get ATP number,
  update `platform_settings.bir_filer_ptu_number` from `__UNSET__` to
  the real ATP. Without this, OR PDFs (Phase 36c) can be generated but
  cannot be legally issued.

### 3. PayMongo live mode credentials

- **What:** Switch PayMongo from sandbox to live mode and update the
  webhook secret.
- **Why I can't:** Live-mode credentials require Ken's PayMongo
  business account approval (KYC/business docs review takes 3-5 days).
  I do not have access to Ken's PayMongo dashboard.
- **What Ken does:** Email PayMongo for live-mode upgrade, receive
  live keys, update `.env.production` (PAYMONGO_PUBLIC_KEY,
  PAYMONGO_SECRET_KEY, PAYMONGO_WEBHOOK_SECRET). Update the webhook URL
  in PayMongo dashboard to point at production.

### 4. S3 Object Lock for receipts bucket

- **What:** Enable Object Lock + WORM (Write Once Read Many) policy on
  the BIR receipts S3 bucket per BIR retention rules (10 years).
- **Why I can't:** Requires AWS Console access with Object Lock
  permissions. Object Lock can ONLY be enabled at bucket creation —
  the existing bucket needs to be replaced or a new bucket spun up
  alongside.
- **What Ken does:** In AWS Console, create new bucket
  `onservice-bir-receipts-locked` with Object Lock enabled
  (compliance mode, 10-year retention). Update
  `infra/terraform/s3.tf`. Migrate existing receipts via
  `aws s3 cp --recursive`.

### 5. Postgres PITR (Point-In-Time Recovery)

- **What:** Enable PITR on the production RDS instance with 35-day
  retention.
- **Why I can't:** RDS Console access with billing permissions
  required. PITR is a paid feature (~$0.095/GB-month for backup
  storage + WAL retention).
- **What Ken does:** RDS Console → modify instance → Backups → enable
  PITR with 35-day window + multi-AZ failover.

### 6. DNS + TLS certificates

- **What:** Point onservice.us A records at the production load
  balancer, provision ACM certs for `*.onservice.us`,
  `app.onservice.us`, `admin.onservice.us`, `api.onservice.us`.
- **Why I can't:** Requires Ken's DNS registrar credentials
  (Namecheap/Cloudflare). ACM cert validation needs DNS records.
- **What Ken does:** Add DNS records per
  `infra/terraform/cloudfront.tf`, request ACM certs, validate via DNS,
  attach to CloudFront/ALB.

### 7. Sentry production project + alerts

- **What:** Create a production Sentry project, configure alert rules
  (5xx error rate > 1%, p99 latency > 2s, DB connection pool > 80%).
- **Why I can't:** Sentry organization-admin access required to create
  projects and integrate Slack/PagerDuty.
- **What Ken does:** Sentry dashboard → new project → copy DSN to
  `.env.production` (SENTRY_DSN). Configure alert rules per runbook.

### 8. PagerDuty rotation

- **What:** Set up on-call rotation, escalation policy, integrate with
  Sentry + Datadog.
- **Why I can't:** PagerDuty admin access + Ken needs to designate
  on-call humans (himself and any contractors).
- **What Ken does:** PagerDuty dashboard → create schedule → connect
  to Sentry/Datadog webhooks → test the page.

### 9. Datadog production agent

- **What:** Deploy the Datadog agent to the production ECS cluster for
  metrics + APM.
- **Why I can't:** Datadog API key + ECS task-role privileges.
- **What Ken does:** Add `DD_API_KEY` to ECS task definition, deploy.

### 10. Cloudflare WAF rules

- **What:** Provision the WAF ruleset (rate limits, OWASP Top 10
  blocking, country-block for Russia/North Korea).
- **Why I can't:** Cloudflare admin access + business-tier subscription
  required for managed rules.
- **What Ken does:** Cloudflare dashboard → WAF → import the rules
  from `infra/cloudflare/waf-rules.json`. Bump plan to Business.

### 11. Mobile app store submissions

- **What:** Submit to Apple App Store + Google Play Store.
- **Why I can't:** Requires developer accounts (Apple $99/yr,
  Google $25 one-time), Ken's identity verification, app screenshots,
  privacy policy URL, support email — all human/business decisions.
- **What Ken does:** EAS Build, submit via App Store Connect + Google
  Play Console. First review: 1-3 days each.

### 12. Provider-onboarding contractor agreements

- **What:** Get the IC (Independent Contractor) agreement template
  attorney-reviewed and signed by the founding-batch providers.
- **Why I can't:** Same as F#10 — legal language + counterparty
  signatures.
- **What Ken does:** Send IC template to attorney, distribute to
  founding providers, collect signed copies, store in S3 bucket
  `onservice-legal-agreements/`.

## Summary table

| Item | Blocker type | Ken action | Time estimate |
|---|---|---|---|
| F#3 Maestro baselines | Need iOS sim or Android emulator | Run capture script on Mac/Linux box | 2-4h |
| F#10 Legal disclaimer | Need PH attorney review | Email counsel + apply text | 5-10 business days |
| D14-1 NPC DPO registration | Need company entity + DPO | Submit npc.gov.ph form | 1 day |
| D14-2 BIR ATP | Physical RDO visit | Visit RDO with Form 1906 | 1 day |
| D14-3 PayMongo live mode | Need Ken's PayMongo account | KYC + key swap | 3-5 days |
| D14-4 S3 Object Lock | AWS Console access | Create new bucket + migrate | 2h |
| D14-5 Postgres PITR | RDS console + billing | Modify instance | 30min |
| D14-6 DNS + TLS | Registrar credentials | Add records + validate ACM | 1-2h |
| D14-7 Sentry production | Sentry org admin | Create project + DSN | 30min |
| D14-8 PagerDuty rotation | PagerDuty admin | Schedule + integration | 1h |
| D14-9 Datadog agent | Datadog API key | ECS env var | 30min |
| D14-10 Cloudflare WAF | Cloudflare admin | Import rules | 1h |
| D14-11 App store submissions | Developer accounts | EAS Build + Submit | 1-3 days |
| D14-12 IC agreements | Attorney + provider sigs | Email + collect | 5-10 business days |

## Until these land

`v1.0.0-launch-ready` cannot be tagged. The codebase is
launch-ready *conditional on these external actions*. Every CRIT bug
in the audit (Phase 17 → 36) is fixed. All routes are tested. All
real-product features Ken explicitly listed are implemented. The only
remaining gates are external-action gates.

When each item closes, update its row above with date + result, and
update `docs/runbooks/launch-cutover.md` to mark the corresponding
runbook step as DONE.
