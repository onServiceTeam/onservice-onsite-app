# THE 100% ACCURACY PROTOCOL

**This document defines the maximum-rigor self-verification process the AI coder must follow. It is designed to catch every category of failure mode that AI coders commit, by structurally preventing the AI from declaring work "done" until evidence proves it.**

This document supersedes `SELF-VERIFICATION-PROTOCOL.md` for any phase that produces production code. The earlier protocol stays as a quick-reference for non-code phases.

---

## The Honesty Mandate

The AI coder operates without a senior engineer reviewing its work. Ken cannot read the code. The temptation is therefore enormous: claim "done," move on, accumulate hidden debt.

**The single rule that prevents collapse:**

> **You may not claim a phase is done unless every claim you make can be backed by an artifact in the commit. No artifact, no claim. No claim, no progress.**

If you say "tests pass," there must be a test log file in the commit.
If you say "the form submits," there must be a screenshot or a recorded interaction trace.
If you say "the migration runs cleanly," there must be a migration log.
If you say "I checked X," there must be evidence in `.ai-coder/checkpoints/logs/PHASE-NN/` proving you checked it.

If you cannot produce the artifact, you did not do the check, and you may not claim it.

This is not a guideline. It is the operational definition of integrity for this project.

---

## The Six Gates

Every phase passes through six gates in sequence. You cannot skip a gate. You cannot run gates in parallel. You cannot claim a gate passed without evidence.

```
GATE 1 — Mechanical Correctness    (compiler, linter, type system)
       ↓
GATE 2 — Behavioral Correctness    (the code does what it claims)
       ↓
GATE 3 — Adversarial Self-Review   (you attack your own code)
       ↓
GATE 4 — Visual & Interactive      (UI matches design, interactions work)
       ↓
GATE 5 — Integration & Regression  (nothing else broke)
       ↓
GATE 6 — Evidence Audit            (every claim is backed by artifact)
```

If any gate fails, you stop, fix the underlying issue, and **restart from Gate 1**. You do not "verify around" a known issue. You do not "patch and continue." You restart.

---

## Gate 1 — Mechanical Correctness

### What it checks

The compiler, linter, type system, and forbidden-pattern scanner accept the code unconditionally.

### Commands to run

```bash
# All from repo root, in this exact order:
npm run typecheck                                     2>&1 | tee logs/gate-1-typecheck.log
npm run lint                                          2>&1 | tee logs/gate-1-lint.log
bash .ai-coder/checkpoints/verify-no-forbidden.sh     2>&1 | tee logs/gate-1-forbidden.log
bash .ai-coder/checkpoints/verify-no-emoji.sh         2>&1 | tee logs/gate-1-emoji.log
git status --porcelain                                2>&1 | tee logs/gate-1-git.log
```

(`logs/` here means `.ai-coder/checkpoints/logs/PHASE-NN/`. Create it before running.)

### Pass criteria

All of these must be true:
- `gate-1-typecheck.log` ends with no errors. Zero. (Warnings: also zero.)
- `gate-1-lint.log` ends with no errors. Zero. (Warnings: also zero.)
- `gate-1-forbidden.log` ends with `PASS:`.
- `gate-1-emoji.log` ends with `PASS:` (after Phase 02).
- `gate-1-git.log` shows only files you intentionally changed.

### Forbidden moves

- Suppressing a typecheck error with `// @ts-ignore`, `// @ts-expect-error`, `as any`, or `as unknown as X`.
- Adding a file to `.eslintignore` to silence a lint error.
- Commenting out a forbidden-pattern check to make it pass.
- Editing the checkpoint scripts themselves to be less strict.
- Re-running until the count "looks right."

If you find yourself wanting to do any of the above, **stop**. Open an escalation. The thing you're trying to bypass is real and needs to be fixed properly.

---

## Gate 2 — Behavioral Correctness

This is where most AI coders fail. The code compiles. It looks right. But it doesn't actually do what it claims to do.

### Step 2a — Trace every new code path on paper

For every function, component, route, or migration you wrote or modified in this phase:

