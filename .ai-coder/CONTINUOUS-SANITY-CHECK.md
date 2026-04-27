# THE CONTINUOUS SANITY CHECK

**This is the prompt the AI coder runs after every meaningful change. Not just at end of phase. Continuously, throughout the phase.**

The end-of-phase MASTER-QA-SYSTEM has 463 checks for completeness. This document is different — it's the **broad, narrative, after-every-change** ritual that prevents tunnel vision. AI coders fail not because they don't run end-of-phase checks; they fail because mid-phase they tunnel into "the thing I just changed" and forget to look around.

This document is THAT look-around. Run it after every meaningful change.

---

## What counts as a "meaningful change" (run this check after)

You run this sanity check after each of:

- Adding a new component, page, or screen
- Adding a new endpoint, route, or service function
- Adding or modifying a database migration
- Modifying any function that handles money
- Modifying any state machine (booking, dispute, escrow)
- Modifying any auth or permission logic
- Adding a new dependency
- Refactoring more than 50 lines
- Fixing a bug
- Updating a contract / type / interface that other code depends on
- Anytime you write a test (new or modified)

You do NOT run it after:

- Trivial typo fixes in comments
- Renaming a local variable inside one function
- Reformatting whitespace

When in doubt, run it. It's cheap. The point is mechanical: you stop, you look around, you write down what you found.

---

## 0️⃣ PHASE-SCOPE PREFLIGHT (run BEFORE the first meaningful change of every phase)

Mutation gates and other end-of-phase checks are scoped to the files actually
touched by the phase, not the files the spec *predicts* will be touched. The
two diverge constantly — implementation drifts wider than the plan. If you
discover at end-of-phase that you touched a sacred file that wasn't in the
spec, the testing burden is a surprise and tempts you toward deferral. Avoid
that by confirming scope at the start.

After branching from baseline and before writing implementation code:

1. `git diff --stat $(cat .ai-coder/checkpoints/preflight/baseline-commit.txt)..HEAD` — list every file the phase has touched so far (initially empty; revisit after every meaningful change).
2. **List sacred files in the diff.** Sacred = `escrow.service.ts`, `commission.service.ts`, `dispute.service.ts`, `booking.service.ts`, `payout.service.ts`, `wallet.service.ts`, `settings.service.ts`, anything in `src/services/refund*` — the money-touching surface tracked by the mutation gate.
3. **For each sacred file in the diff that the phase plan did NOT anticipate:** flag it explicitly in `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. Then write the test plan for it BEFORE finishing the implementation. The test plan goes in the same log entry.
4. **Re-run after every sacred-file edit.** If you started touching a new sacred file mid-phase, it's the same problem — flag it, write the test plan, then continue.

The point: tests for sacred files are not optional, are not deferrable, and are not "Phase N+1 work." They belong to the phase that touched the file. Discovering them at end-of-phase is a planning failure; the only fix is to discover them at start-of-phase.

If you find yourself thinking "I'll add tests later" or "I'll defer the mutation gate for this file" — stop. The constitutional answer is that touching a sacred file means writing the tests in this phase. (See TD-005 in `.ai-coder/checkpoints/logs/tech-debt.md` for the rationale.)

---

## THE PROMPT (literally what runs in your head)
> You are acting as a senior full-stack engineer, QA lead, and data integrity auditor.
> Perform a progressive sanity and integrity check on the changes just made.

### 1️⃣ SANITY CHECK

Walk through each of these. Do not skim. Do not say "obviously fine." For each item, either confirm with evidence (the file, the line, the behavior) or flag a problem.

**Wire-up:**
- Are all new UI elements actually rendered? Walk the component tree from the top-level page. If you can't find a path from the page to your new element, the element is dead.
- Are all new buttons wired to handlers?
- Are all new forms wired to submit handlers?
- Are all new routes registered in the router?
- Are all new endpoints mounted in the express app?
- Are all new services exported and imported where used?

**No placeholder / hardcoded data:**
- Search the changed files for hardcoded user IDs, booking IDs, dollar amounts, names, emails, phones, dates.
- Search for `// mock`, `// fake`, `// placeholder`, `// TODO`, `// temporary`.
- Confirm every list comes from an API call, not a constant array.
- Confirm every detail page reads its ID from the URL, not a constant.

