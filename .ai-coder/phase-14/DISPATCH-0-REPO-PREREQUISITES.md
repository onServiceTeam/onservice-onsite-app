# DISPATCH 0 — REPO PREREQUISITES

This is the one-time setup work that must complete before Dispatch 01 can run. Without these prerequisites, the gates do not actually block bad work — the AI coder will commit, push, merge, and the structural defenses described in Part 4 are theatrical, not real.

Dispatch 0 is unlike Dispatches 01-14. It does not fix bugs. It builds the infrastructure that makes the rest of Phase 14 work. Estimated time: 4-8 hours of focused work, mostly waiting for AWS / GitHub / staging environment provisioning.

**Owner:** AI coder, with Ken's involvement at three checkpoints (GitHub branch protection settings, CI runner billing, staging credentials).

**Output:** `.ai-coder/DISPATCH-0-COMPLETE` marker file, signed by Ken.

---

## What Dispatch 0 produces

By the end:

1. The 5 gate scripts exist at `scripts/gates/*.sh` and run successfully on the current main branch.
2. The CI workflow at `.github/workflows/gates.yml` exists and runs on every PR.
3. GitHub branch protection on `main` requires all 5 gates plus the summary check, with "Include administrators" enabled.
4. A staging environment exists matching production (DB, S3, Redis) with seeded test data.
5. The Phase 14 instruction package is committed at `.ai-coder/phase-14/`.
6. The discipline document is committed at `.ai-coder/EXECUTION-DISCIPLINE.md`.
7. CLAUDE.md is committed at the repo root.
8. The `.ai-coder/PHASE-14-ACKNOWLEDGMENT.md` file exists with the AI coder's acknowledgment.
9. Visual baseline infrastructure is set up (Maestro for mobile, Playwright for admin).
10. Mutation testing tooling is installed and runs against the existing codebase.

After Dispatch 0, the gates are real, the package is in place, and the AI coder can begin Dispatch 01.

---

## Step 0.1 — Commit the Phase 14 package and operating documents

The AI coder begins Dispatch 0 by ensuring the documentation is in the repo.

**0.1.1.** Verify these files exist at the repo root or under `.ai-coder/phase-14/`:

```
CLAUDE.md
.ai-coder/EXECUTION-DISCIPLINE.md
.ai-coder/phase-14/AI-CODER-MASTER-BRIEF.md
.ai-coder/phase-14/DESIGN-CONTRACT-V2.md
.ai-coder/phase-14/SCREEN-CATALOG-PART-2A-ADMIN.md
.ai-coder/phase-14/SCREEN-CATALOG-PART-2B-MOBILE-CUSTOMER.md
.ai-coder/phase-14/SCREEN-CATALOG-PART-2C-MOBILE-PROVIDER.md
.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-01-02.md
.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-03-04.md
.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-05-06.md
.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-07-08.md
.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-09-10.md
.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-11-12.md
.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-13-14.md
.ai-coder/phase-14/PART-4-GATE-HARDENING-REFERENCE.md
.ai-coder/phase-14/PART-5-KEN-HANDBOOK.md
.ai-coder/phase-14/DISPATCH-0-REPO-PREREQUISITES.md  (this file)
```

If any are missing, halt and tell Ken which ones. He will provide them.

**0.1.2.** Read all 14 Phase 14 documents per the order in CLAUDE.md. This is the precondition for everything else; do not skip it.

**0.1.3.** Write `.ai-coder/PHASE-14-ACKNOWLEDGMENT.md` per the template in CLAUDE.md.

**0.1.4.** Commit:
```bash
git checkout -b phase/14-d0-prerequisites
git add CLAUDE.md .ai-coder/
git commit -m "docs: install Phase 14 instruction package and operating discipline"
```

Do not push yet — branch protection is not configured, but you should still respect the workflow.

---

## Step 0.2 — Create the gate scripts

The 5 gate scripts come from Part 4. Implement each per Part 4's canonical script form. Files go in `scripts/gates/`:

```
scripts/gates/
├── run-gate-a.sh                                # aggregator
├── a-cross-source-cancellation-policy.sh
├── a-cross-source-brand-color.sh
├── a-cross-source-routes.sh
├── a-cross-source-tier-criteria.sh
├── a-cross-source-no-axios.sh
├── a-cross-source-no-emoji-icons.sh
├── a-cross-source-no-google-maps-placeholder.sh
├── a-cross-source-hashes-immutable.sh
├── a-cross-source-no-client-money.sh
├── a-cross-source-no-siguradoshield.sh
├── b-bug-deferral.sh
├── c-constitution.sh
├── d-visual-screenshots.sh
└── e-mutation-testing.sh
```