1. Open a fresh markdown file: `logs/gate-2-trace-<feature>.md`
2. State the entry point (HTTP route, button click, scheduled job, migration command).
3. Walk through the code line by line, writing what each line does. Be specific:
   - Not "calls the database"
   - But: "calls `db.query('SELECT * FROM bookings WHERE id = $1', [id])`, returns `BookingRow | undefined`"
4. At every branch, document both branches. Not just the happy path.
5. At every `await`, document what happens if the awaited promise rejects.
6. At every `try/catch`, document what the catch does and whether the caller is told.
7. At the exit, state the return value and its type.

If you can't walk the code on paper, **the code is too complex** and must be refactored before proceeding.

### Step 2b — Test the boundaries deliberately

For every parameter to every new function, write down what happens at:

| Boundary | What you must verify |
|---|---|
| `null` / `undefined` | Function rejects or handles gracefully — not silently coerces |
| Empty string `""` | Treated correctly (usually rejected) |
| `0` | For numbers — not confused with falsy |
| Negative numbers | Rejected if illegal, handled if legal |
| Maximum value | `Number.MAX_SAFE_INTEGER` for numbers, very long strings, max-size payloads |
| Unicode / emoji input | Strings handle multi-byte chars correctly |
| Whitespace-only | Trimmed or rejected |
| SQL injection patterns | `'; DROP TABLE users; --` — must be parameterized |
| XSS patterns | `<script>alert(1)</script>` — must be escaped on render |
| Path traversal | `../../../etc/passwd` — file paths must be validated |
| Concurrent calls | Two requests at the same moment — race condition? |
| Network failure | What happens if PayMongo / Twilio / SMS is down? |
| Database unavailable | Does the request fail fast or hang? |
| Auth absent | 401 without crash |
| Auth present, wrong role | 403 without leaking data |

Document every one of these in `logs/gate-2-boundaries-<feature>.md`. For each, state: tested explicitly | covered by existing test | safe by construction (with proof). "Not applicable" requires written justification.

### Step 2c — Run the tests you wrote

```bash
npm run api:test -- <new-test-file>     2>&1 | tee logs/gate-2-newtests.log
npm run api:test                         2>&1 | tee logs/gate-2-alltests.log
```

Pass criteria:
- All new tests pass
- Test count after = test count before + tests you added (no silent deletions)
- No tests skipped (`it.skip`, `xit`, `describe.skip`)
- No tests with `.only` (would silently skip everything else)
- No `setTimeout` > 1 second in tests (deterministic only)

Verify no `.only`/`.skip`:

```bash
grep -rnE "(it\.only|describe\.only|xit|it\.skip|describe\.skip)" packages/api/__tests__ apps/*/__tests__ 2>/dev/null
# Must return empty
```

---

## Gate 3 — Adversarial Self-Review

This is the gate AI coders most often skip. You are not done writing the code; now you must **attack** it.

### Step 3a — Mutation testing (the killer test)

This is the single most powerful technique. **For every test you wrote, prove the test catches the bug it claims to test.**

Procedure:

1. Pick the test.
2. Read the production code it covers.
3. **Deliberately introduce a bug.** Examples:
   - Flip a `>` to `<`
   - Change `+` to `-` in a money calculation
   - Replace a return value with `null`
   - Skip a validation check
   - Use the wrong variable
4. Run the test.
5. **Confirm the test fails.**
6. Restore the original code.
7. Run the test again. Confirm it passes.
8. Document the mutation and outcome in `logs/gate-3-mutations-<test>.md`.

If a test passes both with the bug present and with the bug absent, **the test is a phantom**. Delete it or rewrite it. A test that doesn't fail when the code is wrong is worse than no test, because it lies.

You must perform mutation testing on:
- Every money-handling function (commission, fees, refund split, escrow release)
- Every state transition (booking, dispute, escrow)
- Every authorization check
- Every input validator

Minimum: **at least 3 mutations per test file**, all of which must produce test failures.

### Step 3b — The "delete and check" test

For every meaningful chunk of new production code:

1. Comment out the chunk.
2. Run the test suite.
3. **Confirm tests fail.**
4. Restore the code.

