# Phase 14 Remediation — Master Instruction for the AI Coder

**Audit performed:** 2026-04-30 against master HEAD `040baec` (post-D14 close)
**Audit method:** direct file inspection + code reading + runtime test execution. Closeouts and commit messages were NOT trusted; every claim was cross-referenced with actual code.
**Findings reference:** all numbered findings in this document map to the audit findings in `/home/claude/audit/FINDINGS.md`. Cite the finding number in commit messages so the audit chain stays clear.

---

## Standing rules for this remediation phase

These rules override prior dispatch doctrine where they conflict. Read them before starting work.

1. **No fallback. No deferral. No "v1.1 polish."** Every finding gets a complete fix that lands on master before any tag like `v1.0.0-launch-ready` is applied. If you genuinely cannot fix something (e.g., the `TODO_KEN_LEGAL_DISCLAIMER` requires Ken to provide attorney-reviewed wording), surface it with a decision file. Do not silently defer.

2. **Behavioral tests, not file-existence tests.** Every per-screen test renders the screen via React Testing Library (or Playwright for admin), simulates a real user interaction, and asserts on rendered output or a callback fired. No more `expect(exists('path/to/file.ts')).toBe(true)` style tests counting as bug-fix coverage.

3. **One bug, one test, one file.** Every claimed bug fix gets its own `it('Bug NNNN — <one-line behavior>', ...)` block. No comma-listed multi-bug test names. Gate B is being strengthened to enforce this — your tests will fail if you regress to comma-listed names.

4. **CI must run on master.** The first thing you fix is the CI workflow trigger. Until that's fixed, every claim about "all gates green" is unverifiable.

5. **Self-merge via the atomic relax-merge-restore pattern only.** Same pattern from Phase 14 dispatches. Do not skip branch protection.

6. **Tag every remediation phase.** `v0.14.1-remediation-1` after Finding #1 fixes land, `v0.14.1-remediation-2` after Finding #2, and so on. The tag chain is the audit record.

