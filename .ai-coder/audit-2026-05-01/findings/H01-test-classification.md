# Phase H Findings Part 1 — Test classification (every one of 218 test files)

## Method

Every test file in `packages/api/__tests__/`, `apps/admin/src/**/__tests__/`, `apps/mobile/__tests__/`, `apps/mobile/src/services/__tests__/` was scanned for signature patterns:

- `readFileSync` count (source-content-regex indicator)
- `render(` count (component render indicator)
- `it.todo` / `test.todo` count (skipped-test indicator)
- `.toMatch(` count (regex assertion — paired with readFileSync = source-regex smell)
- `.toBe(` count (value equality assertion — paired with imports = real behavioral)
- `describe(` and `it(`/`test(` counts
- `from '../src/'` imports (real-code import indicator)

The full per-file signature TSV is at [.ai-coder/audit-2026-05-01/phase-H-tests/test-signatures.tsv](.ai-coder/audit-2026-05-01/phase-H-tests/test-signatures.tsv).

The full per-file bucket TSV is at [.ai-coder/audit-2026-05-01/phase-H-tests/buckets.tsv](.ai-coder/audit-2026-05-01/phase-H-tests/buckets.tsv).

I spot-read 7 files in full to confirm bucketing heuristics: `bookings-page.real.test.tsx`, `customer-booking-checkout.real.test.tsx`, `auth-login.real.test.tsx`, `escrow-money-conservation.test.ts`, `d07-encompassed-bugs.test.ts` (already partially read), `proof/login.dom.test.tsx`, `proof/status-badge.dom.test.tsx`, `admin-a11y-baseline.test.tsx`. Plus the d08/d09/d10 grep heads. The signature heuristics matched the actual file content in every spot-check.

**218 test files, ~36,621 lines of test code. Final bucket counts:**