If commenting out the code does not break any test, the code is either dead (delete it) or untested (write a test).

### Step 3c — Hostile input check

Take every endpoint you added or modified. Hit it with:

```bash
# Without auth
curl -i http://localhost:3000/api/v1/<endpoint>   # expect 401

# With wrong role's token
curl -i -H "Authorization: Bearer <customer-token>" http://localhost:3000/api/v1/admin/<endpoint>  # expect 403

# With malformed JSON
curl -i -X POST -H "Content-Type: application/json" -d '{not json' http://localhost:3000/api/v1/<endpoint>  # expect 400 with helpful error

# With missing required fields
curl -i -X POST -H "Content-Type: application/json" -d '{}' http://localhost:3000/api/v1/<endpoint>  # expect 400 listing missing fields

# With type mismatches (string where number expected)
curl -i -X POST -H "Content-Type: application/json" -d '{"amount":"not-a-number"}' ... # expect 400

# With injection attempts
curl -i -X POST -d '{"name":"\u0027; DROP TABLE users; --"}' ... # expect 400 or stored safely

# With absurd values
curl -i -X POST -d '{"amount":99999999999999}' ... # expect 400 or graceful
curl -i -X POST -d '{"amount":-1}' ... # expect 400
```

Capture every response in `logs/gate-3-hostile-<endpoint>.log`.

### Step 3d — The "two weeks from now" question

For each significant change in this phase, write down in `logs/gate-3-future-bugs.md`:

> "If a customer reports a bug related to this code two weeks from now, what is the most likely bug? What evidence do I have that I prevented it?"

Be specific. "Edge case in the money calculation" is not a real answer. "The cancellation refund returns 99% instead of 100% because of float-to-int rounding when the price is 33333 centavos" is a real answer. Then verify, with a test, that the real answer doesn't manifest.

### Step 3e — The Pre-Mortem

Write `logs/gate-3-premortem.md` answering:

> "It is six months from now. This phase's code caused a serious incident. What happened?"

Brainstorm at least 5 plausible incident stories. For each, identify:
- The root cause
- Whether the current code is vulnerable
- What test or guard would prevent it
- Whether you've added that guard

If the brainstorm reveals a real vulnerability not yet guarded against, you stop and add the guard. The pre-mortem is not theatre; it is a concrete remediation step.

---

## Gate 4 — Visual & Interactive

For phases that touch UI (which is most of them).

### Step 4a — The screen audit

For every screen the phase added or modified, fill in `templates/SCREEN-AUDIT-TEMPLATE.md` and save to `logs/gate-4-screen-<name>.md`.

Required visual checks:
- Loading state exists and matches design
- Error state exists and is user-friendly (no stack traces, no "undefined")
- Empty state exists and gives the user something to do
- Success state matches design
- Layout at desktop (1920×1080), laptop (1440×900), small laptop (1280×720), tablet, mobile (375px)
- Dark mode (if supported)
- High contrast mode (Windows)
- Keyboard navigation (Tab through every interactive element)
- Screen reader labels (every button has accessible name)
- Color contrast (every text/background pair meets WCAG AA)
- Touch targets ≥ 44px on mobile

### Step 4b — Interaction recording

For every user flow the phase added or modified, record an interaction trace.

Manual procedure:
1. Open the running app.
2. Open browser DevTools → Network tab and Console tab.
3. Take a screenshot of the starting state.
4. Perform the flow step by step. Take a screenshot at each step.
5. After the flow, screenshot the Network tab (showing each request, status, timing).
6. Screenshot the Console tab (must be empty — no warnings, no errors).
7. Save all screenshots to `logs/gate-4-flow-<name>/`.
8. Write a brief narrative in `logs/gate-4-flow-<name>.md`: what you did, what you saw, what each request returned, why each step is correct.

### Step 4c — The "stranger" test

For each new UI:

> "If a stranger who has never seen this product sat down at this screen, would they understand what to do? Would they know what state they're in? Would they know how to get back?"

If the answer is no, the screen needs labels, hints, or a different layout.

### Step 4d — The "phone in sunlight" test (mobile only)

For mobile screens:

> "Could a person hold this phone in direct outdoor sunlight and still read the screen?"