7. **Stop only on genuine Ken-only blockers.** The two confirmed Ken-only items are:
   - The `TODO_KEN_LEGAL_DISCLAIMER` wording (Finding #7) — requires attorney input
   - AWS staging credentials for D14 final cutover (already known)
   No other halts unless you hit a Stop 5 (spec-vs-schema conflict requiring Ken's architectural decision).

8. **Compact context as you go. Do not ask for fresh sessions.** This is the same instruction Ken gave at end of D06; it still applies. Push, commit, autoproceed.

---

## What's verified solid (do not touch)

These dispatches were audited by direct code inspection and verified to be working as claimed. Do not re-open, do not re-implement, do not "polish":

- D01 deploy blockers — Bug 175, 176, 261, 1235, 1061, 1251, 1325, 1271 (admin half) verified at code level
- D02 source-of-truth — Bug 1170 (cancellation policy + admin editor + 1-hour edit window), 1198, 1324 (brand color), 1185 (routes registry), 1323 (founding tier), 1271 (mobile axios) verified at code level
- D03 gate hardening — REPORT/BLOCKING tier system real, MODES.json structure correct
- D04 SiguradoShield pull — UI removed, gate enforces non-reintroduction, deprecated tables preserved
- D05 money trust closure — 12 client-money bugs verified, 3 attack scenarios real, server-canonical pricing real
- D06 transactional audit — escrow.service.ts and dispute.service.ts properly use db.transaction with FOR UPDATE locks
- D07 provider job trust — booking_photos + booking_signatures tables real, file:// URI rejection real, ≥2 after-photos enforcement real, 10 service categories seeded for checklist templates
- D08 NPC compliance — pii-mask.ts with role branching real, breach_log 72h SLA math real, granular marketing consent real
- D09 provider onboarding — provider_onboarding_progress state machine real
- D10 admin dispatch console — backup codes table real
- D13 feature decisions — promo + A/B feature flags actually gate UI in admin, mobile checkout has zero promo input
- D14 production cutover — 11 verifier scripts hit real APIs, runbook has 12 items × Steps/Verification/Sign-off

API runtime confirmed: 1559 of 1559 jest tests pass when run locally. API + Admin TypeScript: zero errors.

---

## What needs fixing — ten findings, in execution order

Execute these findings IN ORDER. Each finding's fix produces its own PR + tag. After all ten are merged, the work is done.

---

### Finding #1: CI workflow doesn't run on master

**Why first:** Every other fix is unverifiable until CI actually runs on master PRs.

**The problem:**
`.github/workflows/ci.yml` triggers only on `branches: [main, develop]`. The repo's default branch is `master`. Phase 14 PRs were all against master. CI's API tests + admin typecheck + mobile typecheck + Docker build never ran for any Phase 14 PR. Only the 5 custom phase-14 gates ran. When closeouts said "all 5 gates green," they meant only the 5 custom gates.

**The fix:**

Edit `.github/workflows/ci.yml` lines 4-7 from:
```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

To:
```yaml
on:
  push:
    branches: [master, main, develop]
  pull_request:
    branches: [master, main, develop]
```

**Verification:**
Open a test PR (e.g., a comment-only change to README) against master. Confirm the `CI` workflow runs and all four jobs (api-check, admin-check, mobile-check, docker-build) execute. Tag this fix as `v0.14.1-remediation-1`.

**Branch:** `phase/14r-1-ci-trigger-fix`

---

### Finding #2: Mobile dependencies missing — Bug 1061's fix doesn't typecheck

**Why second:** This blocks the mobile-check CI job that Finding #1 just enabled.

**The problem:**
`apps/mobile/src/services/secure-storage.ts` (Bug 1061's encrypted MMKV fix) imports `expo-secure-store`. `apps/mobile/src/services/__tests__/auth-migration.test.ts` (Bug 1061's test) uses jest globals `it()` and `expect()`. Neither package is in `apps/mobile/package.json` or `package-lock.json`. Result: `npx tsc --noEmit --project apps/mobile/tsconfig.json` returns 318 errors. After Finding #1 lands, this will fail CI on every PR.

**The fix:**

Edit `apps/mobile/package.json`. Add to `dependencies`:
```json
"expo-secure-store": "~14.0.0"
```
(Use the version that aligns with the rest of the Expo SDK 55 deps; pick whatever Expo's compatibility matrix says for `react-native-mmkv` and `react-native ~0.81.x`.)

Add to `devDependencies`:
```json
"@types/jest": "^30.0.0"
```

Run `npm install --legacy-peer-deps` from the repo root.

Run `npx tsc --noEmit --project apps/mobile/tsconfig.json`. Errors should drop from 318 to a small handful or zero. Fix any remaining real type errors (not just install-related ones) — they may be real type bugs that 318 noise was hiding.

**Verification:**
- `cd apps/mobile && npx tsc --noEmit` returns zero errors
- `git push` triggers the now-active mobile-check CI job; it passes
- Tag as `v0.14.1-remediation-2`

**Branch:** `phase/14r-2-mobile-deps`

---

### Finding #3: Maestro mobile visual flows don't exist (0 of 82 mobile screens)

**Why third:** The largest and most visible test gap. Drives Findings #4 and #5 to closure.

**The problem:**
D11 closeout claimed visual baseline directories at `apps/mobile/.maestro/visual/customer/` (43 flows) and `apps/mobile/.maestro/visual/provider/` (39 flows). Both directories DO NOT EXIST. Zero Maestro flows authored across all 82 mobile screens. Gate D vacuously passes when directories are empty.

**The fix:**

This is a real implementation task. Author all 82 Maestro flows + capture baselines. Per `apps/mobile/.maestro/visual/README.md`:

1. Create directories:
   ```
   apps/mobile/.maestro/visual/customer/
   apps/mobile/.maestro/visual/provider/
   apps/mobile/.maestro/visual/baselines/customer/
   apps/mobile/.maestro/visual/baselines/provider/
   ```

2. Map each catalogued screen in `.ai-coder/phase-14/SCREEN-CATALOG-PART-2B-MOBILE-CUSTOMER.md` to a numbered Maestro flow file `apps/mobile/.maestro/visual/customer/NNN-<screen-slug>.yaml`. There are 43 customer screens per the catalog.

3. Same for `SCREEN-CATALOG-PART-2C-MOBILE-PROVIDER.md` — 39 provider flows.

4. Each flow exercises **all 4 required states** per Design Contract V2 §8: loading skeleton, empty state with CTA, error state with retry, success state. Use `takeScreenshot: <screen>/<state>` to capture each.

5. Each flow runs against **3 viewports** per Design Contract V2 §12: iPhone SE (375×667), iPhone 14 (390×844), Pixel 6 (411×891). Use Maestro's `--device` flag at runtime; baselines are device-tagged in the filename.

6. Flow template (use this exact structure):
   ```yaml
   appId: com.onservice.app
   ---
   - launchApp: { clearState: true }
   # Loading state
   - launchApp: { clearState: true, stopApp: false }
   - takeScreenshot: customer/<slug>/loading
   # Wait + assert empty/CTA visible
   - assertVisible: "<expected-empty-state-text>"
   - takeScreenshot: customer/<slug>/empty
   # Trigger error path (offline mode or invalid input)
   - runScript: scripts/maestro/force-error.sh
   - takeScreenshot: customer/<slug>/error
   # Recover to success
   - runScript: scripts/maestro/seed-success.sh
   - takeScreenshot: customer/<slug>/success
   ```

7. Configure Git LFS for the baselines:
   ```bash
   git lfs track "apps/mobile/.maestro/visual/baselines/**/*.png"
   git add .gitattributes
   git commit -m "chore: configure Git LFS for Maestro baselines"
   ```

8. Capture all 82 × 4 states × 3 viewports = 984 baseline PNGs by running each flow against the local Docker stack from `bash scripts/dev/up.sh`.

9. After all flows + baselines exist:
   - Set `gate_d_state.mode` to `BLOCKING` in `scripts/gates/MODES.json`
   - Set `gate_d_state.promoted_in` to `"D14r-3"`
   - Update `gate_d_state.rationale` to: "Promoted to BLOCKING in D14r-3. 43 customer + 39 provider Maestro flows authored with 4-state × 3-viewport baselines. PR re-runs every flow against the Docker stack and fails on visual diff."

10. Install Maestro CLI in the gates CI workflow if not already present:
    ```yaml
    - name: Install Maestro
      run: |
        curl -Ls "https://get.maestro.mobile.dev" | bash
        echo "$HOME/.maestro/bin" >> $GITHUB_PATH
    ```

**Verification:**
- `find apps/mobile/.maestro/visual/customer -name "*.yaml" | wc -l` returns 43
- `find apps/mobile/.maestro/visual/provider -name "*.yaml" | wc -l` returns 39
- `find apps/mobile/.maestro/visual/baselines -name "*.png" | wc -l` returns ≥984
- `bash scripts/gates/d-visual-screenshots.sh` actually invokes Maestro (not skips)
- `jq '.gate_d_state.mode' scripts/gates/MODES.json` returns `"BLOCKING"`
- Tag as `v0.14.1-remediation-3`

**Branch:** `phase/14r-3-maestro-flows`

**Important:** This is genuinely large work. Authoring 82 Maestro flows that exercise all 4 states could take several full sessions. Do not split this into "framework now, flows v1.1." Author every flow. If you need to compact context mid-task, do it.

---

### Finding #4: Admin Playwright visual baseline tests don't exist (0 of 28 admin pages)

**Why fourth:** Same shape as Finding #3, smaller scope.

**The problem:**
D07 closeout claimed 28 admin pages would get baseline tests in `apps/admin/tests/visual/`. Directory has only a README. Zero `.spec.ts` files.

**The fix:**

1. Author 28 Playwright spec files at `apps/admin/tests/visual/<page-slug>.spec.ts`, one per admin page per `SCREEN-CATALOG-PART-2A-ADMIN.md`.

2. Each spec captures **4 states** (loading, empty, error, success) at **3 viewport widths** (1280, 1440, 1920) per Design Contract V2.

3. Spec template:
   ```ts
   import { test, expect } from "@playwright/test";

   test.describe("DashboardPage", () => {
     for (const width of [1280, 1440, 1920]) {
       test.describe(`@${width}`, () => {
         test.use({ viewport: { width, height: 800 } });

         test("loading state", async ({ page }) => {
           await page.route("**/api/v1/admin/**", (route) => {
             setTimeout(() => route.continue(), 5000);
           });
           await page.goto("/dashboard");
           await expect(page.locator("[data-testid=skeleton]")).toBeVisible();
           await expect(page).toHaveScreenshot(`dashboard-loading-${width}.png`);
         });

         test("empty state", async ({ page }) => {
           await page.route("**/api/v1/admin/dashboard", (route) => {
             route.fulfill({ json: { metrics: [], bookings: [] } });
           });
           await page.goto("/dashboard");
           await expect(page.locator("[data-testid=empty-state]")).toBeVisible();
           await expect(page).toHaveScreenshot(`dashboard-empty-${width}.png`);
         });

         test("error state", async ({ page }) => {
           await page.route("**/api/v1/admin/dashboard", (route) => {
             route.fulfill({ status: 500, json: { error: "server_error" } });
           });
           await page.goto("/dashboard");
           await expect(page.locator("[data-testid=error-state]")).toBeVisible();
           await expect(page).toHaveScreenshot(`dashboard-error-${width}.png`);
         });

         test("success state", async ({ page }) => {
           await page.goto("/dashboard");
           await expect(page.locator("[data-testid=metrics]")).toBeVisible();
           await expect(page).toHaveScreenshot(`dashboard-success-${width}.png`);
         });
       });
     }
   });
   ```

4. Configure Git LFS for admin baselines:
   ```bash
   git lfs track "apps/admin/tests/visual/baselines/**/*.png"
   ```

5. Capture all 28 × 4 × 3 = 336 baseline PNGs:
   ```bash
   cd apps/admin && pnpm exec playwright test tests/visual --update-snapshots
   ```

6. Commit baselines via LFS.

**Verification:**
- `find apps/admin/tests/visual -name "*.spec.ts" | wc -l` returns 28
- `find apps/admin/tests/visual -name "*.png" | wc -l` returns ≥336
- `cd apps/admin && pnpm exec playwright test` runs all 28 specs, exits 0
- Tag as `v0.14.1-remediation-4`

**Branch:** `phase/14r-4-admin-playwright`

---

### Finding #5: D11 components built but used by 0 screens

**Why fifth:** This is the largest concrete UX gap — the polish dispatches' work is invisible to users because no screen imports the components.

**The problem:**
D11 ships 8 cross-cutting components (ConfirmModal, FilterChips, FilterModal, PhoneInput, StatusBadge, PaginationLoader, Avatar, PulsingDot) plus 2 lib helpers (i18n, toast) plus 2 hooks (useDebouncedValue, useSocketRoom). Direct grep across `apps/mobile/app/`:

- ConfirmModal: 0 screens import it
- FilterChips, FilterModal, PhoneInput, StatusBadge, PaginationLoader, Avatar, PulsingDot: 0 screens each
- i18n shim: 0 screens
- toast helper: 0 screens
- useDebouncedValue, useSocketRoom: 0 files

D12 same pattern: NbiStatusBanner, CommissionBreakdown, EarningsChart, useStatusMutation, useAppState — all 0 screens.

**The fix:**

For each of the 13 D11 + 6 D12 components/lib/hooks, identify the target screens per the closeout's bug claims and wire them in.

**D11 wiring targets** (read `.ai-coder/dispatches/D11-closeout.md` for the bug-to-screen mapping; below is the canonical wiring per Phase 14 spec):

- **ConfirmModal** → wire into every destructive action confirmation:
  - `apps/mobile/app/customer/booking/[id].tsx` (cancel booking)
  - `apps/mobile/app/customer/account-management.tsx` (delete account, sign out)
  - `apps/mobile/app/customer/data-rights.tsx` (submit DSR)
  - `apps/mobile/app/customer/addresses.tsx` (delete address)
  - `apps/mobile/app/provider/job/[id]/photos.tsx` (delete photo)
  - `apps/mobile/app/provider/portfolio.tsx` (delete portfolio item)
  - All other destructive flows per audit

- **FilterChips + FilterModal** → wire into:
  - `apps/mobile/app/(tabs)/bookings.tsx` (filter by status)
  - `apps/mobile/app/(tabs)/wallet.tsx` (filter by transaction type)
  - `apps/mobile/app/(provider-tabs)/jobs.tsx`
  - `apps/mobile/app/(provider-tabs)/earnings.tsx`

- **PhoneInput** → wire into:
  - `apps/mobile/app/auth/login.tsx`
  - `apps/mobile/app/auth/register.tsx`
  - `apps/mobile/app/customer/account-management.tsx` (phone edit)
  - `apps/mobile/app/provider/settings.tsx` (phone edit)

- **StatusBadge** → wire into every booking-status renderer:
  - `apps/mobile/app/(tabs)/bookings.tsx` list rows
  - `apps/mobile/app/customer/booking/[id].tsx` header
  - `apps/mobile/app/(provider-tabs)/jobs.tsx` list rows
  - `apps/mobile/app/provider/job/[id].tsx` header

- **PaginationLoader** → wire into all paginated lists:
  - `apps/mobile/app/(tabs)/bookings.tsx`
  - `apps/mobile/app/(tabs)/wallet.tsx`
  - notifications screen
  - `apps/mobile/app/customer/booking/[id]/messages.tsx` (chat thread)

- **Avatar** → wire wherever a user/provider avatar shows:
  - Header bars on tabs screens
  - Booking detail (provider avatar)
  - Provider profile detail
  - Chat thread bubbles

- **PulsingDot** → wire into "live" indicators:
  - Provider en-route on tracking map
  - GPS broadcasting indicator
  - Booking status updating

- **i18n shim** → ALL user-facing copy in mobile must be `t('namespace.key')`. Replace inline strings progressively per screen. At minimum: auth screens, payment flows, error messages, status text. Add Tagalog and English locale catalogs at `apps/mobile/src/lib/locales/{en,tl}/*.json`.

- **toast helper** → All transient feedback (success messages, error toasts, OTP-resent confirmations) goes through `showToast()`. No more `Alert.alert()` for non-blocking feedback.

- **useDebouncedValue** → wire into search inputs (provider search on customer side, booking search in admin side via separate fix)

- **useSocketRoom** → wire into chat thread (`apps/mobile/app/customer/booking/[id]/messages.tsx`) and tracker (`apps/mobile/app/customer/booking/tracker.tsx`)

**D12 wiring targets:**

- **NbiStatusBanner** → wire into `apps/mobile/app/(provider-tabs)/dashboard.tsx` and `apps/mobile/app/provider/certifications.tsx` to show NBI expiring/expired states

- **CommissionBreakdown** → wire into `apps/mobile/app/(provider-tabs)/earnings.tsx` per-job rows + `apps/mobile/app/provider/job/[id]/complete.tsx` post-complete summary

- **EarningsChart** → wire into `apps/mobile/app/(provider-tabs)/earnings.tsx` (daily/weekly/monthly toggles)

- **useStatusMutation** → wire into `apps/mobile/app/provider/job/[id].tsx` (status transition buttons trigger haptic feedback)

- **useAppState** → wire into `apps/mobile/app/_layout.tsx` to track foreground/background for the 15-minute GPS auto-off check that already lives in `useJobGpsBroadcast`

**For each component wiring:** open the screen, import the component, replace the inline equivalent with the component, ensure the screen still compiles. Add a `// Bug NNNN` comment referencing the audit ID at the wiring site so Gate B can verify.

**Verification:**
- For each of the 13 + 6 components/hooks, run `grep -rln "from.*<ComponentName>" apps/mobile/app | wc -l`. Each must return ≥1 (and most should return ≥3 since many are wired into multiple screens).
- After wiring, the strengthened Gate B from Finding #6 must pass.
- Tag as `v0.14.1-remediation-5`

**Branch:** `phase/14r-5-component-wiring` (split into 2 PRs if scope is too large: D11 wiring + D12 wiring)

---

### Finding #6: D11/D12 test density gap (133 of 163 polish bugs untested)

**Why sixth:** With Findings #3, #4, #5 establishing real visual + behavioral testing infrastructure, this is the bug-by-bug closure.

**The problem:**
- D11 closeout claims 86 customer bug fixes. Test file references only 14 unique bug numbers across 30 `it()` blocks. **72 of 86 (84%) untested.**
- D12 closeout claims 77 provider bug fixes. Test file references only 16 unique bug numbers. **61 of 77 (79%) untested.**
- Combined: 133 of 163 polish bugs (82%) claimed-fixed-without-test. Gate B parses the closeout's claim list, not the test file's actual references — so Gate B passed.

**The fix:**

Open `.ai-coder/dispatches/D11-closeout.md` and `.ai-coder/dispatches/D12-closeout.md`. Extract the full bug list (86 + 77 = 163 bugs). For each one:

1. Read the bug description to understand the behavior it claims to fix.
2. Identify which screen the bug applies to (the closeout has the screen reference).
3. Open the screen file. Verify the fix is real (not just the component-not-wired case from Finding #5 — that's resolved by F#5).
4. Write a behavioral test in `apps/mobile/__tests__/d11-customer-polish.test.ts` (for D11 bugs) or `d12-provider-polish.test.ts` (for D12 bugs). Test name MUST be `Bug NNNN — <one-line behavior>` with no comma-listed multi-bug names.
5. The test renders the screen via `react-native-testing-library` (or a unit-level helper render where appropriate), simulates the user interaction the bug pertains to, and asserts on the rendered output.

Strengthen Gate B (`scripts/gates/b-bug-deferral.sh`) to enforce one-test-per-claimed-bug. Add a check:

```bash
# For each Bug NNNN claimed in any closeout, verify a matching test exists
for closeout in .ai-coder/dispatches/D*-closeout.md; do
  for bug in $(grep -oE "Bug [0-9]+" "$closeout" | sort -u | grep -oE "[0-9]+"); do
    if ! grep -rq "Bug $bug" apps/mobile/__tests__ apps/admin/src packages/api/__tests__ 2>/dev/null; then
      echo "Gate B FAILED: $closeout claims Bug $bug fixed but no test references it"
      exit 1
    fi
  done
done
```

After Gate B is strengthened and the 163 missing tests are written, the gate must pass.

**Verification:**
- `grep -oE "Bug [0-9]+" apps/mobile/__tests__/d11-customer-polish.test.ts | sort -u | wc -l` returns ≥86
- Same for d12-provider-polish.test.ts returns ≥77
- Strengthened Gate B passes locally and in CI
- Tag as `v0.14.1-remediation-6`

**Branch:** `phase/14r-6-test-density`

---

### Finding #7: Per-screen behavioral + visual coverage matrix

**Why seventh:** The 113-surface comprehensive coverage you (Ken) explicitly asked for.

**The problem:**
113 surfaces (84 mobile screens + 29 admin pages) total. Current state:
- 0 have behavioral tests at the per-screen level
- 0 have visual tests
- 0 have screenshot baselines
- Only 17 (15%) have any Phase 14 bug reference at all

Findings #3 and #4 establish the visual layer. Finding #6 establishes per-bug behavioral coverage in the polish files. This finding adds the per-screen behavioral baseline: each of the 113 screens gets at least 5 behavioral tests covering: render, primary user action, error path, loading state, accessibility (a11y).

**The fix:**

For each of the 113 screens, write a behavioral test file:

- Mobile: `apps/mobile/__tests__/screens/<screen-slug>.test.tsx`
- Admin: `apps/admin/src/pages/__tests__/<page-slug>.test.tsx`

Each test file has minimum 5 `it()` blocks:

1. `renders without crashing` — assert the screen mounts and shows its primary heading
2. `<primary user action>` — simulate the most-common user interaction, assert state change or callback
3. `error state` — mock the API to return 5xx, assert error UI shows
4. `loading state` — mock the API to delay, assert loading UI shows
5. `accessibility` — use `jest-axe` for admin (already installed per D08) or `@testing-library/react-native` + axe rules for mobile, assert no violations

For screens with more than 5 distinct user actions (e.g., booking checkout has: select payment method, apply promo, edit address, confirm, cancel), add tests for each. Aim for at least 10 tests per screen for high-complexity screens (booking flow, provider job flow, admin pages with tabs).

**Counting:**
- Minimum: 5 tests × 113 screens = 565 new tests
- Target: 10 tests × 113 screens = 1130 new tests (matches Ken's standard)
- Combined with existing 1559 API tests: total project test count reaches ~2700

**Verification:**
- `find apps/mobile/__tests__/screens -name "*.test.tsx" | wc -l` returns ≥84
- `find apps/admin/src/pages/__tests__ -name "*.test.tsx" | wc -l` returns ≥29
- Total project test count ≥ 2200 (1559 API + 565 minimum new screen tests)
- Tag as `v0.14.1-remediation-7`

**Branch:** `phase/14r-7-per-screen-tests`

---

### Finding #8: Gates D, E, no-console, no-emoji never promoted to BLOCKING

**Why eighth:** With the testing infrastructure in place (Findings #3-7), now promote the gates that watch over it.

**The problem:**
`scripts/gates/MODES.json` shows these gates still in REPORT mode (`promoted_in: null`):
- `gate_d_state` (visual screenshots)
- `gate_e_state` (mutation testing)
- `article-4.2-no-console`
- `article-4.6-no-emoji`
- `a-cross-source-no-emoji-icons`

**The fix:**

After Findings #3, #4, and #5 land, all the underlying code is ready. Apply these MODES.json updates:

1. Set `gate_d_state.mode` to `"BLOCKING"`, `promoted_in: "D14r-3"`, rationale references the 82 Maestro flows + 28 Playwright specs.

2. For `gate_e_state`: run mutation testing against current `packages/api/`:
   ```bash
   cd packages/api && pnpm exec stryker run --reporters json,clear-text
   ```
   Fix tests until score ≥ 99% (the threshold in `scripts/gates/e-mutation-testing.sh`). Then set `gate_e_state.mode` to `"BLOCKING"`, `promoted_in: "D14r-8"`.

3. For `article-4.2-no-console`: grep production code for `console.*`:
   ```bash
   grep -rn "console\.\(log\|info\|debug\|warn\|error\)" apps/admin/src apps/mobile/src apps/mobile/app packages/api/src \
     --include="*.ts" --include="*.tsx" \
     | grep -v "__tests__" | grep -v "scripts/" | grep -v "logger\." | wc -l
   ```
   Replace each occurrence with the project's logger (`logger.info` / `logger.error`) or remove if dev-only. Set `article-4.2-no-console.mode` to `"BLOCKING"`, `promoted_in: "D14r-8"`.

4. For `article-4.6-no-emoji` and `a-cross-source-no-emoji-icons`: grep for emoji unicode in tsx/ts files, replace with `lucide-react` icons. Per Phase 13 baseline: 1089 absolute / 412 introduced. Touch every occurrence. Set both gates to `"BLOCKING"`, `promoted_in: "D14r-8"`.

**Verification:**
- `jq '.gate_d_state.mode' scripts/gates/MODES.json` returns `"BLOCKING"`
- Same for `gate_e_state`, `article-4.2-no-console`, `article-4.6-no-emoji`, `a-cross-source-no-emoji-icons`
- A test PR adding a `console.log` to `packages/api/src/server.ts` fails Gate C
- A test PR adding an emoji to a Tailwind className fails Gate A
- Tag as `v0.14.1-remediation-8`

**Branch:** `phase/14r-8-gate-promotion`

---

### Finding #9: 80 of 91 mobile screens + 22 of 29 admin pages never touched by Phase 14

**Why ninth:** With Findings #5 (component wiring) and #7 (per-screen tests) done, this becomes a verification step rather than additional work. List it explicitly so the audit chain shows it was addressed.

**The problem:**
Only 11 of 91 mobile screens and 7 of 29 admin pages contain any Phase 14 `Bug NNNN` reference in source. Per Ken's standard, every screen should have been audited and touched.

**The fix:**

This finding is mostly closed by Findings #5 + #7 — wiring components and adding per-screen tests touches every screen with a `// Phase 14 remediation — Bug NNNN` comment marker. After F#5 and F#7 land, run:

```bash
grep -rln "Bug [0-9]\{2,4\}" apps/mobile/app | wc -l
grep -rln "Bug [0-9]\{2,4\}" apps/admin/src/pages | wc -l
```

Both numbers should now be ≥60 and ≥20 respectively.

For any screen still untouched after F#5 + F#7: open the file, read it, audit for issues against Design Contract V2 §22-item-checklist, document each finding as a new bug with a Bug ID, fix it, add a test. Add the comment marker `// Phase 14 remediation — audited` so future grep confirms the screen was reviewed.

**Verification:**
- Every screen in `apps/mobile/app/` and `apps/admin/src/pages/` has at least one `// Phase 14 remediation` comment marker
- Tag as `v0.14.1-remediation-9`

**Branch:** `phase/14r-9-screen-audit-completion`

---

### Finding #10: TODO_KEN_LEGAL_DISCLAIMER placeholder in 3 user-facing screens

**Why last:** This is the only Ken-blocked item. Surface it but do not block other findings on it.

**The problem:**
Three customer-facing screens contain literal text `'TODO_KEN_LEGAL_DISCLAIMER — Ken supplies the exact wording per the §legal-language section of the D04 decision file.'` This renders to actual users:
- `apps/mobile/app/customer/terms.tsx:56` — Terms of Service Section 6
- `apps/mobile/app/customer/help.tsx:70` — Help screen FAQ answer about insurance/protections
- `apps/mobile/app/customer/safety-and-support.tsx:101` — Safety & Support screen Q&A

**The fix:**

Two paths, in priority order:

**Path A (preferred): Ken provides attorney-reviewed wording.**

Ken hires a Philippine business attorney for a one-time legal review (~₱5K-15K). The attorney drafts the no-insurance disclaimer covering: (a) onService PH is a marketplace, not an insurance provider; (b) explicit list of platform protections (NBI verification, escrow, 48-hour dispute window); (c) recommendation that customers maintain their own homeowner/renter insurance.

Once Ken provides the wording, replace all 3 `TODO_KEN_LEGAL_DISCLAIMER` placeholders with the real text.

**Path B (interim, if Path A is blocked):**

Use this attorney-reviewable interim wording (still requires Ken's lawyer sign-off before going live):

```
onService PH is a marketplace connecting customers with independent service
providers. We do not provide insurance coverage for property damage, personal
injury, or service disputes.

Our platform protections include:
- NBI clearance verification for every provider before activation
- Escrow payment held until service completion
- Masked phone numbers between customer and provider
- 48-hour dispute window with platform-mediated resolution
- Provider rating accountability — providers below 4.0 stars after 20 jobs
  face suspension review

For loss or damage that exceeds these protections, customers should maintain
their own homeowner's or renter's insurance. The provider, as an independent
contractor, is responsible for any property damage they cause; customers may
pursue claims directly against the provider through our dispute process.
```

In either path, add a CI guard to prevent placeholder regression:

Add `apps/mobile/__tests__/no-todo-placeholders.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';

describe('No TODO placeholder in user-facing copy', () => {
  it('no TODO_KEN_LEGAL_DISCLAIMER anywhere in apps/', () => {
    const root = path.resolve(__dirname, '../..');
    const customerDir = path.join(root, 'app/customer');
    const files = fs.readdirSync(customerDir, { recursive: true })
      .filter(f => typeof f === 'string' && /\.(tsx?|md)$/.test(f));
    for (const f of files) {
      const content = fs.readFileSync(path.join(customerDir, f as string), 'utf-8');
      expect(content).not.toMatch(/TODO_KEN_LEGAL_DISCLAIMER/);
    }
  });
});
```

**Verification:**
- `grep -rn "TODO_KEN_LEGAL_DISCLAIMER" apps/mobile apps/admin` returns zero results
- The CI guard test passes
- Tag as `v0.14.1-remediation-10`

**Branch:** `phase/14r-10-legal-disclaimer`

---

## Final tag and launch readiness

After all 10 findings are merged with their tags `v0.14.1-remediation-1` through `v0.14.1-remediation-10`, apply tag `v0.14.1-audit-clean` to the master HEAD.

Then continue with the original D14 launch readiness work (the 12 operational items in the runbook). When all 12 are signed off, apply `v1.0.0-launch-ready` per the runbook.

The launch readiness path is unchanged from D14's runbook. This remediation phase ensures the audit chain is honest before launch — that "all gates green" actually means everything green, that "tests cover all bugs" is structurally enforced, and that no user opens the app to see a `TODO_KEN_LEGAL_DISCLAIMER` placeholder.

---

## Estimated scope

This remediation phase is large but bounded:

| Finding | Work shape | Estimated AI coder hours |
|---|---|---|
| #1 CI trigger | one-line edit + test PR | 0.5 |
| #2 Mobile deps | dependency adds + typecheck cleanup | 1-2 |
| #3 Maestro flows | 82 flows + 984 baselines + LFS | 30-60 |
| #4 Playwright specs | 28 specs + 336 baselines + LFS | 10-15 |
| #5 Component wiring | 19 components × 3-5 screens each | 15-25 |
| #6 Test density | 163 missing per-bug tests | 25-40 |
| #7 Per-screen baseline | 565 minimum new tests across 113 screens | 60-100 |
| #8 Gate promotion | mutation cleanup + console + emoji + MODES.json | 8-15 |
| #9 Untouched screens | mostly resolved by F#5+F#7; verification pass | 5-10 |
| #10 Legal disclaimer | Ken-provided wording + CI guard | 0.5 + Ken |
| **Total** | | **155-272 hours** |

This is the "do it right, no fallback" cost. The previous "v1.1 deferral" framing avoided most of this work; you've explicitly rejected that framing.

The AI coder runs autonomously through these. Each finding's PR self-merges via the atomic relax-merge-restore pattern. Compact context as needed; do not stop for fresh sessions.

Ken is on the hook for: the legal disclaimer wording (Finding #10), occasional review of completed findings, and AWS staging credentials when D14 final cutover is reached.

---

## How to begin

Paste this entire document's "10 findings, in execution order" section to the AI coder. Add this kickoff line:

> Begin Phase 14 Remediation. Read `/mnt/user-data/outputs/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md`. Execute the 10 findings in order. Self-merge each via the atomic relax-merge-restore pattern. Tag each remediation. Continue autonomously through all 10. Halt only on Finding #10's legal disclaimer requiring my wording, or on a genuine Stop 5 spec-vs-schema conflict.

Then watch for:
- The 10 tag creations on master (one per finding)
- The final `v0.14.1-audit-clean` tag
- The Finding #10 halt asking for legal disclaimer wording

After Finding #10 closes, continue with the D14 operational items per `docs/runbooks/launch-cutover.md`. Apply `v1.0.0-launch-ready` when all 12 operational items are signed off.