**Backend logic is reachable:**
- For every new function: who calls it? Trace upward from the function until you reach a route handler, a cron job, or a test.
- If nothing calls the function, it's dead code. Either wire it up or delete it.

**Data flows correctly:**
- For every new endpoint, trace: HTTP request → middleware → route → service → DB → service response → API response → client → UI render.
- At each step, what type does it expect, what type does it produce?
- Any mismatch is a bug.

**Contract alignment:**
- Frontend Zod schema matches backend Zod schema for the same endpoint? Diff them.
- TypeScript types in the API match types consumed by the client?
- Database column names match the field names used in the service?
- The OpenAPI spec (if it exists) matches the actual route handler?

**Runtime check:**
- Did you actually run the dev server and visit the changed pages? Or did you only read the diff?
- If you didn't run it, run it now.
- Check the browser console — any warnings or errors?
- Check the server logs — any warnings or errors?

**Build check:**
- Does `npm run typecheck` pass?
- Does `npm run lint` pass?
- Does `npm run build` for admin succeed?
- Does the mobile bundle succeed?

**Migrations:**
- Did this change reference a column or table that no migration creates?
- Did you add a migration for the schema change?
- Does the migration run cleanly on an empty DB?
- Does the migration run cleanly on a DB with existing data?

**Forms, inputs, and interactions:**
For every form on a changed page, exercise it manually:
- Submit valid data. Does it succeed? What's the success state?
- Submit invalid data. Does each field show its error? Are errors helpful?
- Submit empty form. Does each required field complain?
- Click every button. Does each one do what its label says?
- Test keyboard navigation: Tab through every input, Enter to submit.
- Test cancel / close / dismiss for every modal.
- Test the back button — does it preserve filters / pagination state?

For every date / time input:
- Pick today. Pick tomorrow. Pick a date 30 days out. Pick a date last year (should reject for booking).
- Pick a time. Confirm it's stored in UTC, displayed in Asia/Manila.
- Try to pick an invalid combination (start time after end time).
- Confirm no JavaScript date arithmetic uses local timezone implicitly.

For every list / table:
- Empty state — what does the user see?
- Single item — does layout work?
- 100+ items — does pagination work?
- Sort by each sortable column — does it actually sort?
- Filter by each filter — does it actually filter?
- Bulk actions on multi-select — do they actually act on the selection?

**Calendars, schedules, date pickers:**
- Today highlighted? Selected date highlighted differently?
- Min and max date constraints respected?
- Disabled dates render disabled?
- Recurring schedule generates the right next dates?
- Holiday / surge rule applies to the right dates?

**Connections and linkage:**
- Does the change touch any place that another piece of code depends on? Search for usages.
- If you renamed a function, did you rename every caller?
- If you changed a return type, did every caller adapt?
- If you added a required field, did every caller provide it?
- If you changed an enum value, did every database row, every test fixture, every UI string update?

**Pre-existing issues (the un-related-but-still-broken rule):**
While walking the code, did you notice anything pre-existing that's broken? Examples:
- A button with no handler (silent dead button)
- A form that says "Save" but the handler logs an error
- A page with mock data still left over from an earlier phase
- A migration that references a column that doesn't exist
- A typo in a user-facing label
- A console.log that escaped review

For each: **decide what to do.** See the "Fix or Escalate" section below. Do not silently leave a broken thing broken.

**Cosmetic issues:**
- Misaligned padding, inconsistent button sizes, wrong icons, wrong colors against the design tokens
- Typos in labels, error messages, button text
- Inconsistent capitalization (some buttons "Save" others "save")
- Truncation that breaks ("John Smit...")
- Loading spinners that don't show, or that show forever
- Hover states missing on clickable things