Check: minimum text size 14px (16px preferred for body), color contrast at least 4.5:1, no light-gray-on-white "secondary" text smaller than 12px.

---

## Gate 5 — Integration & Regression

The new code didn't break anything else.

### Step 5a — Full test suite, fresh DB

```bash
# Reset to a fresh DB (only do this on local dev DB — never staging/prod)
npm run migrate:down --workspace=packages/api && npm run migrate:up --workspace=packages/api

# Run all migrations from scratch
npm run migrate:up --workspace=packages/api                             2>&1 | tee logs/gate-5-migrate.log

# Run the entire test suite
npm run api:test                               2>&1 | tee logs/gate-5-fulltests.log

# Compare to baseline
diff <(grep "passed\|failed\|skipped" /tmp/baseline.log) <(grep "passed\|failed\|skipped" logs/gate-5-fulltests.log)
```

Pass criteria:
- Migrations run cleanly from empty DB to current state
- Test count = baseline + tests this phase added (no other deltas)
- Zero test failures
- Zero new test skips

### Step 5b — Money conservation (sacred)

```bash
bash .ai-coder/checkpoints/verify-money-conservation.sh   2>&1 | tee logs/gate-5-money.log
```

Must pass. If this ever fails on a phase that did not touch money code, you have discovered a regression caused by something else. Stop and report to Ken.

### Step 5c — Critical path smoke test

Manual procedure (or scripted with Playwright if set up):

1. Create a test customer via API.
2. Place a booking through the mobile app.
3. Provider (test account) accepts the booking.
4. Provider marks "en route," "arrived," "in progress," "completed."
5. Customer confirms completion.
6. Verify in admin: escrow released, commission calculated, provider wallet incremented.
7. Customer files a dispute.
8. Admin resolves the dispute (50/50 split).
9. Verify money flows match the resolution.
10. Customer triggers withdrawal from wallet.
11. Verify withdrawal record created with correct amount.

Record screenshots and database state queries in `logs/gate-5-smoke/`.

### Step 5d — Performance check

For any new endpoint:

```bash
# Use Apache Bench or autocannon
npx autocannon -c 10 -d 30 -m POST -H "Authorization: Bearer <token>" --body '<payload>' http://localhost:3000/api/v1/<endpoint>
```

Record results. Pass criteria:
- p99 latency < 1 second for read endpoints
- p99 latency < 3 seconds for write endpoints (with DB writes)
- Zero errors under 10 concurrent users for 30 seconds
- No memory growth on the API process during the test

For any new admin page:
- First contentful paint < 2 seconds on a cold load
- Time to interactive < 3 seconds
- No more than 50 network requests on initial load (often missed; check the Network tab)

### Step 5e — The N+1 detector

For every list endpoint or page the phase touched:

1. Populate the DB with realistic data (use `seeds/realistic.sql` or generate 100 rows).
2. Open the page or hit the endpoint.
3. Count the database queries (use `pg_stat_statements` or log all queries).
4. The query count must be O(1) or O(log N), not O(N).

If you see 1 + N queries, **rewrite using JOIN, IN-clause, or a batch loader** before proceeding.

---

## Gate 6 — Evidence Audit

The final gate. You audit your own evidence.

### Step 6a — Inventory every claim

Open the phase document. For every step, list every claim it implies you made. Examples:
- "Wrote the migration" → claim: migration file exists at `packages/api/migrations/050_*.sql`
- "Replaced emoji icons" → claim: zero emoji-as-icon patterns remain in the codebase
- "Added the dashboard charts" → claim: recharts components are imported and render with real data
- "Added tests" → claim: test files exist and pass
- "Verified the form submits" → claim: I clicked submit on the form and got a successful response

For each claim, identify the artifact that proves it.

### Step 6b — Locate every artifact

Search `.ai-coder/checkpoints/logs/PHASE-NN/` for the artifact for each claim. If you cannot locate the artifact, you must:

1. Mark the claim as unverified.
2. Re-run the verification.
3. Produce the artifact.
4. Or, if you cannot, **retract the claim**.

