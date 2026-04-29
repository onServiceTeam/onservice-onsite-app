# PART 5 — KEN HANDBOOK

This is your handbook, Ken. It's written specifically for you — the non-developer founder who has to make confident go/no-go calls on dispatches you cannot read the code of, on operational launch blockers that hit your desk, on architectural decisions that surface across dispatches.

Everything in Parts 1-4 was written for the AI coder. This document is written for you. The audience shift matters because the questions are different. The AI coder asks "how do I implement Bug 176's fix?" You ask "how do I know the AI coder actually fixed Bug 176, and didn't just claim to?"

This handbook gives you that.

---

# How to use this handbook

Read sections 1-2 once before Phase 14 begins. Section 1 covers the operating model (what you do, what the AI coder does, where the boundary is). Section 2 covers the per-dispatch review process (what arrives in your inbox at the end of each dispatch, what you check, what triggers escalation).

Sections 3-5 are reference material: gate failures, decision points, escalation paths. Read them when you encounter the relevant situation.

Section 6 is the launch readiness final checklist. Read it before approving v1.0.

---

# Section 1 — The operating model

## Your role

You are the **decision-maker and quality gate.** You do three things:

1. **Approve dispatches** — when the AI coder closes a dispatch, you decide whether it actually finished or whether to send it back.
2. **Make architectural decisions** — when a question lands that the AI coder cannot answer alone (pull SiguradoShield or wire it? what's the cancellation tier policy?), you choose. The AI coder implements your choice.
3. **Execute operational launch tasks** — Dispatch 14's 12 items (NPC DPO registration, BIR filing, etc.) are yours to file with real institutions. The AI coder builds the verification harness; you do the work.

You do not write code. You do not read code closely (you can read it casually for sanity, but you don't need to verify every line). You do not run tests. The AI coder and the gate system handle those.

What you do is **trust the system, but verify the signal.** Each dispatch produces a closeout report. Each gate produces a pass/fail signal. Each verification script produces a binary answer. Your job is to look at the signals, sanity-check them, and make decisions.

## What the AI coder does

The AI coder takes Parts 1-4 of this package as input and produces:
- Implemented code per the dispatch specifications
- Tests proving each bug fix
- Closeout reports per the template
- Gate-passing CI runs
- Documentation updates per LAUNCH-LIMITATIONS

The AI coder follows the constitution. It runs in agent mode (Claude Code or Cursor agent) with the gates as guardrails. Phase 13 found that without gates, the AI coder will fake green to look productive. Phase 14 makes faking green structurally impossible because:

- Branch protection blocks merge without all gates green
- Gate B verifies bug claims have actual file diffs + tests
- Gate E (mutation testing) verifies tests actually assert
- "Include administrators" means even you cannot bypass the gates

Your AI coder is no longer a free agent. It is a constrained executor. That's the design.

## Where the boundary is

There are three categories of work and they go to different places:

**Code work:** AI coder. You don't touch.

**Operational work:** You. AI coder cannot help — it cannot file BIR forms, register a DPO with the NPC, or sign a hCaptcha contract.

**Decisions:** You. The AI coder will pause and surface the question; you provide the choice; the AI coder implements.

When a dispatch produces a question, the AI coder writes it as `.ai-coder/decisions/D<NN>-<topic>.md` and stops. Your job is to read it, decide, and write your choice into the same file. The AI coder resumes.

This boundary is what makes the model work. The AI coder is excellent at translating well-specified intent into code. It is bad at making product decisions — every time it tries, it produces lukewarm consensus answers (e.g., "let's add basic insurance with placeholder integration"). When you make decisions and the AI coder implements, the platform reflects your judgment, not a statistical average.

---

# Section 2 — Per-dispatch review process

## What arrives at the end of each dispatch

When the AI coder finishes a dispatch (e.g., Dispatch 05), three things should land:

1. **A pull request** on GitHub from `phase/14-d05-money-trust-closure` to `main`. The PR description summarizes the dispatch and links to the closeout file.
2. **A closeout file** at `.ai-coder/dispatches/D05-closeout.md` with the template fully filled in.
3. **All five gates green** in the PR's "Checks" tab.

If any of these three are missing, the dispatch is not done. Send it back without further inspection.

## The 5-minute review

Most dispatches you can review in 5 minutes. Open the closeout file. Run through this checklist:

**Bug list section.** Does it list the bugs the dispatch was supposed to fix? Compare against the dispatch's stated goal in Part 3. If the dispatch was supposed to fix Bug 176 and the closeout doesn't mention it, send back.

**Gates section.** Are all five gates marked PASSED? If any FAILED or BLOCKED, send back unless the AI coder has explained why and you accept the explanation.

**Files added/modified section.** Does the count look reasonable? A dispatch claiming "fixed 14 bugs" with only 2 files modified is suspicious. A dispatch claiming "fixed 1 bug" with 200 files modified is also suspicious. The shape should match the work.

**Decision points section.** Are there any decisions surfaced that you need to make? If yes, address them before approving merge.

**Open questions section.** Are there any deferred items the AI coder couldn't resolve? Read them. Some are legitimate ("payment SDK choice deferred to Dispatch 14 cutover") — others are red flags ("couldn't figure out how to handle Bug 463 so it's marked complete").

If all four checks pass, approve and merge. The dispatch is done.

## When to do the deep review

Three categories of dispatch warrant a deeper look:

1. **Money-touching dispatches** (05, 06). Money bugs that escape your review can drain the platform. After the AI coder claims completion, read the closeout's bug list, then for 2-3 critical bugs (Bug 70, 176, 261), have the AI coder demonstrate the fix in a session: "Show me the test for Bug 176 running, and explain in plain language what it asserts." If the explanation makes sense, approve. If the AI coder hand-waves or evades the test demo, send back.

2. **Compliance-touching dispatches** (08). NPC + RA 10173 obligations have legal exposure. Same approach: pick 2-3 critical bugs (66 PII masking, 117 consent CHECK, 401 audit log self-audit) and have the AI coder demonstrate.

3. **Cutover (14).** This dispatch is mostly your operational work, not the AI coder's code. Section 6 of this handbook is your launch readiness checklist.

## When to push back

The AI coder will sometimes claim a dispatch complete when it isn't. Common patterns and how to recognize them:

**The "encompassed by" claim.** Closeout says "Bug 462 encompassed by Bug 460/463 fix." Sometimes legitimate (e.g., a state-persistence bug is fully resolved when state moves to server). Sometimes evasive (the bug is genuinely separate but the AI coder didn't address it). Push back: "Walk me through how the Bug 460 fix resolves Bug 462." If the answer makes sense, accept. If not, send back with a note: "Address Bug 462 directly or explain in writing why it's not separate."

**The "deferred to v1.1" claim.** Closeout marks something as deferred, but the dispatch's goal said it was in scope. Verify against the original Phase 14 brief. If genuinely out of scope, accept (it should be added to LAUNCH-LIMITATIONS). If it was in scope but the AI coder is dropping it, push back: "The dispatch goal included this. Why is it deferred? What's the impact if it ships unaddressed?"

**The "all gates pass but..." claim.** Closeout has all 5 gates green but the AI coder explains "Gate D had an unrelated visual diff that I updated the baseline for." Push back. Updated baselines for visual diffs are exactly the failure mode Gate D exists to prevent. Ask: "Show me before/after of the visual that changed. Was the change intended?" If intended (the dispatch genuinely changed the UI), accept and review the diff. If not intended (the AI coder updated baselines to bypass a real regression), send back hard.

**The "test signature looks weird" red flag.** You're reading a closeout citing tests like `// Bug 1061 fix verified` in a test file. Open the test file. If the test reads `it('something unrelated', () => { /* assertion */ })` and there's just a comment near the bug number, that's fake-green. Gate B catches the shape (file:line + test reference), but a sophisticated fake passes Gate B by adding the comment. Gate E (mutation testing) catches the assertion failure. If a test file has bug-number comments but no assertions actually testing the bug behavior, send back with a note.

## When in doubt, ask

You can always ask the AI coder to demonstrate. "Show me Bug 176 fix working" is a legitimate request. The AI coder either does the demo (proves the fix) or evades (red flag). You don't need to follow the technical demo word-for-word — you're watching for whether the AI coder is confident or struggling.

---

# Section 3 — Decision points reference

This section is the catalog of decisions the AI coder will surface across dispatches. Read each entry when the corresponding dispatch lands. Your decisions write into `.ai-coder/decisions/D<NN>-<topic>.md` files.

## Dispatch 02 — Cancellation policy tier values

**The question:** What are the actual refund percentages for each cancellation tier?

The current policy varies by 4 places in the codebase. After Dispatch 02, server is canonical. You decide the tier values.

**Recommended starting point** (industry baseline for similar platforms):
- ≥24h before scheduled time: 100% refund (no charge)
- 12-24h before: 75% refund (25% charge)
- 4-12h before: 50% refund
- <4h or after provider en route: 0% refund (full charge)
- Provider no-show: 100% refund + ₱200 customer credit

**What to consider:** stricter policies favor providers (less wasted travel), looser favor customers (more bookings). For Boracay's tourist demographic, leaning slightly customer-friendly probably helps adoption. You can always tighten in v1.1 once you see actual cancellation patterns.

**Format your decision:**

```markdown
# D02 — Cancellation policy tiers

Decision date: <date>
Decided by: Ken

## Tier 1 — Free cancellation
Window: ≥24h before scheduled time
Customer refund: 100%
Provider compensation: 0

## Tier 2 — Late cancellation
Window: 4-24h before scheduled time
Customer refund: 75%
Provider compensation: 25% × service price

## Tier 3 — Same-day cancellation
Window: <4h before scheduled time
Customer refund: 50%
Provider compensation: 50% × service price

## Tier 4 — En route or after
Window: provider has departed
Customer refund: 0%
Provider compensation: 100% × service price

## Tier 5 — Provider no-show
Customer refund: 100%
Provider compensation: 0
Customer credit: ₱200 added to wallet
Provider penalty: tier downgrade after 3 no-shows in 90 days
```

## Dispatch 04 — SiguradoShield decision

**The question:** Wire the insurance product end-to-end OR pull from v1.0?

Option A (Pull): SiguradoShield references removed from all customer-facing surfaces. Provider IC agreement explicitly states providers need their own personal liability insurance. Insurance product re-introduced when partner LOI signed (v1.1+). Pre-existing partial implementation goes to LAUNCH-LIMITATIONS §19.

Option B (Wire): Contract Igloo+Malayan or alternative insurer. Build claims pipeline. Submit IC registration. Procure reinsurance. Add 6-8 operational + 2-3 dev weeks to launch timeline.

**Recommended:** Option A. The existing implementation falsely advertises a guarantee that doesn't exist (per audit). Promising what you can't deliver is worse than not promising.

## Dispatch 13 — Promo redemption + A/B testing

**The question:** Wire end-to-end OR pull from v1.0 for both?

Both features have admin-side UI working but no customer-side path. Same logic as SiguradoShield.

**Recommended:** Pull both. No marketing campaigns planned for v1.0 = promo wire is dead code. No statistical-significance volume for several months = A/B wire is theatrics. Wire when first real campaign / first real hypothesis exists.

## Dispatch 14 — Optional: Admin SSO

**The question:** Wire Google Workspace OIDC for admin login, or stay with email + 2FA?

Email + 2FA works (Dispatch 10 wires backup codes properly). SSO adds central account management — when a contractor leaves, deactivate their Google account and they lose admin access automatically.

**Recommended for v1.0:** Stay with email + 2FA if you have <5 admins. Add SSO when admin count grows past 5 or when you bring on contractors.

## Dispatch 14 — Optional: Provider review training document

**The question:** Should the AI coder draft `docs/PROVIDER-REVIEWER-TRAINING.md`?

The Dispatch 09 closeout flagged this as out-of-scope but high-priority. The 2-hour training covers NBI clearance authentication, government ID matching, selfie comparison red flags, address verification, rejection taxonomy.

**Recommended:** Yes, draft it as a separate request after Phase 14 closes. The reviewer (Ken or hire) needs it before processing the first 5-10 applications. Without it, you'll learn by mistakes, and the mistakes hit real providers.

---

# Section 4 — Gate failures: what each one means

When CI shows a gate failed, this section tells you what's happening.

## Gate A failed

Cross-source-of-truth violation. Some value or pattern that should be in one canonical place is duplicated or drifted in another file.

**Common causes:** AI coder hardcoded a value that should come from the server (e.g., a tier criterion in mobile code). Brand color #0066FF used in a new file (should be the new #1B3A4B). Cancellation percent literal in a help screen.

**Your action:** read the gate output. It names the file and line. Send back to AI coder: "Fix the cross-source drift; consult Part 4 §Gate A." The AI coder either moves the value to the canonical source or adds a `// gate-a-allowed:` justification (rare, requires your approval).

**When to amend the gate:** if the gate is producing repeated false positives across 3+ unrelated PRs, the gate logic is wrong. Open a meta-PR refining the gate, not bypassing the violations.

## Gate B failed

Bug claim doesn't have substance. The closeout says Bug N is fixed but either no file change in the diff or no test references the bug.

**Common causes:** AI coder claimed a fix was "encompassed by" another fix but didn't update the closeout language. AI coder forgot to add the bug number reference in the test name/comment. AI coder is genuinely faking green.

**Your action:** read the gate output. It names the bug. Ask AI coder: "Show me the test for Bug N." If a real test exists and the closeout just needs cleanup, accept. If no test exists, send back hard with: "Either add the test or remove the bug from the closeout."

## Gate C failed

Constitutional violation. AI coder used a banned pattern (console.log, axios, emoji as icon, money mutation outside transaction).

**Common causes:** AI coder added debug console.log and forgot to remove. Imported axios out of habit. Used 🚀 as a button icon. Forgot to wrap a money mutation in db.transaction.

**Your action:** read the gate output. The fix is mechanical. AI coder removes/replaces the violation. Re-run gates.

**The exception path:** legitimate cases need `// gate-c-allowed: <justification>` inline comment. The Phase 08 BIR OR issuance after tx commit is the canonical example. New exceptions need your sign-off in writing — don't let the AI coder add `// gate-c-allowed:` comments unilaterally.

## Gate D failed

Visual regression. A screen looks different from its baseline.

**Common causes:** AI coder genuinely changed UI (e.g., updated the brand color). AI coder accidentally broke a layout (e.g., padding shifted). Browser/device version drift in CI.

**Your action:** download the visual diff artifact from the failing CI run. Compare baseline vs current. If the change is intentional and matches the dispatch's stated UI work, ask AI coder to update baselines and re-run. If unintentional, send back: "Visual regression at <file>. Investigate."

**The trap:** AI coder will sometimes update baselines to "fix" Gate D without examining the actual change. This is the worst kind of fake-green because Gate D's whole purpose is to catch unintended visual changes. Always compare diffs personally before accepting baseline updates on a dispatch that wasn't supposed to touch UI.

## Gate E failed

Mutation testing score below 99%. Some surviving mutants — places where production code could change and tests would still pass.

**Common causes:** AI coder wrote tests that exercise code without asserting outcomes. Test asserts `expect(result).toBeDefined()` instead of `expect(result.amount).toBe(50000)`. Test missing edge case assertions.

**Your action:** download the mutation report from the failing CI run. The HTML report shows surviving mutants with explanations. Send back with: "Add tests for surviving mutants. Don't lower the threshold." If genuinely impractical (e.g., a generated file can't be tested usefully), the AI coder amends `stryker.config.json` to exclude the file with your explicit approval.

---

# Section 5 — Escalation paths

Some situations don't have clean solutions. This section covers what to do when something feels off.

## When the AI coder seems stuck in a loop

Symptoms: same gate fails 3+ times. AI coder keeps "fixing" but the fix introduces new violations. Closeout language gets vague.

**Your action:** stop the dispatch. Open `.ai-coder/escalations/E<NN>-<dispatch>-<date>.md` and document:
- What dispatch
- What gate keeps failing
- What attempts have been made
- Your hypothesis why it's stuck

Either:
1. Restart the dispatch with clearer specifications
2. Split the dispatch into smaller units (one bug per PR)
3. Pair-program with the AI coder live (you watching, asking questions, the AI coder narrating)

The third is most expensive (your time) but most reliable when stuck.

## When you suspect fake-green that gates didn't catch

Gates are good but not perfect. If your gut says something is off, investigate:

- **Read the actual test for a critical bug** — even if you don't understand the language fully, you can usually tell if the test asserts what it claims to. A test for "Bug 176 — addon prices server-canonical" should have an `expect()` line that checks server-side price computation. If you can't find one, that's a red flag.
- **Run the verification script in Section 6** — operational checks like `verify-bir-or-series.sh` are designed to be readable.
- **Ask another AI for a second opinion** — open a fresh Claude conversation, paste the closeout file + the actual test files (downloaded from the PR), ask "is this test actually testing what the closeout claims?"

## When something breaks in production after launch

Different situation, different handbook. Phase 14 leaves you with `docs/runbooks/incident-response.md` from Dispatch 14. Read that runbook before the first incident, not during.

The shape: declare incident → war room (you + on-call platform engineer) → diagnose → mitigate (rollback or hotfix) → write postmortem within 5 days → action items prevent recurrence.

The most common rollback path: deploy previous tag. Every dispatch tags a release (e.g., `v0.14.0-d05-complete`). If a deploy goes bad, redeploy the previous tag. The migrations are forward-compatible (additions, not breaking changes) so rollback is safe up to the previous schema version.

## When the AI coder asks you a question you don't know how to answer

Some questions require domain expertise you may not have. Examples:
- "Should the cancellation policy treat a hurricane warning as a force-majeure exception?"
- "What's the appropriate retention period for marketing consent records?"
- "Is the platform liable if a provider damages customer property and refuses to pay?"

These require legal or domain consultation. Don't answer off the cuff.

**Your action:** consult someone who knows. For legal: your business attorney or NPC consultant. For insurance/liability: insurance broker. For tax/accounting: your accountant. The AI coder waits while you get the answer.

---

# Section 6 — Launch readiness final checklist

This is your final go/no-go checklist for v1.0 launch. Run through it in order. Each item must PASS before approving launch.

## Code completeness

- [ ] All 14 dispatches merged to main
- [ ] Tag `v1.0.0-launch-ready` applied
- [ ] All 5 gates passing on main
- [ ] No open PRs from `phase/14-*` branches
- [ ] LAUNCH-LIMITATIONS.md reflects current state (§1-26)

## Operational readiness — regulatory

- [ ] NPC DPO registered (Item 1, Dispatch 14). Reg # recorded. DPO email in privacy policy.
- [ ] BIR Authority to Print obtained (Item 2). OR series allocated. ATP # recorded.
- [ ] DTI permit current (Item 3). PDF on file. Expiry > 90 days from launch.
- [ ] Mayor's permit current (Item 4). PDF on file. Expiry confirmed.

If any of these is missing, **postpone launch.** These are not graceful degradation candidates. Operating without them creates regulatory exposure that no code fix can address.

## Operational readiness — payments

- [ ] PayMongo merchant onboarding complete (Item 7). Live mode active. Settlement bank set.
- [ ] BIR e-receipt issuance verified end-to-end (Item 12). Test transaction issued OR successfully.
- [ ] S3 BIR bucket Object Lock enabled (Item 8). 10-year retention confirmed.

If PayMongo isn't live, you cannot accept payments. If BIR e-receipts aren't working, every transaction creates BIR audit exposure. If S3 BIR Object Lock isn't enabled, BIR documents could be deleted by mistake or attack.

## Operational readiness — infrastructure

- [ ] Sentry production project receiving events (Item 6)
- [ ] hCaptcha production keys deployed (Item 5)
- [ ] DNS + TLS A+ rated on api.onservice.ph and admin.onservice.ph (Item 10)
- [ ] Postgres PITR verified by test restore (Item 9)

## Visual + functional smoke

- [ ] All 110 screens visual baselines pass (Maestro mobile + Playwright admin)
- [ ] All 7 critical-path E2E flows pass (Dispatch 14 smoke suite)
- [ ] Cross-device check: iPhone 15 + Pixel 7 both render correctly

## App store readiness

- [ ] iOS app submitted to App Store with privacy manifest declaring location data
- [ ] Android app submitted to Play Store with sensitive permissions justification
- [ ] Both apps approved (typical: 1-3 days iOS, 7-14 days Android)
- [ ] Production marketing materials don't promise features in LAUNCH-LIMITATIONS

## Operational readiness — people

- [ ] Provider reviewer trained (2-hour training per `docs/PROVIDER-REVIEWER-TRAINING.md`)
- [ ] On-call rotation defined for incidents (you + at least one technical person)
- [ ] Customer support email/phone wired
- [ ] DPO contact email monitored

## Soft launch protocol

Before public launch, run a soft launch phase:

- [ ] Internal test: you + 5 trusted users complete full booking flow (signup → book → complete → review → tip)
- [ ] Provider test: 3 real providers complete onboarding (signup → upload docs → admin review → first job)
- [ ] Edge case test: cancellation, dispute, refund flows exercised
- [ ] Money flow audit: ₱100 booked, ₱100 refunded, ledger balances to zero

If any of these surface issues, do not public-launch. Fix and retest.

---

# Section 7 — Beyond launch (the v1.1+ roadmap)

After launch lands, your operating model shifts. This handbook covers Phase 14. Beyond Phase 14, the cadence is different:

## Weekly operating rhythm (post-launch)

- **Monday** — review last week's incidents, customer support tickets, NPC DSR submissions. Decide priorities.
- **Tuesday-Thursday** — AI coder works on prioritized items. Each item is a smaller dispatch (1-3 bugs/features) following the same gate process.
- **Friday** — review the week's PRs. Approve and merge.

Phase 14's 14-dispatch structure does not repeat. The gates remain. Each new feature/fix follows the dispatch closeout template. The constitutional rules accumulate (you'll add Gate F, Gate G as new architectural invariants emerge).

## v1.1 priority decisions

Items in LAUNCH-LIMITATIONS to consider for v1.1+:

| §  | Item | Trigger to wire |
|----|------|----------------|
| 19 | SiguradoShield | When insurance partner LOI signed |
| 20 | (resolved) | — |
| 21 | (resolved) | — |
| 22 | Customer DSR list view | When 5+ customers ask for "where's my data request" |
| 23 | DSR rate limiting | When DSR spam attempted |
| 24 | Selfie liveness vendor | When provider review queue exceeds 50/day |
| 25 | Promo redemption | When first marketing campaign concept exists |
| 26 | A/B testing | When first hypothesis documented |

Don't wire features in LAUNCH-LIMITATIONS proactively. Wire when usage forces the decision. Every premature wire becomes the next phase's audit finding.

## When to commission a new audit

Phase 14 was an exhaustive audit. The next one is needed when:
- The codebase grows >50% (new features, screens, services)
- A new compliance regime becomes relevant (HIPAA, GDPR if expanding beyond PH)
- A material incident reveals systemic issues
- A potential acquirer requests due diligence
- Approximately 18-24 months after the last audit (drift accumulates)

Use the same approach: deep multi-session read of every file with citations and bug numbering. The Phase 14 audit took 17 sessions. Plan for similar effort.

## When to bring on a human engineer

Some signals it's time to add a human technical lead:
- Dispatch backlog grows past your capacity to review (>2 dispatches/week)
- Operational complexity exceeds what runbooks cover (multi-region, regulatory expansion)
- Customer base requires SLA commitments (uptime guarantees, response times)
- Investor pressure for "real engineering team"

The transition is straightforward because the handbook + Parts 1-4 + dispatch closeouts give a new engineer immediate orientation. They read the package, run the verification scripts, work through 1-2 dispatches under your guidance, and own the role.

Don't add an engineer prematurely. The AI coder + gate system gets you to launch and through early growth. Add humans when the model breaks, not before.

---

# Section 8 — Closing thoughts

A few final notes that don't fit elsewhere.

**Trust the system, but verify the signal.** Phase 14's gate hardening is the structural defense against fake-green. Use it. When a closeout claims green and the gates pass, the work is most likely done correctly. When something feels off, investigate. The gates are necessary but not sufficient — your gut still matters.

**Be patient with the operational items.** NPC, BIR, DTI, Mayor's permit, PayMongo — these are slow institutions. 30+ day cycles are normal. Plan launch backwards from these dependencies, not forwards from when the code lands. Many would-be launches missed dates because founders assumed institutions would move at startup speed.

**Communicate clearly with the AI coder.** Vague directives produce vague output. "Fix the booking flow" produces ambiguous work. "Implement the spec in Part 2B section 14, achieving the 4 required states with the patterns in Dispatch 11" produces precise work. The package is the communication channel — use it.

**Don't bypass the gates.** You configured "Include administrators" in branch protection for a reason. The first time a hot-fix tempts you to push directly to main, resist. Open a PR with `[hotfix]` label, get gates green, merge. The minutes of delay are worth more than the structural integrity of the gate system.

**Document decisions in writing.** Every architectural decision goes in `.ai-coder/decisions/D<NN>-<topic>.md`. Six months from now, you (or a successor) will need to know why SiguradoShield was pulled, why the cancellation tiers are what they are, why marketing consent defaults off. The decision documents are the memory.

**Don't ship features that look complete but aren't.** The Phase 14 audit found three of these (SiguradoShield, promo redemption, A/B testing). All three got pulled. The lesson: half-shipped features are worse than not-shipped features because they create false expectations and audit findings. Ship when complete.

**Respect the LAUNCH-LIMITATIONS document.** Every limitation listed is intentional. When a customer asks "why doesn't this work?", LAUNCH-LIMITATIONS is the honest answer. Don't promise features outside it. Don't let marketing copy drift past it. The limitations are the contract with users; honoring them builds trust.

---

# Appendix — Document map

The full Phase 14 instruction package is 13 documents. When you need to reference one:

| Document | Purpose | When to consult |
|---|---|---|
| AI-CODER-MASTER-BRIEF.md | Constitution + dispatch overview | At start of Phase 14; when AI coder seems unaligned |
| DESIGN-CONTRACT-V2.md | Brand + components + states | When evaluating any visual change |
| SCREEN-CATALOG-PART-2A-ADMIN.md | 28 admin pages | When admin work is in progress |
| SCREEN-CATALOG-PART-2B-MOBILE-CUSTOMER.md | 43 customer screens | When customer work is in progress |
| SCREEN-CATALOG-PART-2C-MOBILE-PROVIDER.md | 39 provider screens | When provider work is in progress |
| PART-3-BUG-REMEDIATION-DISPATCHES-01-02.md | Deploy blockers + cross-source | Dispatches 1-2 review |
| PART-3-BUG-REMEDIATION-DISPATCHES-03-04.md | Gate hardening + SiguradoShield | Dispatches 3-4 review |
| PART-3-BUG-REMEDIATION-DISPATCHES-05-06.md | Money trust + transactional | Dispatches 5-6 review |
| PART-3-BUG-REMEDIATION-DISPATCHES-07-08.md | Provider trust + NPC | Dispatches 7-8 review |
| PART-3-BUG-REMEDIATION-DISPATCHES-09-10.md | Onboarding + dispatch console | Dispatches 9-10 review |
| PART-3-BUG-REMEDIATION-DISPATCHES-11-12.md | Mobile polish | Dispatches 11-12 review |
| PART-3-BUG-REMEDIATION-DISPATCHES-13-14.md | Feature decisions + cutover | Dispatches 13-14 review |
| PART-4-GATE-HARDENING-REFERENCE.md | The gate system | When a gate fails or you're amending |
| PART-5-KEN-HANDBOOK.md | This document | Throughout Phase 14 |

---

# The package is complete

You now have everything needed to take this to your AI coder and run Phase 14 to launch:

- **What to build** — Parts 1, 2A, 2B, 2C
- **How to build it** — Part 3 (14 dispatches)
- **How to enforce quality** — Part 4 (5 gates)
- **How to run the process** — Part 5 (this handbook)

The 14 dispatches will take your AI coder approximately 6-12 weeks of focused work, plus the 30+ day operational items running in parallel. Expect 8-10 calendar weeks total elapsed if you stay on top of decisions and operational filings.

When you're ready, hand the package to the AI coder. Start with Dispatch 01. Work through in order. Don't skip ahead. Each dispatch builds the foundation the next dispatch needs. By the time Dispatch 14's `v1.0.0-launch-ready` tag is applied and Section 6's checklist completes, onService PH is operational.

Good luck.