For each script:

**0.2.1.** Copy the canonical content from Part 4 §"Gate <X>" exactly. Do not rewrite or "improve."

**0.2.2.** Make executable: `chmod +x scripts/gates/*.sh`.

**0.2.3.** Run locally on current `main`:
```bash
bash scripts/gates/run-gate-a.sh    # may have violations on existing code
bash scripts/gates/c-constitution.sh # may have violations on existing code
```

It is expected that some Gate A and Gate C fragments fail on the current main — that is exactly why Phase 14 exists. Note which fail. They will be addressed by the dispatches that own those fragments (e.g., Gate A cancellation-policy fragment passes after Dispatch 02).

**0.2.4.** Create `scripts/gates/EXPECTED-FAILURES.md` documenting which fragments are currently expected to fail and which dispatch will address each. This file is the baseline; as dispatches close, fragments move from "expected to fail" to "now passing."

**0.2.5.** Commit:
```bash
git add scripts/gates/
git commit -m "feat(gates): install 5-gate enforcement scripts per Part 4"
```

---

## Step 0.3 — Configure CI workflow

**0.3.1.** Create `.github/workflows/gates.yml` per Part 4 §"CI workflow integration." Copy exactly.

**0.3.2.** Create supporting workflow `.github/workflows/test.yml` if not already present, that runs unit tests on every PR.

**0.3.3.** Commit:
```bash
git add .github/workflows/
git commit -m "ci: install gates workflow per Part 4"
```

**0.3.4.** Push the dispatch-0 branch:
```bash
git push origin phase/14-d0-prerequisites
```

**0.3.5.** Open a PR. CI will run for the first time. Some gates will fail (per `EXPECTED-FAILURES.md`); that is acceptable for the Dispatch 0 PR specifically because the gates do not block until branch protection is configured (next step). Note the run output — it confirms the gates execute correctly even though some fragments fail.

**Halt point 1.** Ken needs to:
- Approve the CI workflow exists and runs.
- Decide whether to merge Dispatch 0 PR despite expected gate failures (recommendation: yes, document the failures, address through Dispatches 01-14).

The AI coder writes a session log entry: "Halted at 0.3.5 awaiting Ken's decision on Dispatch 0 PR merge despite expected gate failures."

---

## Step 0.4 — Configure GitHub branch protection

**Owner: Ken.** This step requires GitHub repository admin permissions. The AI coder cannot do this; only Ken can.

After Dispatch 0 PR merges, Ken navigates to GitHub settings:

`Settings → Branches → Add rule for "main"`:

```
Branch name pattern: main

Settings to enable:
✓ Require a pull request before merging
  ✓ Require approvals: 1
  ✓ Dismiss stale pull request approvals when new commits are pushed
✓ Require status checks to pass before merging
  ✓ Require branches to be up to date before merging
  Required status checks (search and add):
    - gate-a
    - gate-b
    - gate-c
    - gate-d
    - gate-e
    - gates-summary
✓ Require conversation resolution before merging
✓ Require linear history
✓ Include administrators
✓ Restrict who can push to matching branches: <empty>
```

Ken then writes a brief confirmation in `.ai-coder/dispatches/D0-step-0.4-branch-protection.md`:

```markdown
# Dispatch 0 — Step 0.4 — Branch Protection Configured

Date: <YYYY-MM-DD>
Configured by: Ken
Repository: github.com/onServiceTeam/onservice-onsite-app

Settings active:
- Require PR with 1 approval (Ken)
- Required status checks: gate-a, gate-b, gate-c, gate-d, gate-e, gates-summary
- Require branches up to date
- Require linear history
- Include administrators (no admin bypass)
- Restrict pushes: PR-only

Verified: I tested by attempting `git push origin main` from my local machine.
The push was rejected with: "Branch protection rule requires status checks."
```

The verification step is critical. Without it, you will not know if branch protection actually works until something goes wrong.

**Halt point 2.** Ken commits the confirmation file. The AI coder reads it and resumes.

---

## Step 0.5 — Set up staging environment