A retracted claim means the phase is incomplete. You return to Gate 1.

### Step 6c — Adversarial review of evidence

For each artifact:

> "If a skeptical reviewer wanted to argue this artifact doesn't actually prove what I claim, what would they say?"

Examples of suspicious evidence:
- A test log showing "0 tests passed" instead of "47 tests passed" (means no tests ran)
- A screenshot showing the wrong page
- A migration log that ends with "ROLLBACK" instead of "COMMIT"
- An API response showing `200 OK` but with `{"success": false}` body
- A typecheck log that ends without the explicit "0 errors" line

If your evidence has any of these features, the evidence is weak. Strengthen it before passing the gate.

### Step 6d — Write the Evidence Manifest

Create `logs/EVIDENCE-MANIFEST.md`:

```markdown
# Evidence Manifest — Phase NN

## Claims and Artifacts

| Claim | Artifact | Strength |
|---|---|---|
| TypeScript compiles cleanly | logs/gate-1-typecheck.log (line 47: "0 errors, 0 warnings") | Strong |
| New endpoint authenticates | logs/gate-3-hostile-/admin/providers/123.log (curl 401 without auth) | Strong |
| Form submits | logs/gate-4-flow-provider-detail/screenshot-05-success.png + network tab .png | Strong |
| Tests pass | logs/gate-2-alltests.log (line 412: "Tests: 247 passed") | Strong |
| Money conservation holds | logs/gate-5-money.log (4 test files all passing) | Strong |

## Self-attestation

I attest that I personally generated each artifact in this manifest in this session, by running the indicated command or performing the indicated action. I did not fabricate, copy from a previous phase, or skim past failures. Each artifact corresponds to a real, current state of the codebase.

If any of this is untrue, I have committed a constitutional violation under Article 2 (Truth-Telling).

Signed: [AI coder identifier and timestamp]
```

This manifest is the most important document the AI coder produces. It is what Ken can audit. It is what makes the difference between a verified phase and an asserted one.

---

## The Restart Rule

If you discover, at any gate, that an earlier gate's claim was untrue:

1. **You do not patch and continue.**
2. You revert to the start of Gate 1.
3. You re-run every gate.
4. You produce fresh artifacts for each.

The penalty for inconsistency is severe because consistency is the only thing keeping the system honest.

---

## What "100% Accuracy" Actually Means Here

100% accuracy is **not a guarantee that no bug exists**. No engineer, human or AI, can guarantee that.

100% accuracy means:

- 100% of claims are backed by artifacts
- 100% of artifacts are generated in the current session
- 100% of tests catch the bugs they claim to catch (mutation-tested)
- 100% of branches in the code have been traced on paper
- 100% of boundaries have been considered explicitly
- 100% of hostile inputs have been tested
- 100% of pre-mortem scenarios have remediation
- 100% of regressions have been caught (full test suite, fresh DB, money conservation)
- 100% of evidence has been adversarially reviewed

That is what the AI coder can deliver, and what is required.

---

## The Final Honesty Test

Before you write the phase report to Ken, answer these three questions in writing in `logs/HONESTY-CHECK.md`:

1. **Did I run every check listed in this protocol myself in this session, or did I copy results from a previous run?**

2. **Is there any check I felt tempted to skip because "it's obvious it would pass"? If yes, did I run it anyway?**

3. **If Ken hired a senior engineer tomorrow to review this phase from scratch, would they find anything that contradicts my claims?**

If the answer to question 3 is "yes" or "I'm not sure," the phase is not done. You return to whichever gate would have caught the problem and run it again.

---

## When the AI Coder Refuses to Lie

There will be moments when the only path forward seems to be to fudge a check. The test almost passes. The lint almost passes. The screenshot is almost right.

**This is the moment that defines the project.**

The right response is always: stop, escalate, fix the underlying issue. Even if it costs hours. Even if Ken seems impatient. Even if you are uncertain how to fix it.

The system depends on this. Ken cannot read code. Ken cannot run tests. Ken cannot tell whether your claims are true. The only thing standing between Ken and disaster is your own commitment to honesty.

You are the senior engineer. There is no one else. Act accordingly.