| Bucket | Files | What it means |
|---|---:|---|
| **SRC-REGEX** (F#7 audit smell) | **25** | `readFileSync(source) + expect(content).toMatch(/Bug NNNN/)`. Tests source-file content, not behavior. |
| **SHALLOW** (R7-real fallback) | **114** | `render()` with 3 shallow assertions (mounts / has-children / valid-root tag). When pre-render fails, falls through to `it.todo`. |
| **REAL-UNIT** | **74** | Imports real services/validators/utils, mocks dependencies, asserts on actual computed values or thrown errors. |
| **REAL-RENDER** | **4** | Renders a real component, fires real events, asserts on real rendered text + ARIA. |
| **MIXED (REAL-RENDER + STUB)** | **1** | `d11-customer-polish-real.test.tsx` — 12 real assertions + 24 it.todo. ~33% real. |

(218 = 25 + 114 + 74 + 4 + 1 ✓)

---

## TL;DR for Ken

The test suite is two-thirds theatre. Specifically:

- **25 files (~3,000 lines) are pure source-content regex tests.** They `readFileSync()` a service file or migration and assert that the file contains a specific string ("Bug 36", "function name", "CHECK constraint"). They satisfy a CI "Gate B reference coverage" rule that demands every claimed-fixed bug have a "test reference." If a developer removes the comment "Bug 36" from a file, these tests break — even though the behavior is unchanged. If a developer changes the actual behavior (escapes the file:// validation that Bug 36 closed), these tests still pass. **Delete and replace with real behavioral tests.**

- **114 files (~14,000 lines) are R7-real "render but barely assert" tests.** They mount each admin page or mobile screen via `@testing-library/react`, then assert (a) it didn't throw, (b) the container has children, (c) the root tag is in a regex of valid HTML/RN tags. **None of these tests would catch any of the 152 CRITs found in Phases A-G** — none assert on role gates, money calculations, status enums, error handling, or any specific behavior. When the page can't render under default mocks (because it needs route params, fetched data, or a logged-in user), the assertions fall through to `it.todo` with the actual error captured as the reason. The test suite shows green even when 80% of assertions are todos. **Augment, don't delete** — the smoke-render-compile check is non-trivial and should stay, but each of these 114 files needs paired per-feature happy-path tests that mock data and assert specific behavior.

- **74 files (~14,000 lines) are real behavioral unit tests.** Validators, services, money math (escrow, commission, cancellation), state machines, business-account transactions. **These are valuable and should stay** — they protect the money paths and core domain logic. Some are huge and well-structured (`booking-dispute-admin.test.ts` is 1,032 lines / 82 it() blocks; `financial-bir-admin.test.ts` is 1,585 lines / 93 it() blocks).

- **4 files (~250 lines) are real DOM-render tests with behavioral assertions.** `admin-a11y-baseline.test.tsx` (jest-axe a11y patterns), `proof/login.dom.test.tsx` (fires events, asserts validation error appears), `proof/status-badge.dom.test.tsx` (asserts rendered text + aria-label per status), `d11-customer-polish-real.test.tsx` (mixed — 12 real assertions). **Use these as the gold-standard template for the per-feature tests that the 114 SHALLOW files need to grow into.**

The runtime-evidence layer (Playwright + Maestro + Docker + DB-state-diff per step) the brief asks for **does not exist at all.** The codebase has F#3 Maestro YAML scaffolding (84 flows committed, baselines NOT captured) and F#4 Playwright spec scaffolding (29 specs committed, baselines NOT captured) per CLAUDE.md. The runner that boots Docker, executes flows, captures screenshots + network + DB diffs is not in the repo.

---

## CRITICAL bugs (continuing numbering after CRIT-153)

### CRIT-154 — 25 test files are F#7-smell source-content regex tests; CI "Gate B reference coverage" rule demands them
**Files (all 25):**

| File | Lines | Notes |
|---|---:|---|
| packages/api/__tests__/d07-encompassed-bugs.test.ts | 98 | "encompassed bugs" — readFileSync + toMatch(/Bug NN/) |
| packages/api/__tests__/d08-encompassed-bugs.test.ts | 217 | same pattern × 8 bugs |
| packages/api/__tests__/d09-encompassed-bugs.test.ts | 86 | same pattern × 6 bugs |
| packages/api/__tests__/d10-encompassed-bugs.test.ts | 115 | same pattern × 6 bugs |
| packages/api/__tests__/d13-feature-flags.test.ts | 105 | self-admits "Static-content tests assert the wiring landed; integration is verified by code review" |
| packages/api/__tests__/d14-cutover-harness.test.ts | 133 | readFileSync of cutover docs |
| packages/api/__tests__/brand-color-bug-1324.test.ts | 83 | readFileSync of CSS files |
| packages/api/__tests__/cancellation-policy-admin-bug-1170-admin-ui.test.ts | 206 | mixed — also has real toBe but dominated by toMatch on source |
| packages/api/__tests__/cancellation-policy-page-bug-1170-admin-ui.test.ts | 181 | same |
| packages/api/__tests__/founding-tier-bug-1323.test.ts | 90 | readFileSync of platform.config.ts |
| packages/api/__tests__/mobile-fetch-wrapper-bug-1271.test.ts | 86 | readFileSync of mobile fetch wrapper |
| packages/api/__tests__/no-shield-config.test.ts | 72 | asserts SiguradoShield strings absent in source |
| packages/api/__tests__/prometheus-config.test.ts | 75 | readFileSync of metrics route |
| packages/api/__tests__/routes-registry-bug-1185.test.ts | 95 | readFileSync of server.ts |
| packages/api/__tests__/s3-sse-bug-1325.test.ts | 110 | readFileSync of S3 service |
| packages/api/__tests__/smoke.test.ts | 254 | mixed — has 15 toBe but 7 toMatch on source files |
| packages/api/__tests__/migrations/074-service-area-bounds.test.ts | 85 | readFileSync of migration SQL |
| packages/api/__tests__/migrations/075-admin-actions-full-notes.test.ts | 138 | same |
| packages/api/__tests__/migrations/076-soft-delete-columns.test.ts | 117 | same |
| packages/api/__tests__/migrations/078-checklist-templates.test.ts | 99 | same |
| packages/api/__tests__/migrations/079-booking-photos-signatures.test.ts | 119 | same |
| packages/api/__tests__/migrations/d08-migrations.test.ts | 110 | same |
| packages/api/__tests__/design-tokens-sync.test.ts | 47 | readFileSync of design tokens |
| apps/mobile/__tests__/no-siguradoshield.test.ts | 183 | mobile-side SiguradoShield string-absence test |
| apps/mobile/__tests__/no-todo-placeholders.test.ts | 69 | asserts no TODO placeholders in source |

**The pattern:**
```ts
import { readFileSync } from 'fs';
const ROUTE = readFileSync(resolve(__dirname, '../src/routes/booking.routes.ts'), 'utf8');
describe('Bug 73 — admin photo display uses file:// URLs', () => {
  it('routes/booking.routes.ts has the file:// validation guard', () => {
    expect(ROUTE).toMatch(/Bug 36 \+ 461 \+ 1224/);
    expect(ROUTE).toMatch(/file:\/\//);
    expect(ROUTE).toMatch(/\^https\?:/);
  });
});
```

**Why this is a CRIT, not a MED:**

This is exactly the F#7 audit smell that CLAUDE.md calls out as forbidden:
- "expect(closeout.match(/Bug NNNN/)).toBeTruthy() — source-content regex tests" — these tests do exactly this, just spelled `expect(content).toMatch(/Bug NNNN/)` instead.
- "expect(existsSync(...)).toBe(true) — file-existence-as-test" — d07-encompassed-bugs.test.ts:90 does this literally.

These tests create the **illusion of test coverage** for ~30 bugs (D07: 6 bugs, D08: 8 bugs, D09: 6 bugs, D10: 6 bugs, plus the per-bug "bug-NNNN" files). If a developer changes the actual behavior, these tests still pass. If a developer touches a comment, they break. They're worse than no tests because they signal "covered" while testing nothing.

They exist because **Phase 14 introduced a "Gate B reference coverage" CI rule** that demands every bug number mentioned in a closeout doc must have a test that references that bug number. The team complied by writing regex-match tests instead of real behavioral tests. The CI rule itself is the root cause.

**Customer-facing impact (Boracay launch):**
The platform's regression suite is two-thirds illusion. A developer changes booking.routes.ts to remove the file:// validation guard for "performance" — every existing test still passes. Customer photos start arriving as `file://` URIs. The platform breaks in production with no test signal.

**Fix dispatch:**
```
1. Remove the "Gate B reference coverage" CI rule. Locate it (likely in
   scripts/gates/ or .github/workflows/) and either delete or replace
   with a behavioral-coverage rule.

2. Delete all 25 SRC-REGEX files outright. They're net-negative — they
   absorb test-suite time, signal coverage that doesn't exist, and break
   on benign comment changes.

3. Replace each one with a real behavioral test. Pattern:
   - For "Bug 36 file:// validation": import the actual route handler,
     POST a booking with file:// URLs, assert 422 status + error message.
   - For "Bug 1170 cancellation policy": import calculateRefund() and
     assert correct refund amount for each tier × hours-before scenario.
   - For "Bug 117 consent type CHECK": INSERT a row with consent_type='priacy_policy'
     against a test DB; assert PostgreSQL raises constraint violation 23514.
   - For "Bug 1366 breach log": POST /admin/breach-log as DPO, assert
     row created with correct CHECK invariants; POST as junior admin, assert 403.

4. The "encompassed bugs" framing itself is suspect. If Bug 943 + Bug 944
   are "encompassed by Bug 36's fix", then Bug 36's behavioral test should
   include assertions that prove Bug 943 + Bug 944 scenarios pass. Don't
   write a separate "encompassed" test; extend the primary test.

5. Tests required to verify the deletion didn't lose coverage:
   - Coverage report before vs after: line coverage should not drop on
     the fixed code paths (because the SRC-REGEX tests don't execute the
     code anyway).
   - Mutation testing: introduce a fault in routes/booking.routes.ts (remove
     the file:// guard); the new behavioral test must fail.

6. Bundle into Phase I-A (test infrastructure dispatch).
```

---

### CRIT-155 — 114 R7-real shallow tests prove pages compile but assert nothing about behavior; 152 CRITs from prior phases would not be caught by any of these tests
**Files:** 114 files in `apps/admin/src/pages/__tests__/` (29 files) + `apps/mobile/__tests__/screens/` + `apps/mobile/__tests__/customer/` + `apps/mobile/__tests__/provider/` + `apps/mobile/__tests__/provider-onboarding/` + a few more (85 files).

**The pattern (every file is a copy of this):**
```tsx
// Phase 14 R7-real — real render test for X.
// 5 assertions per screen: [comment claims] mounts / has content / a11y / interactive / non-empty text
// (actual implementation has 3 assertions; comment is stale)

import { render } from '@testing-library/react';
import * as PageModule from '../X';
const Page = (PageModule as { default?: React.ComponentType<unknown> }).default ?? null;
const importError = Page ? null : 'no default export';

let preRenderError: string | null = null;
if (Page && !importError) {
  try { render(withProviders(<Page />)); } catch (err) { preRenderError = err.message; }
  if (no children) preRenderError = 'page rendered 0 children under default mocks';
}

describe('Page render: X', () => {
  if (!Page || importError) { it.todo(...); return; }
  if (preRenderError) {
    it.todo('mounts: ' + preRenderError);
    it.todo('renders content: ' + preRenderError);
    it.todo('produces a valid root element: ' + preRenderError);
    return;
  }

  it('mounts without throwing', () => {
    expect(renderPage().error).toBeNull();
  });
  it('renders some content', () => {
    expect(container.children.length).toBeGreaterThan(0);
  });
  it('produces a valid root element', () => {
    expect(root.tagName).toMatch(/^(div|main|form|...)$/);
  });
});
```

**What these tests DO catch:**
- Import errors (page file deleted, default export removed, top-level syntax error)
- Throws during initial render (top-level useState/useEffect with broken hook usage)
- Page returning null instead of JSX

**What these tests DO NOT catch (mapped to phases A-G CRITs):**
| CRIT | Behavior | Caught by R7-real? |
|---|---|:-:|
| CRIT-120 | Junior admin sees Approve/Reject/Complete payout buttons | ❌ |
| CRIT-122 | Dispatch console map defaults to Manila | ❌ |
| CRIT-128 | "Government ID — not stored" string still shown | ❌ |
| CRIT-129 | 'founding' tier missing from dropdown | ❌ |
| CRIT-132 | Phone/email/IP visible to junior admins | ❌ |
| CRIT-133 | Wallet credit accepts ₱1,000,000 with no cap | ❌ |
| CRIT-135 | Audit log shows raw oldValues/newValues | ❌ |
| CRIT-136 | Erasure DSR Mark Complete doesn't erase | ❌ |
| CRIT-137 | Junior admin can publish consent version | ❌ |
| CRIT-138 | Notification template editor unguarded | ❌ |
| CRIT-142 | Pricing rule create with multiplier 5.0 succeeds | ❌ |
| CRIT-143 | Marketing campaign attribution direct edit | ❌ |
| CRIT-144 | Junior admin can edit catalog basePrice | ❌ |
| CRIT-145 | `Number(price) * 100` without Math.round | ❌ |
| CRIT-147 | All platform settings editable by junior admin | ❌ |
| CRIT-148 | Dashboard shows guarantee fund runway to all admins | ❌ |
| CRIT-149 | ChurnTab shows phone+spend to junior admin | ❌ |
| CRIT-150 | Sensitive setting values shown plaintext | ❌ |

This pattern repeats for **every CRIT in F02-F06** (admin web findings). The R7-real test for `BookingsPage.tsx` does NOT test that the cancel-without-refund-preview bug is fixed. The R7-real test for `SystemSettingsPage.tsx` does NOT test that role gating works. Etc.

**Severity rationale:** marking CRIT not because the tests are wrong (they catch real regressions) but because **Phase 14 R7 remediation closeout claimed real-render tests existed for D11/D12 polish bugs**. The closeouts said the tests verify the polish bug fixes. They don't. They verify the page mounts. The polish bugs land or don't land regardless.

**Fix dispatch:**
```
1. Keep all 114 files as-is. They serve as the smoke-compile layer.

2. For each of the 29 admin pages, write a paired *.behavior.test.tsx:
   - Mock the relevant API responses with realistic data fixtures
     (one fixture per page; covers happy path).
   - Render with role='admin' AND with role='super_admin'; assert that
     super-admin-only buttons (Approve, Suspend, Edit Settings) are
     ABSENT for role='admin' and PRESENT for role='super_admin'.
   - Per-CRIT assertions:
     - PayoutsPage.behavior.test: assert Approve button absent for non-super-admin
     - DispatchConsolePage.behavior.test: assert MapContainer center !== Manila default
     - CustomerDetailPage.behavior.test: assert phone shown as masked for non-super-admin
     - SystemSettingsPage.behavior.test: assert page redirects junior admin to access-denied
     - etc.
   - Pattern reference: apps/mobile/__tests__/proof/login.dom.test.tsx
     (renders, fires events, asserts on rendered text/aria — exactly
     the bar these need).

3. For each mobile screen with a known CRIT (CRIT-99/100/101/102/103/104/105
   provider job execution; CRIT-108/109 portfolio/cert; CRIT-115/117
   onboarding theatre), write a paired *.behavior.test.tsx that:
   - Mocks the API responses to seed the relevant data state.
   - Asserts the screen RENDERS the data (not just that it doesn't throw).
   - Fires interactions (button clicks, form submissions) and asserts
     follow-up state (mutation called with right payload, navigation
     occurred, error state cleared).

4. Update R7 closeout retroactively: it claimed real-render tests of
   the polish bug fixes; it actually delivered smoke-compile tests.
   The remediation is the new *.behavior.test.tsx files described above.

5. The 114 files become "Tier 1 smoke" (current); the new *.behavior
   files become "Tier 2 behavior" (per-feature happy-path); Tier 3
   end-to-end with Docker + screenshots is Phase I-A (runtime harness).
```

**Tests required:** the test files THEMSELVES are the deliverable. Each new *.behavior.test.tsx must:
- Import the real component (no mock of the component itself).
- Mock only the API/data layer (jest.mock / vi.mock for hooks like `useQuery`, `useAuthStore`).
- Render with realistic seed data.
- Fire user events (`fireEvent.click`, `fireEvent.change`).
- Assert on rendered text, ARIA attributes, mutation call payloads.
- Cover the CRIT-listed scenarios in this finding's table.

**Runtime verification:** `npm test` with new files; coverage report must show new behavior assertions hit per-page. Mutation testing: introduce a regression on a known CRIT (e.g., remove the `isSuperAdmin` check on PayoutsPage approve button); the new behavior test must fail.

---

### CRIT-156 — Phase 14 "Gate B reference coverage" CI rule itself is illegitimate and must be removed
**File:** location to be confirmed in Phase I — likely `scripts/gates/B-tests.ts` or similar.

CLAUDE.md states (lines 73-74):
> No fake-passing tests. Every test file either renders + asserts on real output, OR uses `it.todo` with a specific reason. `expect(existsSync(...)).toBe(true)` is not a test. `expect(closeout.match(/Bug NNNN/)).toBeTruthy()` is not a test. Both patterns are caught and rejected.

Yet 25 files do exactly the second pattern (just spelled `.toMatch(/Bug NN/)` against `readFileSync` content). They exist because a CI "Gate B" rule demands every claimed bug have a test reference. The team complied by writing regex-match tests rather than real behavioral tests.

**Fix dispatch:**
```
1. Locate the Gate B rule (grep scripts/gates/ for "reference coverage",
   "Bug NN", "bug citations", or similar).

2. Replace it with a behavioral-coverage rule:
   - Each closeout-claimed bug fix must have a test file where the
     bug ID appears in an it() block name (not just a comment).
   - The test file must NOT import readFileSync or readFile from 'fs'
     for the purpose of asserting on source content.
   - The test file must import at least one symbol from packages/api/src
     OR apps/admin/src OR apps/mobile (real-code import).
   - The CI runs the test and reports the PASS/FAIL — not just that
     the file exists.

3. Add a CI lint that detects SRC-REGEX patterns:
   - readFileSync of *.ts / *.tsx / *.sql in test files → flag.
   - .toMatch(/Bug \d+/) on a string read from fs → flag.

4. Document in CLAUDE.md that the rule has been replaced.

5. Bundle with Phase I-A (test infrastructure dispatch).
```

---

## MEDIUM bugs (continuing from MED-398)

### MED-399 — R7-real test header comments claim 5 assertions but file actually has 3
**Files:** all 114 R7-real files. Example: `apps/mobile/__tests__/screens/customer-booking-checkout.real.test.tsx:6-12` claims:
> 5 assertions per screen: 1. mounts 2. renders content 3. has at least one accessibility marker 4. has at least one interactive element 5. text isn't empty

The actual file has 3 it() blocks: mounts / renders content / valid root element. Assertions 3, 4, 5 (accessibility marker, interactive element, non-empty text) are NOT in any of the 114 files I sampled.

**Fix:** either implement the missing 3 assertions (cheap, since render() output already exists in scope) OR fix the comment to match. The missing assertions would add minor coverage — `aria-label` presence catches a class of regressions where a refactor strips ARIA attributes.

### MED-400 — `it.todo(todoReason(...))` fallback pattern hides 80%+ of intended assertions when pages can't render under default mocks
**Files:** all 114 R7-real files have the pattern:
```ts
if (preRenderError) {
  it.todo('mounts: ' + preRenderError);
  it.todo('renders content: ' + preRenderError);
  it.todo('produces a valid root element: ' + preRenderError);
  return;
}
```

If a page redirects when not authenticated, throws on missing route params, or fetches data that fails under empty mocks, ALL 3 of its tests become `it.todo`. The test suite reports these as "skipped" rather than "failed" — green build.

The reason text is typically generic ("page rendered 0 children under default mocks (page likely redirects or requires per-page fixture)") rather than specifying what fixture is needed.

**Fix:** pair the R7-real smoke layer with the new *.behavior.test.tsx files (CRIT-155 fix dispatch). The behavior tests provide the per-page fixtures so the real assertions actually run.

### MED-401 — `cancellation-policy-admin-bug-1170-admin-ui.test.ts` and `smoke.test.ts` are mixed REAL + SRC-REGEX
**Files:**
- packages/api/__tests__/cancellation-policy-admin-bug-1170-admin-ui.test.ts (206 lines, 4 readFS, 12 toMatch, 12 toBe)
- packages/api/__tests__/cancellation-policy-page-bug-1170-admin-ui.test.ts (181 lines, 3 readFS, 20 toMatch, 14 toBe)
- packages/api/__tests__/smoke.test.ts (254 lines, 3 readFS, 7 toMatch, 15 toBe)

These have both real behavioral assertions (toBe with computed values) AND source-regex assertions (toMatch on readFileSync content). Splitting them into clean buckets is harder.

**Fix:** in CRIT-154 deletion pass, manually split each:
- Keep the toBe assertions on real computed values.
- Delete the toMatch on source-content assertions.
- File becomes a clean REAL-UNIT test.

### MED-402 — d11/d12 polish-real tests have inconsistent real-vs-todo ratios
**Files:**
- apps/mobile/__tests__/d11-customer-polish-real.test.tsx: 460 lines, 19 render, 24 it.todo, 33 toBe, 36 it_or_test (~33% real assertions, ~67% todo)
- apps/mobile/__tests__/d12-provider-polish-real.test.tsx: 347 lines, 4 render, 43 it.todo, 12 toBe, 9 it_or_test (~17% real, ~83% todo)

d12 has 43 `it.todo` calls. The closeout claimed comprehensive D12 (provider polish) test coverage. The reality is most of D12's test surface is still todo'd.

**Fix:** treat as part of the CRIT-155 dispatch. Each `it.todo` in d11/d12 needs replacement with a real behavior test that satisfies the original Bug 1xxx claim.

### MED-403 — Test file naming inconsistency: `.real.test.tsx` vs `.test.ts` vs `*-bug-NNNN.test.ts` vs `*.dom.test.tsx`
**Files:** all test directories.

Naming conventions discovered:
- `.real.test.tsx` — Phase 14 R7-real renders (114 files, mostly SHALLOW)
- `.test.ts` / `.test.tsx` — generic (mixed REAL-UNIT and SRC-REGEX)
- `*-bug-NNNN.test.ts` — single-bug verification (mostly SRC-REGEX)
- `.dom.test.tsx` — proof-of-life DOM tests (3 files, REAL-RENDER)
- `*-encompassed-bugs.test.ts` — encompassed/deferred bug references (5 files, SRC-REGEX)

A new convention should be:
- `*.unit.test.ts` — pure unit, no I/O
- `*.behavior.test.tsx` — component + data-mock, behavioral assertions
- `*.smoke.test.tsx` — current R7-real smoke-compile (rename current 114 files)
- `*.e2e.test.ts` — runtime harness (Playwright/Maestro) — currently doesn't exist

Phase I-A dispatch should normalize.

### MED-404 — No coverage threshold enforcement on PRs
**Files:** `package.json`, `.github/workflows/*` — to confirm.

Phase F + G found 152 CRITs. The test suite passes. Either:
- Coverage thresholds aren't enforced (so SRC-REGEX files inflate coverage falsely).
- Coverage thresholds are enforced but the SRC-REGEX bypass is large enough.

Either way, replacing SRC-REGEX with real tests will likely DECREASE reported coverage initially. The new coverage will be honest.

**Fix:** post-CRIT-154 deletion, set coverage threshold to current-honest-level + small buffer; ratchet up over time.

### MED-405 through MED-410 — per-bucket smaller findings (consolidated)

- **MED-405**: `bookingDispute-admin.test.ts` is 1,032 lines / 82 it() blocks. At that size, a refactor that introduces a regression in 1 of 82 tests is hard to bisect. Split into per-feature files.
- **MED-406**: `financial-bir-admin.test.ts` at 1,585 lines / 93 it() blocks — same.
- **MED-407**: API tests use `jest.mock` extensively (75+ files). The mocks are inline; no shared test fixtures library. Each test re-defines the same mock for `settings.service`, `db`, etc. Drift risk: one test mocks `getCommissionRate` correctly, another mocks it differently, and they diverge silently.
- **MED-408**: Mobile R7-real tests stub React Native primitives via `__mocks__/react-native.js` to render in jsdom. The mock fidelity to actual RN behavior on iOS/Android is unverified — passing tests in jsdom doesn't prove the screen works on a real device.
- **MED-409**: No snapshot tests anywhere in the suite. Snapshots are a useful catch-all for unintended UI changes in admin tables / mobile cards. Could be added selectively.
- **MED-410**: No tests for the F#3 Maestro YAMLs or F#4 Playwright specs themselves — i.e., no test that "this Maestro flow file compiles and references real screens." If a screen is renamed and the YAML isn't updated, no signal until baseline-capture session, which hasn't happened yet.

---

## LOW / INFO

- **The 74 REAL-UNIT files cover the core money paths well.** `escrow-money-conservation.test.ts` is the gold standard — money-conservation invariants tested against multiple tier × price combinations. Apply this pattern to gaps (no equivalent for the proposed "marketing attribution adjustment" CRIT-143 fix; no equivalent for the proposed "erasure executor" CRIT-136 fix).
- **`booking-dispute-admin.test.ts` (1,032 lines)** is comprehensive for dispute resolution flows; could serve as a structural template for a similar `provider-onboarding-flow.test.ts` covering CRIT-115/117/128 once the wire-up lands.
- **Mobile auth flow has dedicated proof tests** — `proof/login.dom.test.tsx`, `proof/phone-validation.real.test.ts`, `proof/status-badge.dom.test.tsx`. The pattern works (real DOM render + fired events + behavioral asserts). Replicate for every customer flow + provider flow + admin action.
- **No tests for migration rollback** — but CRIT-G's MED-398 already flagged that migrations don't have rollback scripts. Coupled.
- **Validator tests are uniformly real and well-structured.** `address-validators`, `auth-validators`, `booking-validators`, `dispute-validators`, `payment-validators`, `payout-validators`, `promo-validators`, `provider-validators`, `recurring-validators`, `referral-validators`, `review-validators`, `suki-validators`, `tip-validators`, `messaging-validators`, `notification-template-validators`, `admin-catalog-validators`, `admin-pricing-rules-validators`, `admin-service-area-validators`, `admin-validators` — 19 validator test files, all REAL-UNIT. **This is the strongest layer of the test suite.**
- **`escrow-async-integration.test.ts` (650 lines)** is a strong integration test using async patterns. Reference for the "real DB integration" tier.
- **The 4 REAL-RENDER files** (`admin-a11y-baseline.test.tsx`, `proof/login.dom.test.tsx`, `proof/status-badge.dom.test.tsx`, `d11-customer-polish-real.test.tsx`) are the template for what the 114 SHALLOW files should grow into.

---

## Phase H1 running totals

| | Files | Lines |
|---|---:|---:|
| **Test files inventoried** | **218** | **~36,621** |
| Files spot-read in full | 8 | ~1,200 |
| Files signature-classified | 218 | n/a |
| **Audit grand total fully read after H01** | (additional ~1,200 in Phase H spot reads) | ~77,400 |
| Coverage of ~140,380 codebase | ~55.1% |

| | New CRITs | New MEDs |
|---|---:|---:|
| H01 | **3** (CRIT-154, 155, 156) | **12** (MED-399 through MED-410) |

**Cumulative audit totals after H01:**
- ~77,400 lines fully read of source/test code
- **156 CRITICAL** bugs (1 invalidated → **155 real**)
- **410 MEDIUM** bugs

---

## What H02 + H03 + Phase I will do (next deliverables, all this session)

H02 — **Per-feature test coverage matrix.** For every customer flow / provider flow / admin action enumerated in your brief, list every variation (happy / failed / empty / permission-denied / network-failure / duplicate-submit / race / edge / mobile / tablet / desktop / browser / abuse) and mark coverage status (REAL test exists | SHALLOW test exists | no test). The result is the deliverable "if a flow has 100 actions, 100 tests" you asked for — as a checklist an AI coder can drive against.

H03 — **Runtime-evidence harness gap analysis.** What's missing as infrastructure: Playwright runner that boots Docker + Postgres + Redis + admin app + customer web; Maestro runner same for Android emulator + iOS simulator; per-flow YAML/JSON spec; evidence bundle output (screenshots + network + DB diffs + audit log diffs per step).

Phase I-A — **Runtime-evidence harness dispatch spec.** The infrastructure dispatch — top priority because it unblocks everything else. Includes the docker-compose spec, the test database seed scripts, the Playwright/Maestro runner code, the evidence bundle format, the AI-coder runbook for "boot the system locally and verify CRIT-NN."

Phase I-B — **The 25-30 per-CRIT dispatches.** Each CRIT (or CRIT family) bundled as a single deployable dispatch with: title + impact, files to edit (file:line citations from A-G), migration steps, server changes, client changes, tests required (REAL-UNIT + REAL-RENDER + E2E using harness from I-A), runtime verification protocol, rollback plan. Reference CancellationPolicyPage + migration 071 as gold-standard.

Continuing now into H02.
