# SELF-VERIFICATION PROTOCOL

This is how you verify your own work. Follow it exactly. The protocol is designed to catch the categories of failure that AI coders commit most often, by forcing structured re-examination of work you think is done.

---

## The Five Layers of Verification

You apply all five layers at the end of every phase, in order. You do not skip layers. Higher layers depend on lower layers passing.

### Layer 1 — Mechanical (the compiler and linter)

Run these commands. All must pass before proceeding to Layer 2.

```bash
npm run typecheck                # zero errors, zero warnings
npm run lint                     # zero errors, zero warnings
npm run api:test                 # all tests pass, count >= prior phase
git status                       # working tree clean (after intentional commits)
```

If any fail, FIX THE PROBLEM, do not move on. Do not silence the warning. Do not add a `// @ts-ignore`.

### Layer 2 — Behavioral (does the code do what it claims)

For every function or component you wrote or modified in this phase:

**A. Read the diff yourself.** Run `git diff main...HEAD` (or the appropriate range). Read every line. Ask yourself: does each line do what I intended?

**B. Trace at least one happy path.** For each new feature, trace through the code by reading it (not running it) starting from the entry point (HTTP handler, button click, scheduled job). At each function call, ask: what's the input? what's the expected output? does the called function match?

**C. Identify three failure modes.** For each new feature, identify three things that could realistically go wrong (network failure, invalid input, concurrent modification, etc.). Verify the code handles each. If it doesn't handle one, fix it before moving on.

**D. Verify boundaries.** What happens at value 0? At value -1? At empty string? At null/undefined? At max value? At Unicode? At 10,000 records? At simultaneous requests? Document your answers in the phase log.

### Layer 3 — Visual (admin and mobile)

If the phase touched any UI:

**A. Run the app.** Start the API server, the admin server, the mobile app (Expo). All three start without errors.

**B. Click through the affected pages.** Not just one. Every page the phase touched. Every state of every page (loading, error, empty, success, edge cases).

**C. Compare to the design contract.** Open `docs/design-system/tokens.json` and `docs/design-system/icon-catalog.md`. Verify the page uses the documented tokens. Take a screenshot if anything looks off and put it in the phase log with explanation.

**D. Test on multiple sizes.** For the admin: 1920x1080, 1440x900, 1280x720. For mobile: iPhone SE (small), iPhone 14 (medium), iPad (tablet, if applicable).

**E. Test interactions.** Click every button. Open every dropdown. Submit every form. Try invalid input. Try empty input. Try valid input. Try interrupting (browser back during submit, network kill mid-request).

### Layer 4 — Integration (does it play nicely with the rest of the system)

**A. Database integrity.** After running migrations, query the affected tables. Run:

```sql
-- The schema matches what you intended
\d table_name

-- No orphaned rows
SELECT COUNT(*) FROM child_table c WHERE NOT EXISTS (SELECT 1 FROM parent_table p WHERE p.id = c.parent_id);

-- The expected indexes exist
\di+ table_name
```

**B. API contract.** For any new or modified endpoint:
- Hit it with curl using a valid auth token. Verify the response shape matches your TypeScript types.
- Hit it with no auth token. Verify 401.
- Hit it with wrong role's token. Verify 403.
- Hit it with malformed body. Verify 400 with helpful error message.

**C. Frontend-backend contract.** Verify the admin / mobile uses the same TypeScript types as the API. If you changed the API response, verify the frontend types are updated.

**D. Migration safety.** Re-run migrations from a fresh DB. They must complete without error. Run them on top of a populated DB (use a fixture). They must not destroy data.

### Layer 5 — Regression (did anything else break)

**A. Full test suite.** `npm run test` and `npm run api:test`. Compare the count to before your phase. The new count must equal old count + tests you added.

**B. Money conservation test.** `npm run api:test -- escrow-money-conservation.test.ts`. Must pass.

**C. State machine test.** `npm run api:test -- booking-state-machine.test.ts`. Must pass.

**D. Manual smoke test of the critical paths:**
- Create a test customer, place a booking, complete it, confirm it. Money flows correctly.
- Create a test provider, accept a booking, mark complete. Money flows correctly.
- File a dispute. Resolve it. Money flows correctly.
- File a manual refund. Money flows correctly.
- Create a recurring booking. The next instance auto-creates correctly.

**E. Performance.** Run the app under realistic data volume. Use the seed data scripts. The admin dashboard should load in < 2 seconds. The mobile app should not stutter on the home screen.

---

## The Self-Audit Questions

After completing all five layers, answer these questions in writing in the phase log. If any answer is "I don't know," you have not finished verification.

