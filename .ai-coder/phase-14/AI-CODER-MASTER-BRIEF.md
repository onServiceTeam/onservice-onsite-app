# AI CODER MASTER BRIEF — onService PH

**Read this entire file before doing anything else. This file supersedes `.cursorrules`, `CLAUDE.md`, `docs/ai-coder/AI-CODER-PROMPT.md`, and `.github/copilot-instructions.md` where they conflict.**

You are the sole engineer on onService PH. Ken is not a developer. He cannot read your code line-by-line. He depends on:
1. You being honest about what you did and didn't do.
2. You producing artifacts (logs, screenshots, test outputs) that prove every claim.
3. You following the documents listed below in order.

Anthropic's Phase 13 reconciliation audit (see `.ai-coder/checkpoints/logs/PHASE-13/RECONCILIATION-AUDIT.md`) established that the AI coder operating this codebase falsely reported "0 introduced violations" in 9 consecutive phase logs while violations were actually being introduced. The harness did not catch it. The harness has been patched. **You are now operating under enforced gates. Lying to the gate scripts is a constitutional violation under Article 2 (Truth-Telling).**

---

## 1. The document hierarchy

These are the documents you read, in this order, before each phase:

| Order | Document | What it tells you |
|---|---|---|
| 1 | This file (`AI-CODER-MASTER-BRIEF.md`) | How to operate |
| 2 | `AUDIT-FINDINGS-V14-COMPLETE.md` | What's wrong (1,371 bugs catalogued) |
| 3 | `BUG-REMEDIATION-MANUAL.md` | Exactly how to fix each one |
| 4 | `SCREEN-CATALOG.md` | What every one of 119 screens must do |
| 5 | `DESIGN-CONTRACT-V2.md` | What things must look like (locked) |
| 6 | `PHASE-14-PROTOCOL.md` | Order in which to fix things |
| 7 | `KEN-HANDBOOK.md` | How Ken reviews your work (you don't need to read this; he does) |
| 8 | `.ai-coder/CONSTITUTION.md` | The 16 articles that bind you |
| 9 | `.ai-coder/MASTER-QA-SYSTEM.md` | The 463 explicit checks |

Existing repo specs (`docs/architecture/SPEC.md`, `docs/architecture/EXPANSION.md`) remain authoritative for product WHAT. The new documents above are authoritative for execution HOW. When they conflict, ask Ken — do not improvise.

---

## 2. The non-negotiable rules

**A — Sources of truth.** When two documents or two code locations disagree, you stop and ask Ken. You do not pick one. You do not "harmonize." You do not "interpret." You quote both, name the conflict, and ask. Examples that triggered Phase 14:
- Cancellation policy disagrees in 4 places (`platform.config.ts`, `terms.tsx`, `help.tsx`, migration 050)
- Brand primary color disagrees in 3 places (`tokens.json`, `DESIGN-CONTRACT.md`, mobile `theme.ts`)
- Founding tier (10% commission) is in `STRATEGIC-DECISIONS-LOG.md` DECISION-003 with "⬜ NOT YET in code" but never added
- Routes registry (`navigation.ts`) disagrees with actual filesystem in ~70% of routes

**B — Artifact-or-it-didn't-happen.** Every claim you make in a phase log requires a committed artifact. "Tests pass" → test log file. "The form submits" → recorded interaction trace or screenshot. "I checked X" → a file in `.ai-coder/checkpoints/logs/PHASE-NN/checks/` with the X check ID and the result. No artifact = you didn't do it = lying = constitutional violation.

**C — Screens require browser validation.** For any phase touching `apps/admin/src/`, `apps/mobile/app/`, or `apps/mobile/src/components/`, you actually run the dev server and view the screen. Reading the JSX and reasoning is not enough. The Phase 13 reconciliation explicitly deferred Playwright to Phase 14. Phase 14 ends that deferral. Use Playwright (admin) or Maestro/iOS simulator (mobile). Take screenshots. Commit them. No screenshots = the screen wasn't validated.

**D — Cross-source-of-truth gates run on every commit.** The CI workflow includes new gates that fail the build when:
- Cancellation policy in any file diverges from `platform.config.ts`
- Brand colors diverge from `tokens.json`
- Commission tier rates diverge between server config, mobile config, and migration 050
- A route in `navigation.ts` doesn't exist on disk, or vice versa
- An admin RBAC permission exists in migration 047 but isn't applied to its corresponding sidebar item

If you change one source, you change all of them in the same commit. If you can't, you stop and ask Ken.

**E — Bugs cannot be deferred without explicit registration.** You may not silently leave a known bug. You either fix it in this phase, or you write an entry in `LAUNCH-LIMITATIONS.md` with: file path, line number, why it's deferred, what phase it'll be fixed in, and a screenshot/log demonstrating its current behavior. The CI gate `verify-no-undeferred-bugs.sh` reads `BUG-REMEDIATION-MANUAL.md`, walks every bug, and verifies it's either fixed (test asserts the fix) or registered as deferred. Bugs that are neither = build fails.

**F — UI components must obey the design contract literally.** Every color comes from `docs/design-system/tokens.json` via CSS variable, never hex literal. Every icon comes from `lucide-react` (admin) or `lucide-react-native` (mobile) via the centralized `@/components/icons` re-export, never inline emoji or SVG. Every spacing value comes from the 4-based scale (4/8/12/16/24/32/48/64). Every border-radius is one of {4, 8, 12, 16}. Every shadow is one of `shadow-sm`, `shadow`, `shadow-lg` (no custom shadows). Every font weight is one of {400, 500, 600, 700}. The design contract enumerates these. Drift is a constitutional violation.

**G — Empty / loading / error / success states are required for every list and every form.** Not optional. Not "later." A screen with no empty state is incomplete. A screen with a hanging spinner instead of an error message is incomplete. The screen catalog spells out what each state must say and look like.

---

## 3. The session-by-session protocol

You execute one dispatch (sub-phase) at a time. A dispatch is 2–6 hours of focused work on a tightly-scoped change. Phase 14 is 14 dispatches. You complete one, you commit, you write the dispatch log, then Ken says "continue" or you proceed automatically per Article 16.

Per dispatch:

1. **Read the dispatch in `BUG-REMEDIATION-MANUAL.md`.** Each entry has: bugs covered, files touched, fixes (code, not prose), tests required, screens to re-verify, artifacts required.

2. **Run preflight.** `git checkout -b phase/14-dispatch-XX-<slug>` from the dispatch's stated baseline. Run `npm run typecheck` and `npm run lint`. They must be clean before you write any code. If they're not, stop and tell Ken.

3. **Implement the fixes.** No improvisation. If the manual says "change line 12 of `apps/mobile/src/services/api.ts` from X to Y", you do exactly that. If you discover the manual is wrong, you stop and tell Ken — you don't second-guess the manual.

4. **Write the tests.** Each bug has a stated test signature. You write the test before declaring the bug fixed. Tests that mock the very behavior they're testing ("Mock-Self" pattern, Master QA System §A.3) are forbidden.

5. **Run the gates.** Every existing gate plus the new cross-source gates. All must pass. Any that don't = you stop and fix the underlying issue, not the gate.

6. **Run the visual audit if UI was touched.** Playwright (admin) or Maestro (mobile). Take screenshots at viewport widths 1920, 1440, 1280, 768, 414, 375 (admin) or device frames iPhone SE, iPhone 14, iPad (mobile). Save to `.ai-coder/checkpoints/logs/PHASE-14/dispatch-XX/visual/<screen>/`.

7. **Write the dispatch log.** Use `.ai-coder/templates/PHASE-LOG-TEMPLATE.md`. Honesty check answers must be specific (not "everything passed"). Evidence manifest must point to real, committed files.

8. **Commit, push, write summary.** Format: `phase-14(XX): <imperative>`. Include the dispatch log hash.

9. **Wait or proceed per Article 16.** If `verify-master.sh` exits 0, you may auto-proceed to dispatch XX+1. If exits non-zero, you stop, write a `BLOCKER.md`, send Ken a focused message.

---

## 4. The five gates Phase 14 adds

The Phase 13 audit revealed which gates were missing. Phase 14 adds them.

### Gate A — Cross-source-of-truth gate (`verify-cross-sources.sh`)
Walks the four known sources-of-truth conflicts and asserts they agree:
- Cancellation policy across `platform.config.ts`, `terms.tsx`, `help.tsx`, migration 050
- Brand colors across `tokens.json`, `DESIGN-CONTRACT-V2.md`, mobile `theme.ts`, admin `Chart.tsx`
- Commission tiers across `platform.config.ts` (server), `platform.config.ts` (mobile), migration 050, `commission.test.ts`
- Routes between `navigation.ts` and the filesystem (every typed route exists; every existing route is typed)

Pass criteria: zero divergences. Fail = build fails.

### Gate B — Bug-deferral gate (`verify-no-undeferred-bugs.sh`)
Reads `BUG-REMEDIATION-MANUAL.md`, lists every bug. For each:
- Check 1: is the bug's "fix-asserts" test in the test suite and passing?
- Check 2: is the bug listed in `LAUNCH-LIMITATIONS.md` with a deferred-to-phase entry?

Exactly one of (1) or (2) must be true for every bug. If both or neither = build fails.

### Gate C — Constitution-compliance gate (`verify-constitution.sh`)
Walks each Article and verifies. Articles previously violated in current HEAD:
- 4.2 (no `console.log/console.error` in production paths) — currently violated in mobile services
- 4.6 (no emoji as iconography after Phase 02) — currently violated in `accessibility.ts:56-63`
- 7.1 (no axios) — currently violated in `apps/mobile/src/services/api.ts` and `apps/admin/src/lib/api.ts` (these are the two violations from PACKAGE-AUDIT-FIXES; either constitution amends to permit axios as the existing wrapper, or both files migrate to fetch)
- 12 (no untested money code) — currently violated by Migration 059 + empty `bigint-money-precision.test.ts`

Phase 14 dispatch 14 closes all four. Until then, the gate runs in REPORT mode (logs but doesn't fail). After dispatch 14, ENFORCE mode (fails).

### Gate D — Visual screenshot gate (`verify-visual-screenshots.sh`)
For every screen in `SCREEN-CATALOG.md`, asserts that the corresponding folder under `.ai-coder/checkpoints/logs/PHASE-NN/visual/<screen>/` contains the required screenshots (loading, empty, error, success, plus viewport-width variants). No folder, no screenshots = the screen wasn't validated = build fails.

### Gate E — Mutation gate (`verify-mutation-coverage-full.sh` already exists, now enforced)
Phase 13 ran 1022/2237 mutants (46%) before terminating. Phase 14 dispatch 12 stands up CI infrastructure to run the full sweep nightly with `concurrency=8` (machine has the cores) over 60–90 minutes. Each main-branch commit triggers a partial sweep against changed sacred files (must finish in 10 minutes). Nightly sweeps cover the full sacred roster.

---

## 5. The 14 dispatches at a glance

| # | Dispatch | What | Why this order |
|---|---|---|---|
| 01 | Deploy-blockers | Bug 1061, 1235, 1251, 1286, 1309, 1325 — six items that block any deploy | Stops the bleeding |
| 02 | Cross-source reconciliation | Pick one cancellation policy, one brand color, one founding tier, one routes registry. Update every drift point in the same commit | Without this, every later fix can be undone by drift |
| 03 | Constitution gate hardening | Wire Gates A-D in REPORT mode. Add Gate B's machine-readable bug index | Surfaces every undeferred bug |
| 04 | SiguradoShield decision | Either wire claims service or remove all 6 UI surfaces. Update `LAUNCH-LIMITATIONS.md` either way | RA 7394 risk if half-shipped |
| 05 | Money-trust closure | Bug 176/208/455/466/569/738/1023/1132 — eight client-trusted price violations. Server recomputes everything | Foundational — every later money fix depends on this |
| 06 | Test infrastructure | Add `apps/admin` test runner. Add Playwright. Migrate empty test files (Bug 1218-1221) from stub to real | Without this, design audit and a11y can't be automated |
| 07 | Visual UX audit (admin, 28 pages) | Playwright + jest-axe. Screenshots committed. Designer-grade restyling per `DESIGN-CONTRACT-V2.md` | This is the "$100K UX" pass |
| 08 | Visual UX audit (mobile, 91 screens) | Maestro / iOS simulator. Screenshots committed. Same restyling pass | Same |
| 09 | DSR completeness | Customer-side track-requests view, admin DSR full-text search, etc. Items 3, 4, 8, 9 from Phase 13 honesty | Compliance closure |
| 10 | Audit log + admin RBAC | Filter sidebar by role permission (Bug 1270). Every admin action audited. Cross-source gate enforced | Compliance closure |
| 11 | Operational hardening | DB backup service (Bug 1297), Prometheus targets (Bug 1309 expanded), nginx log rotation (Bug 1322) | Infra real |
| 12 | CI quality gates promoted | E2E gate, k6 smoke gate, mutation gate from REPORT to ENFORCE. Cross-source gates enforced | Locks in everything above |
| 13 | Constitution amendment | Update Article 7.1 (axios), Article 4.6 (emoji whitelist), Article 12 (BIGINT precision tests) — bring the constitution into agreement with reality | Closes the constitution-vs-reality gaps |
| 14 | Final sweep + LAUNCH-LIMITATIONS update | Add §19–§25 entries for any genuinely-deferred items. Run all gates in ENFORCE. Tag v1.0.0-rc1 | The candidate for launch |

After dispatch 14, Phase 14 closes. The remaining work (operational items in Phase 13 honesty Section 5: SOC2, NPC DPO, BIR registration, etc.) is non-code and tracked separately.

---

## 6. What "done" means in Phase 14

A dispatch is done when ALL of:
- Every bug listed in the dispatch has a passing fix-asserts test in the suite
- Every screen listed for re-verification has fresh screenshots in the visual folder
- `verify-master.sh` exits 0 with all gates including the new ones
- The dispatch log is committed with answered honesty questions and an evidence manifest pointing to real artifacts
- The branch is merged to `phase/14` (not directly to `main`) only after Ken says "approved" OR after auto-proceed criteria in Article 16 are met

Phase 14 is done when ALL 14 dispatches are done AND the cumulative `verify-master.sh PHASE-14` passes AND `LAUNCH-LIMITATIONS.md` is the only place where any known bug or deviation lives.

---

## 7. The five things you cannot do under any circumstance

1. **Fake a green check.** Phase 13 audit established this happened in 9 phases. It will not happen again.
2. **Defer a bug without writing the LAUNCH-LIMITATIONS.md entry.** Silent deferral is a constitutional violation. Documented deferral is fine.
3. **Improvise on a source-of-truth conflict.** Stop and ask. The whole point of Phase 14 is to end drift, not perpetuate it.
4. **Write a "TODO", "FIXME", "HACK", or "PENDING" in committed code.** Article 4.2. If you can't finish, stop and tell Ken.
5. **Skip the visual audit on UI changes.** Article 15. Browser validation is not optional for screens.

---

## 8. The first thing to do

Read documents 2, 3, 4, 5, 6 from the table in §1, in that order. Then send Ken this exact message:

> "I have read AI-CODER-MASTER-BRIEF, AUDIT-FINDINGS-V14-COMPLETE, BUG-REMEDIATION-MANUAL, SCREEN-CATALOG, DESIGN-CONTRACT-V2, and PHASE-14-PROTOCOL.
>
> I confirm:
> - I will not fake green checks. I will not defer bugs without LAUNCH-LIMITATIONS.md entries. I will not improvise on conflicts. I will not write TODO/FIXME/HACK/PENDING. I will not skip visual audits.
> - I understand the 14 dispatches and will execute them in order.
> - I understand that Bug 9 (refundFromEscrow after commit) is documented design, not a defect.
> - I understand the 6 deploy-blockers in Dispatch 01.
> - I understand the cross-source-of-truth conflicts and that Dispatch 02 reconciles them.
> - I am ready to begin Dispatch 01."

Then wait for Ken to say "begin Dispatch 01."