The dispatches need a staging environment to validate end-to-end. Production parity matters.

**0.5.1.** Provision staging:
- Postgres database (managed RDS or DigitalOcean equivalent), separate from production
- S3 bucket for staging uploads (with KMS-SSE per Bug 1325 fix)
- Redis instance for staging
- Domain `staging.api.onservice.ph` with TLS

This is operational infrastructure work. If the AI coder has IAM credentials to provision, it can do this via Terraform. If not, Ken does it manually or contracts an infra engineer. **Halt point 3** if the AI coder lacks credentials.

**0.5.2.** Run all 59 existing migrations against the staging DB:
```bash
DATABASE_URL=$STAGING_DB_URL pnpm --filter @onservice/api migrate:up
```

All migrations must complete successfully. If any fail, the staging DB is unusable; halt and investigate before proceeding.

**0.5.3.** Seed staging with test data:
- 3 admin users (super_admin, admin, dpo roles)
- 5 active providers across different service categories and areas
- 10 customers
- 20 historical bookings in various states (completed, cancelled, disputed)
- 1 active recurring booking
- 1 pending DSR request

The seeds are at `packages/api/seeds/` and should already include these. If gaps exist, write a `staging-test-data.sql` seed in addition.

**0.5.4.** Configure CI to run integration tests against staging on every PR. Add `STAGING_DB_URL` etc. as GitHub Actions secrets.

**0.5.5.** Verify a smoke test passes against staging:
```bash
STAGING=1 pnpm test:e2e
```

**0.5.6.** Commit any staging-specific config:
```bash
git add packages/api/seeds/staging-test-data.sql
git add infra/terraform/staging.tf  # if applicable
git commit -m "infra: provision staging environment per Dispatch 0"
```

---

## Step 0.6 — Set up visual baseline infrastructure

**0.6.1.** Install Playwright for the admin app:
```bash
cd apps/admin
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

**0.6.2.** Create `apps/admin/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './test-results',
  use: {
    baseURL: process.env.STAGING_ADMIN_URL ?? 'http://localhost:5173',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  retries: 2,
  workers: 4,
});
```

**0.6.3.** Install Maestro for mobile:
```bash
curl -Ls https://get.maestro.mobile.dev | bash
```

**0.6.4.** Create `apps/mobile/.maestro/visual/` directory structure for the 110 screen baselines (28 admin + 43 customer + 39 provider). The baselines themselves are populated as dispatches close — Dispatch 11 captures customer baselines, Dispatch 12 captures provider, etc.

**0.6.5.** Configure Git LFS for baseline images (they are large binaries):
```bash
git lfs install
git lfs track "apps/admin/tests/visual/baselines/**/*.png"
git lfs track "apps/mobile/.maestro/visual/baselines/**/*.png"
```

**0.6.6.** Commit:
```bash
git add apps/admin/playwright.config.ts apps/admin/tests/ apps/mobile/.maestro/ .gitattributes
git commit -m "test: install Playwright + Maestro visual testing infrastructure"
```

---

## Step 0.7 — Set up mutation testing

**0.7.1.** Install stryker:
```bash
cd packages/api
pnpm add -D @stryker-mutator/core @stryker-mutator/jest-runner @stryker-mutator/typescript-checker
```

**0.7.2.** Create `packages/api/stryker.config.json` per Part 4 §"Gate E."

**0.7.3.** Run stryker once against the existing codebase to baseline:
```bash
pnpm exec stryker run
```

The first run will take a long time (potentially hours on a large codebase). Save the baseline score. Phase 13 reported 99.3% on its surface; verify your run reproduces approximately that.

**0.7.4.** Document the baseline in `packages/api/MUTATION-BASELINE.md` with the score and date. Each dispatch will check that mutation score does not drop below 99% on the changed files.

**0.7.5.** Commit:
```bash
git add packages/api/stryker.config.json packages/api/MUTATION-BASELINE.md
git commit -m "test: install stryker mutation testing per Gate E"
```

---

## Step 0.8 — Final Dispatch 0 PR and merge

After all the above complete, the AI coder writes the closeout:

**0.8.1.** Write `.ai-coder/dispatches/D0-closeout.md`:

```markdown
# Dispatch 0 — Repo Prerequisites — Closeout

Branch: phase/14-d0-prerequisites
Final commit: <sha>
Tag: v0.14.0-d0-complete

## Outputs delivered