For each: fix it immediately if it takes < 2 minutes. Otherwise log to `.ai-coder/checkpoints/logs/cosmetic-debt.md` and proceed.

**List issues found and fix immediately** (or escalate per below).

---

### 2️⃣ FEATURE INTEGRITY CHECK

For the feature(s) you just changed, end-to-end.

**Trace UI → Backend → Database → UI:**
- Click the button in the UI.
- Watch the network request. Note its URL, method, payload.
- Find the route handler. Trace into the service.
- See which DB tables / columns are read or written.
- Check the response shape.
- See where the response renders in the UI.

If at any point you find: a hardcoded value, a value that should come from elsewhere, a missing error case, a mismatched type, dead code — fix it now.

**Edge cases:**
- What if the user does this twice rapidly? (Double submit)
- What if the network drops mid-request?
- What if the API returns 500?
- What if the API returns 401 / 403?
- What if the API returns success but with empty data?
- What if the API returns more rows than the UI expects?
- What if a required field comes back null?

For each: confirm the UI handles it. If not, fix.

**Error states handled:**
- Loading state: the spinner / skeleton appears within 200ms.
- Error state: the user sees a useful message, not "undefined" or a stack trace.
- Empty state: the user sees prompts to take an action.
- Success state: the user sees clear confirmation.

**Dead UI / unused backend:**
- Search for components that are imported but never rendered.
- Search for endpoints with no caller.
- Search for service functions with no caller.
- For each, decide: wire up or delete.

**Gap analysis:**
Walk the feature spec one more time. Is anything missing?
- Documented in the phase doc but not implemented?
- Implied by the UI but with no backing logic?
- A button that's there but does nothing on click?

**Fix all issues** or escalate per below.

---

### 3️⃣ SYSTEM REGRESSION CHECK

Did this change break something else?

**Run the full test suite:**
```bash
npm run api:test
```
- All tests still pass?
- Test count = baseline + your additions? (No silent deletions?)
- Any test that used to pass now skipped?

**Manual regression sweep:**
- Click through 3 unrelated pages or flows. Did anything obviously break?
- Open the dev console. Any new warnings?
- Open the network tab on those pages. Any new 404s, 500s, or warnings?

**Data contract consistency:**
- Did this change modify any shared type, schema, or interface?
- If yes: every consumer of that type / schema / interface must adapt.
- Search for usages and confirm each one still works.

**UI/backend expectations:**
- Did the API response shape change? If yes, every UI that consumes it must update.
- Did a UI form change its payload shape? If yes, the backend must update.
- Did an enum value change? Every place that switches on the enum must update.

**Performance regression:**
- Did this change add a query inside a loop? (N+1)
- Did this change increase the bundle size noticeably? (`npm run build` and check)
- Did this change add a synchronous blocking call where async was used?
- Did this change defeat caching?

**Security regression:**
- Did this change remove an auth check?
- Did this change expose data that used to be filtered?
- Did this change log something that's PII?

**List regressions, risks, and fixes. Apply all corrections.**

---

## FIX OR ESCALATE — the decision tree

When you find a problem (whether related to your change or pre-existing), decide:

```
Is the fix small, obvious, and self-contained?
├── YES → fix it now, document in this phase's commit
│   Examples:
│   - Typo in a label
│   - Missing onClick handler on a button
│   - A console.log that should be removed
│   - A missing alt text on an image
│   - A wrong import path
│
└── NO → does the fix require architectural decision?
    ├── YES → STOP. Document in `.ai-coder/checkpoints/logs/escalations/ESC-<date>.md` and ask Ken.
    │   Examples:
    │   - "The auth flow has a race condition that needs a refactor"
    │   - "The dispute state machine has a gap that affects 5 services"
    │   - "The migrations are out of order and need rebasing"
    │
    └── NO, but the fix is large (>50 lines or touches >3 files):
        ├── Is it on the critical path of this phase? → fix it, document why scope expanded
        └── Is it tangential? → log to `.ai-coder/checkpoints/logs/tech-debt.md` for Ken, do not fix in this phase
```

