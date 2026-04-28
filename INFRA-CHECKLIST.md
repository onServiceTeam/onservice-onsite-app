# INFRA-CHECKLIST — onService Onsite App

This file tracks **infrastructure-not-code** tasks that must be completed
before production launch. Code-side fixes are tracked in the per-phase
verify-phase logs and DISPATCH dispatch reports; this list contains items
that can only be performed in cloud consoles, secrets managers, IaC
pipelines, or by an SRE.

Owner: SRE / Platform team. Each item must be **signed off** (initials +
date) in the right-hand column before the launch checklist gate is closed.

---

## 1. Object storage — BIR document bucket

The bucket referenced by `AWS_S3_BUCKET_BIR_DOCS` (used by
`packages/api/src/services/or.service.ts` and `bir-2307.service.ts`)
holds Official Receipts and BIR 2307 PDFs. BIR rules require **10-year
retention**.

| # | Task | Signed off |
|---|------|------------|
| 1.1 | Enable S3 **Bucket Versioning** on the BIR bucket. | |
| 1.2 | Enable **Object Lock** in **COMPLIANCE** mode with a default retention period of **3,650 days (10 years)**. | |
| 1.3 | Apply a bucket policy that **denies all `s3:GetObject` requests where `aws:SecureTransport != true`** (force HTTPS). | |
| 1.4 | Apply a bucket policy block that **denies public access** at the bucket level (also enable the account-level `BlockPublicAcls` / `BlockPublicPolicy` / `IgnorePublicAcls` / `RestrictPublicBuckets`). | |
| 1.5 | Add a **lifecycle rule** moving non-current versions to **Glacier Deep Archive after 90 days**, expiring delete-markers after 365 days. (Current versions stay in Standard for low-latency reads.) | |
| 1.6 | Enable **server-side encryption** with SSE-KMS using a dedicated CMK; rotate annually. | |
| 1.7 | Enable **S3 Access Logs** to a separate access-logs bucket with at least 1-year retention. | |

## 2. IAM — least privilege for the API service role

| # | Task | Signed off |
|---|------|------------|
| 2.1 | Create a dedicated IAM role for the API runtime (e.g., `onservice-api-prod`). Do **not** reuse the deployer role. | |
| 2.2 | Scope the role's S3 permissions to **`s3:PutObject`** and **`s3:GetObject`** on the BIR bucket only (resource ARN with prefix). | |
| 2.3 | Explicitly **deny** `s3:DeleteObject`, `s3:DeleteObjectVersion`, and `s3:PutBucket*` on the BIR bucket. | |
| 2.4 | Permission boundary preventing the role from creating new IAM principals or modifying KMS keys. | |
| 2.5 | Separate IAM role for the data-export job that gets `s3:PutObject` on the **export** bucket (NOT the BIR bucket). | |

## 3. Network / CORS

| # | Task | Signed off |
|---|------|------------|
| 3.1 | Per-environment CORS allowlist deployed via `CORS_ORIGINS` env var. Production must list only the customer-app domain, the admin-panel domain, and the provider-app domain. | |
| 3.2 | API behind a CDN/WAF (CloudFront + AWS WAF or equivalent). Block `Host:` mismatches and known-bad bot UAs. | |
| 3.3 | Rate limit at the edge: ≤120 req/min per IP for `/api/v1/auth/*`; ≤30 req/min for `/api/v1/compliance/*`. | |
| 3.4 | TLS only; HSTS preload header (`max-age=63072000; includeSubDomains; preload`). | |

## 4. Secrets management & rotation

All secrets stored in AWS Secrets Manager (or equivalent) — **never** in `.env`
files in a deployed image.

| # | Secret | Rotation policy | Signed off |
|---|--------|-----------------|------------|
| 4.1 | Sentry DSN (per env)                   | Rotate on team change.        | |
| 4.2 | JWT signing secret                     | Rotate every 90 days; dual-key window 7 days. | |
| 4.3 | Database credentials (app + read-replica) | Rotate every 90 days via Secrets Manager rotation lambda. | |
| 4.4 | AWS access keys (only if not using IAM role assumption) | None — eliminate via IRSA / instance profile. | |
| 4.5 | SMS provider API keys (Twilio / local PH provider) | Rotate every 90 days. | |
| 4.6 | Push-notification certs (FCM service account, APNs key) | Rotate at expiry; document expiry calendar. | |
| 4.7 | Session/cookie signing secret           | Rotate every 90 days; dual-key window 7 days. | |
| 4.8 | PayMongo / Xendit API keys              | Rotate after each personnel change with finance access. | |
| 4.9 | Redis / cache password (if used)        | Rotate every 90 days. | |

## 5. Monitoring & alerting

| # | Task | Signed off |
|---|------|------------|
| 5.1 | Sentry projects created for `api`, `admin`, `mobile`, `provider`. Source maps uploaded on every deploy. | |
| 5.2 | Uptime monitor (BetterStack / UptimeRobot) hitting `/api/v1/health` from at least 3 PH-region probes. Page on-call after 2 consecutive failures. | |
| 5.3 | k6 perf dashboards exported from CI runs (Phase 12 baselines): p95 latency targets per endpoint enforced. | |
| 5.4 | CloudWatch / Datadog alerts on: 5xx rate >1% over 5min, DB CPU >80%, escrow-reconciliation discrepancy >0. | |
| 5.5 | Daily reconciliation alert routed to finance Slack channel (independent of the engineering on-call rotation). | |
| 5.6 | DSR due-soon alert (`GET /api/v1/admin/compliance/dsr-alerts`) wired to a daily email to the DPO at 09:00 PHT. | |

## 6. Database — backups & DR

| # | Task | Signed off |
|---|------|------------|
| 6.1 | Automated **daily snapshots** retained for 30 days. | |
| 6.2 | **Point-in-time recovery** (PITR) enabled with a 7-day window. | |
| 6.3 | Quarterly **restore drill** documented (restore to staging from a random snapshot, run smoke tests, decommission). | |
| 6.4 | Cross-region replica for DR (asynchronous; RPO ≤15 min). | |
| 6.5 | Migrations require a successful run on staging before production deploy (CI gate). | |

## 7. Compliance / data residency

| # | Task | Signed off |
|---|------|------------|
| 7.1 | Confirm RDS, S3, and backups all reside in a region acceptable under the Data Privacy Act for the data classes processed. | |
| 7.2 | Data Processing Agreement (DPA) signed with each subprocessor (AWS, Sentry, SMS provider, payment provider). Inventory in `LEGAL/subprocessors.md`. | |
| 7.3 | NPC registration of the data processing system completed; certificate filed under `LEGAL/`. | |
| 7.4 | DPO contact email (`dpo@onservice.ph`) provisioned with an on-call rotation; the address is referenced from `apps/mobile/app/customer/data-rights.tsx`. | |

## 8. Other infrastructure

| # | Task | Signed off |
|---|------|------------|
| 8.1 | CI deploy pipeline requires `verify-phase.sh` to pass for every phase before promoting a release. | |
| 8.2 | Container image base updated monthly (no `latest` tags pinned in production). | |
| 8.3 | Dependency scanning (Dependabot / Snyk) enabled on the repo with CRITICAL findings auto-blocking merges. | |
| 8.4 | Per-environment runtime config validated by `config-validator` job before container starts. | |
| 8.5 | DNS records under change control; production zone changes require 2-person approval. | |

---

Phase 13 owner notes: items above were generated/updated during Phase 13
Dispatch C. Please re-review at every phase that adds a new external
integration.