1. Phase 14 instruction package committed at `.ai-coder/phase-14/`
2. CLAUDE.md and `.ai-coder/EXECUTION-DISCIPLINE.md` at repo root and `.ai-coder/`
3. PHASE-14-ACKNOWLEDGMENT.md signed by AI coder
4. 15 gate scripts at `scripts/gates/`
5. CI workflow at `.github/workflows/gates.yml`
6. Branch protection configured by Ken (see step-0.4 file)
7. Staging environment provisioned (DB, S3, Redis, TLS)
8. Visual baseline infrastructure (Playwright + Maestro)
9. Mutation testing infrastructure (stryker)
10. Mutation baseline recorded: <N>% on existing main

## Expected gate failures on current main

Per `scripts/gates/EXPECTED-FAILURES.md`:
- Gate A: <list of failing fragments and which dispatch addresses each>
- Gate C: <list>

These are not blockers for Dispatch 0 itself; they are the bugs Phase 14 will fix.

## Files added: <count>
<list>

## Files modified: <count>
<list>

## Decision points surfaced for Ken
- Halt point 1 at step 0.3.5 (Dispatch 0 PR merge despite expected failures): <Ken's decision>
- Halt point 2 at step 0.4 (branch protection configured): <confirmation file>
- Halt point 3 at step 0.5 (staging credentials): <how resolved>

## Verification

- [ ] `bash scripts/gates/run-gate-a.sh` runs and produces output (failures expected per above)
- [ ] `bash scripts/gates/c-constitution.sh` runs and produces output
- [ ] `git push origin main` is rejected by branch protection (verified by Ken)
- [ ] CI runs on every PR (verified via test PR)
- [ ] Staging environment reachable at `staging.api.onservice.ph`
- [ ] Mutation testing produces a score (>= 95% baseline acceptable for Dispatch 0)

## Sign-off

- [ ] Ken — date / confirms all halt points resolved and Dispatch 0 outputs are real
```

**0.8.2.** Push and open the final Dispatch 0 PR.

**0.8.3.** Wait for Ken's review. Address any feedback.

**0.8.4.** When Ken merges Dispatch 0, create the marker file on main:
```bash
git checkout main && git pull
echo "$(date -Iseconds) — Dispatch 0 complete at <sha>" > .ai-coder/DISPATCH-0-COMPLETE
git add .ai-coder/DISPATCH-0-COMPLETE
git commit -m "chore: mark Dispatch 0 complete"
git push
```

The marker file is what triggers CLAUDE.md's decision tree to allow Dispatch 01 to begin.

---

## What Dispatch 0 does NOT include

To keep Dispatch 0 manageable, these are explicitly out of scope and handled later:

- **Production environment provisioning** — that is Dispatch 14.
- **NPC, BIR, DTI, Mayor's permit work** — Dispatch 14 operational items.
- **PayMongo merchant onboarding** — Dispatch 14.
- **Sentry production project** — Dispatch 14.
- **Domain registration and TLS for production** — Dispatch 14.
- **Filling in visual baselines for the 110 screens** — happens incrementally during Dispatches 01-12.
- **Fixing any of the 1,371 audit-found bugs** — that is the work of Dispatches 01-14.

Dispatch 0 only sets up the rails. The train runs in Dispatches 01-14.

---

## Time and cost estimate

| Step | Time | Cost |
|---|---|---|
| 0.1 — Read package + commit docs | 2 hours (AI coder reading) | $0 |
| 0.2 — Gate scripts | 2 hours | $0 |
| 0.3 — CI workflow | 1 hour | $0 (within free tier initially) |
| 0.4 — Branch protection (Ken) | 15 minutes | $0 |
| 0.5 — Staging environment | 4 hours + provisioning wait | $30-100/month ongoing |
| 0.6 — Visual baseline infra | 1 hour | $0 (Maestro free, Playwright free) |
| 0.7 — Mutation testing | 1 hour + first run hours | CI minutes (~$20/month) |
| 0.8 — Closeout and merge | 30 minutes | $0 |

**Total elapsed: 1-2 days** if running with focus. **Cost: $50-120/month** ongoing for staging + CI.

---

## After Dispatch 0

Once `.ai-coder/DISPATCH-0-COMPLETE` exists on main, the AI coder's next session detects it and begins Dispatch 01. The CLAUDE.md decision tree handles this automatically.

Welcome to Phase 14.