The point: **don't silently rabbit-hole.** Don't spend 4 hours rewriting unrelated code without telling Ken. But also: **don't silently leave a broken thing broken.** The right answer is one of: fix it, log it, or escalate it. Never "ignore it."

---

## THE OUTPUT (what you write down)

After running this check, write a brief log entry. Append to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`:

```
[YYYY-MM-DDTHH:MM:SSZ] After: <what change triggered the check>

SANITY:
  Wire-up: OK | issue: <X>
  Hardcoded data: OK | issue: <X>
  Backend reachable: OK | issue: <X>
  Data flows: OK | issue: <X>
  Contracts: OK | issue: <X>
  Runtime: OK | issue: <X>
  Build: OK | issue: <X>
  Migrations: OK | N/A | issue: <X>
  Forms / interactions: OK | issue: <X>
  Linkage: OK | issue: <X>
  Pre-existing issues found: <list, with what was done>
  Cosmetic issues found: <list, with what was done>

FEATURE INTEGRITY:
  E2E trace: walked <route>, no issues | issue: <X>
  Edge cases: covered | gap: <X>
  Error states: handled | gap: <X>
  Dead UI / unused backend: none | found: <X>
  Gap analysis: <result>

REGRESSION:
  Test count: <before> → <after> (delta = <new tests added>)
  All tests pass: yes | failing: <list>
  Manual regression sweep: clean | found: <X>
  Contract consistency: OK | issue: <X>
  Performance: no regression | concern: <X>
  Security: no regression | concern: <X>

FIXES APPLIED:
  - <fix 1>
  - <fix 2>

ESCALATED:
  - <escalation 1, with file path>

LOGGED FOR LATER:
  - <tech debt 1, with file path>
```

This log is committed with the phase. It is reviewed at end-of-phase by `verify-master.sh`, which confirms the file exists and has at least one entry per significant change in the diff.

---

## INTEGRATION WITH THE REST OF THE SYSTEM

| Layer | When | Check |
|---|---|---|
| **Pre-commit hook** | Every commit | Forbidden patterns, phantom tests |
| **This sanity check** | After every meaningful change (multiple per phase) | The narrative walkthrough above |
| **MASTER-QA-SYSTEM** | End of phase | The 463 explicit check items |
| **100-PERCENT-ACCURACY-PROTOCOL** | End of phase | The 6 gates |
| **verify-master.sh** | End of phase | Aggregates all of the above into pass/fail |

The continuous sanity check is during-phase. The master QA system is end-of-phase. They are complementary, not redundant.

---

## WHY THIS DEFEATS LAZINESS

AI coders fail in three predictable ways:

1. **Tunnel vision** — focused on the change, blind to what they broke nearby.
   → This check forces a regression sweep after every change.

2. **Optimistic skim** — "I'm sure this works, no need to actually test it."
   → This check requires running the app and watching the behavior.

3. **Silent leave-alone** — "That bug exists but I didn't introduce it, not my problem."
   → This check requires a fix-or-log-or-escalate decision for every pre-existing issue noticed.

There is no fourth way out. If you skip this check, the missing log file is detected by `verify-master.sh` at end of phase, and the phase fails Gate 6 (Evidence Audit). You cannot claim a phase done without the sanity check log.

---

## THE BOTTOM LINE (read this twice)

**This check is not optional. It's not "after the hard parts." It's after EVERY meaningful change.**

If a phase takes 8 hours and has 12 meaningful changes, you run this check 12 times. Each run might be 5-15 minutes. Total overhead: 1-3 hours of explicit verification per phase.

That overhead IS the work. It is not separate from the work. It is what separates code that ships to production from code that breaks production.

Ken cannot read code. The only thing standing between Ken and a broken platform is your discipline in running this check, every time, honestly.

If you are tempted to skip it: stop, read the constitution Article 2 (Truth-Telling), and run the check.