1. **What did this phase change?** (Three sentences max.)
2. **What is the riskiest line of code in the diff, and why?**
3. **What edge case am I least confident about?**
4. **If this phase introduced a bug that won't surface for 2 weeks, what is it most likely to be?**
5. **What did I almost do but caught myself?** (If "nothing," you're not paying attention.)
6. **Is there any code in this phase that exists only to make a test pass, not to serve real users?** (Answer must be "no.")
7. **Did I read every error message in full, or did I skim?** (Truthful answer.)
8. **Did I rerun the failing tests after fixing, or did I assume they'd pass?** (Truthful answer.)
9. **Did I check what happens when the database is empty?**
10. **Did I check what happens when the user has no permissions?**
11. **Is anything I added missing tests?**
12. **Is anything I added missing types?**
13. **Did I follow the existing patterns in the codebase, or invent new patterns?** (If invented, justify in writing.)
14. **Would I be embarrassed if Ken read every line of this diff?** (If yes, fix before commit.)

---

## The Stop-And-Restart Rule

If at any layer you discover something that requires substantial rework, you do NOT continue verifying with the broken understanding. You:

1. Stop.
2. Document what you found in the log.
3. Fix the underlying issue.
4. Restart verification from Layer 1.

You do not "verify around" a known issue.

---

## Specific Failure Patterns to Watch For

These are real patterns the AI coders fall into. Watch for these specifically:

### Pattern 1: The Phantom Pass

You wrote a test. The test passes. But the test does not actually exercise the production code path. (E.g., the test mocks the function under test, or the assertion is trivially true.)

**Detection:** Read every test you wrote. Ask: if I delete the production code being tested, does the test fail? If no, the test is phantom.

### Pattern 2: The Silent Drop

You changed a function's return shape (added a field, renamed a field, changed a type). You updated the function. You updated one caller. You missed three other callers. The TypeScript compiler caught some but not all (because of `any` somewhere upstream).

**Detection:** After changing any exported function, run `grep -rn "functionName" packages apps` and verify every call site is updated. Re-run typecheck.

### Pattern 3: The Forgotten Migration

You added a column to the schema. You used it in code. You forgot to write the migration. Locally everything works because your DB has the column already. CI fails.

**Detection:** Run `npm run migrate:down --workspace=packages/api && npm run migrate:up --workspace=packages/api && npm run migrate:up --workspace=packages/api`. If it fails, your migration set is incomplete. If it succeeds and tests still pass, you're good.

### Pattern 4: The Breaking Default

You added a new column with `NOT NULL` and no default. The migration runs on Ken's local DB but fails on staging because there's existing data.

**Detection:** Read every `ADD COLUMN` migration. Ask: is there a default? If no default, are you sure the column allows null? If neither, are you sure the table is empty in production?

### Pattern 5: The Race Condition

You wrote code that reads a value, modifies it in memory, writes it back. Two requests at the same time produce wrong results.

**Detection:** For any read-modify-write pattern, ask: am I in a transaction? Am I using `SELECT ... FOR UPDATE`? Am I using a database constraint to prevent the conflict?

### Pattern 6: The Silent Error

A function call fails. You wrap in try/catch. You log the error. You return `null`. The caller doesn't check for null. The caller silently produces wrong output.

**Detection:** Search for every `return null`, `return undefined`, `catch.*{` you wrote. For each one, find the caller and verify they handle the falsy/error case.

### Pattern 7: The Missing Auth

You wrote a new endpoint. You added the route. You forgot to add `authMiddleware` or `rbacMiddleware`. Anyone can call it.

**Detection:** For every new endpoint, verify the route has `authMiddleware` (or is intentionally public). Verify the role check matches the action's sensitivity.

### Pattern 8: The Phantom Build

You added a feature. The TypeScript compiler is happy. You committed. CI fails because there's a peer dependency or build step or environment variable you didn't set.

**Detection:** From a fresh clone, run `npm install && npm run typecheck && npm run build && npm run test`. All must pass. If any fail, your phase is incomplete.

### Pattern 9: The N+1

You wrote a list endpoint that fetches N items, then for each item makes another DB call. Locally with 5 items, it's fine. In production with 500 items, it's 500 queries.

**Detection:** For every list endpoint, count the queries it makes. Use `LEFT JOIN` or `IN (...)` or batch loading. Add a comment explaining why this is O(1) queries, not O(N).

### Pattern 10: The Confused Currency

You did money math. You forgot to multiply by 100. Or you divided by 100 twice. Or you used a float somewhere. Money calculation is wrong by a factor of 100 or by floating-point fuzz.

**Detection:** Every money function MUST have a unit test. The test inputs include ₱500.00 = `50000` and the assertion is exact integer comparison. No `expect(x).toBeCloseTo(50000)`. Use `expect(x).toBe(50000)`.

---

## After Verification Passes

You write the phase log. You commit. You write the phase report message. You stop. You wait.

You do not "tidy up" between phases. You do not "just look at one more thing." Each phase is atomic.
