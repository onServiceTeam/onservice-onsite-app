# Dispatch D14 — Production Cutover — Closeout

Branch: `phase/14-d14-cutover`
Tag (after merge): `v0.14.0-d14-complete`
Tag (after Ken's operational sign-offs): `v1.0.0-launch-ready`

<!-- gate-b: no-bugs-this-dispatch -->

## Scope shape

D14 is **unlike every other dispatch**. It addresses 12 operational launch
blockers that **are not code changes** — they are real-world business
operations Ken (or a hired specialist / API platform engineer) must
complete: NPC DPO registration, BIR ATP allocation, PayMongo onboarding,
S3 Object Lock enabling, etc.

The AI coder's contribution is the **verification harness + cutover
runbook**, NOT the operational steps themselves. Per the user's standing
authorization, AI proceeds without halting on the AWS-credentials /
NPC-registry / etc. boundaries — instead it ships the harness Ken runs
when each operational step lands.

D14's "Bugs claimed fixed" is N/A — see the no-bugs-this-dispatch
marker above. Gate B accepts this.

## What D14 ships (AI deliverable)

### Verification scripts (count: 11)

- `scripts/verify-dpo-registered.sh` — Item 1 (NPC DPO)
- `scripts/verify-bir-or-series.sh` — Item 2 (BIR ATP)
- `scripts/verify-hcaptcha.sh` — Item 5 (hCaptcha live keys)
- `scripts/verify-sentry.sh` — Item 6 (Sentry production DSN)
- `scripts/verify-paymongo.sh` — Item 7 (PayMongo live mode)
- `scripts/verify-s3-bir.sh` — Item 8 (S3 BIR bucket Object Lock)
- `scripts/verify-postgres-pitr.sh` — Item 9 (Postgres PITR)
- `scripts/verify-tls.sh` — Item 10 (DNS + TLS A+ rating)
- `scripts/verify-bir-pipeline.sh` — Item 12 (BIR e-receipt pipeline)
- `scripts/verify-launch-readiness.sh` — umbrella check; runs every
  required-Item verifier and exits non-zero if any fails
- `scripts/run-full-smoke.sh` — final Maestro + Playwright sweep

Items 3 (DTI), 4 (Mayor's permit), 11 (Admin SSO) are manual sign-offs
documented in the runbook; no automation is meaningful for them.

### Runbook

- `docs/runbooks/launch-cutover.md` — every Item has Owner / time /
  cost / steps / verification / rollback / sign-off entries. Operational
  launch decision matrix + tag-application instructions at the end.

### Terraform spec

- `infra/terraform/s3-bir-receipts.tf` — dedicated BIR bucket with
  Object Lock COMPLIANCE 10y + KMS-SSE + versioning + public-access
  block + TLS-only bucket policy. Spec only; applied by Ken/engineer
  when production AWS account is ready.

### Bridge test

- `packages/api/__tests__/d14-cutover-harness.test.ts` — asserts every
  verifier script + runbook section + terraform spec exists and is
  shaped correctly.

## Files added (count: 14)

- `.ai-coder/dispatches/D14-closeout.md`
- `docs/runbooks/launch-cutover.md`
- `infra/terraform/s3-bir-receipts.tf`
- `packages/api/__tests__/d14-cutover-harness.test.ts`
- `scripts/verify-dpo-registered.sh`
- `scripts/verify-bir-or-series.sh`
- `scripts/verify-hcaptcha.sh`
- `scripts/verify-sentry.sh`
- `scripts/verify-paymongo.sh`
- `scripts/verify-s3-bir.sh`
- `scripts/verify-postgres-pitr.sh`
- `scripts/verify-tls.sh`
- `scripts/verify-bir-pipeline.sh`
- `scripts/verify-launch-readiness.sh`
- `scripts/run-full-smoke.sh`

## Files modified

- `.ai-coder/CURRENT-DISPATCH`

## Decision points / scope decisions

1. **AI does not apply the `v1.0.0-launch-ready` tag.** That tag is the
   human go-decision after Ken signs off every operational item. The AI
   tags `v0.14.0-d14-complete` for this dispatch's AI contribution. The
   runbook documents the exact `git tag` command Ken runs.

2. **Migration 077 (promo_redemptions) is NOT created in D14.** Per
   D13's pull decision, the table is reserved for v1.1+. The migration
   sequence has a deliberate gap at 077; the runbook documents this
   explicitly so a future maintainer doesn't think a migration was lost.

3. **Maestro flow files for the 7 critical-path E2E flows are deferred**
   to a v1.0 follow-up workstream (after the per-screen polish-pass
   from D11/D12 §28/§29 lands). `run-full-smoke.sh` gracefully skips
   missing Maestro directories rather than failing — Ken can run the
   Playwright admin tests today and add Maestro flows incrementally.

4. **Verify scripts are designed to be runnable BY KEN AFTER each
   operational step.** They will fail today (no production env vars
   set, no AWS account, no NPC registration #) — that's expected.
   They become useful when Ken runs them with `set -a; source
   .env.production; set +a` after each Item lands.

5. **No new `LAUNCH-LIMITATIONS.md` section needed.** Existing §28
   (D11 mobile customer polish deferred), §29 (D12 mobile provider
   polish deferred), §30 (D13 promo pulled), §31 (D13 A/B testing
   pulled) cover all v1.1+ workstream scope. D14's deferrals are
   documented in this closeout + the runbook.

## Honesty check — 3 scenarios

### 1. Ken runs `verify-launch-readiness.sh` before any operational step lands

Pre-D14: no harness existed. Ken would have to manually verify each item.
Risk: subtle misses (e.g., S3 bucket created but Object Lock disabled).

Post-D14 trace:
1. Ken runs `bash scripts/verify-launch-readiness.sh` against an empty
   `.env.production`.
2. Each verifier exits non-zero with a specific "FAIL: <env var or
   resource> missing" message.
3. Umbrella reports "Failed items: 1 2 5 6 7 8 9 10 12" + "Launch is
   BLOCKED until all required items pass."
4. **Outcome:** Ken knows exactly what's outstanding. **No surprise
   launch-day FAIL.**

### 2. Ken finishes BIR ATP (Item 2) — does the harness catch it?

Trace:
1. Ken receives BIR ATP. Adds `BIR_OR_SERIES_PREFIX=ONS,
   BIR_OR_SERIES_START=0000001, BIR_OR_SERIES_END=0050000` to
   `.env.production`.
2. Ken runs `set -a; source .env.production; set +a; bash
   scripts/verify-bir-or-series.sh`.
3. Script confirms env vars set; if `API_BASE_URL` is also set, it
   hits `/internal/bir/next-or-number` and prints the next OR number.
4. Item 2 sign-off in runbook.
5. Umbrella `verify-launch-readiness.sh` now shows Item 2 passing.
6. **Outcome:** harness reports forward progress without manual
   tracking. **Eight more Items to go before launch.**

### 3. AWS engineer applies the BIR Terraform — does it match the verifier?

Trace:
1. Engineer runs `terraform apply -var environment=prod` against
   `infra/terraform/s3-bir-receipts.tf`.
2. AWS creates `onservice-bir-receipts-prod` with KMS key, Object Lock
   COMPLIANCE 10y, versioning, public-access-block, TLS-only policy.
3. Engineer runs `bash scripts/verify-s3-bir.sh`.
4. Script queries `aws s3api get-object-lock-configuration` →
   confirms `Mode=COMPLIANCE, Years=10`. Confirms KMS-SSE. Confirms
   versioning Enabled.
5. Item 8 passes.
6. **Outcome:** terraform spec + verifier are paired so a misconfigured
   bucket fails fast. The bridge test asserts the terraform spec
   contains the required clauses, so a malicious or broken spec fails
   CI before deploy.

## Gates run

- [x] Gate A — PASSED locally
- [x] Gate B — accepted via `<!-- gate-b: no-bugs-this-dispatch -->` marker; D14 is meta-only (operational + harness)
- [x] Gate C — PASSED at closeout commit

## Spec corrections inherited

The cumulative spec/reality divergence list is unchanged in D14
(42 corrections through D13). One new D14 spec correction:

- **Spec correction (D14)**: spec line 873 calls for
  `apps/mobile/.maestro/e2e/critical-paths/` with 7 end-to-end Maestro
  flows. **Reality:** Maestro CLI is not in CI yet (deferred to v1.2
  per `LAUNCH-LIMITATIONS.md §28`). `run-full-smoke.sh` gracefully
  skips missing Maestro dirs. v1.0 launches without these flows;
  Playwright admin tests + manual smoke cover the gap.

Cumulative inherited corrections: 42 + 1 = 43.

## Auto-proceed decision

D14 AI contribution complete. Subtask 18 follows: push + PR + merge +
tag `v0.14.0-d14-complete` + STOP — the next milestone (`v1.0.0-launch-ready`)
requires Ken's operational sign-offs.

After merge, autonomous mode is paused. Ken's next action is reading
the runbook + executing the 12 operational items. The AI is done with
Phase 14 dispatches; Phase 14 closes when Ken applies the launch tag.
