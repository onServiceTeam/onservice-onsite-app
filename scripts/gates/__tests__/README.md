# Gate smoke tests

These tests verify each gate fragment **rejects a known-bad pattern**. Without them a gate could silently break (e.g., a regex regression makes the gate accept everything). The smoke tests catch this class of bug.

Each test follows the same shape:

1. Create a temp working tree with a synthetic violation.
2. Run the gate (or the specific fragment) against it.
3. Assert the gate exits non-zero AND mentions the synthetic violation.
4. Clean up the temp tree.

Run all smoke tests:

```bash
bash scripts/gates/__tests__/run-all.sh
```

Each test exits 0 on pass, non-zero on fail. `run-all.sh` aggregates and exits non-zero if any test failed. CI invokes `run-all.sh` as part of Gate C's "constitution" article-set (article `gate-smoke-tests`, BLOCKING after D03).

> **Correction (2026-10-14, D40):** there is no `gate-smoke-tests` entry in `MODES.json`. What actually happens: `.github/workflows/gates.yml` runs `run-all.sh` as its own step in the Gate C job, before Gate C itself, so a failing smoke test fails the Gate C job. Nothing on GitHub requires that job to pass today, because branch protection is off by Ken's choice (D40).

Adding a new gate? Add a corresponding smoke test here. The pattern: synthesize a violation, run the gate, assert rejection.

## Tests added on 2026-10-14 (D40)

Each one gives the gate known-bad input and shows it is rejected.

- `gate-c-no-fake-tests.test.sh`: the new Gate C article `no-fake-tests` rejects each fake-test shape CLAUDE.md bans (existence-only tests and "Bug NNNN" citation checks), passes the allowed shapes, and fails the whole Gate C run when wired through `c-constitution.sh`.
- `gate-summary-fail-closed.test.sh`: the "All gates passed" job has `if: always()`, and its check block (copied out of `gates.yml`) fails when any gate job was skipped, cancelled, failed or is missing.
- `gate-modes-extra-fields.test.sh`: `get-mode.py`, `run-gate-a.sh` and `c-constitution.sh` still read modes correctly when `MODES.json` entries carry extra fields; the real `MODES.json` has `approved_by` and `reviewed_on` on every entry.
- `gate-d-e-report-not-run.test.sh`: in report mode, Gates D and E print "NOT RUN: report mode (MODES.json)" instead of a silent green.
- `gate-workflow-base-ref.test.sh`: on a push to master the diff-based checks compare with the previous master, not with the pushed commit itself.

## Tests corrected on 2026-10-14 (D40)

- `gate-c-no-console.test.sh` and `gate-c-no-axios.test.sh`: before this date their fixtures copied only four gate files, and the axios fixture wrote its five bigint tests on one line. Other Gate C articles then always failed, so the "Gate C FAILED" check passed even with no console.log or axios import. Now each fixture copies every script Gate C calls, a clean run must print "Gate C PASSED", and the bad run must print that article's own VIOLATION line with exactly one BLOCKING failure. Checked by breaking a copy of `c-constitution.sh` so the article prints its violation but does not count it: the old tests still passed, the new tests fail.
- `gate-c-no-fake-tests.test.sh`: its Gate C run now writes the bigint tests one per line and requires exactly one BLOCKING failure, then "Gate C PASSED" once the fake test is replaced. Case A2 proves existence checks wrapped in `every`, `some`, `find`, `filter` or `includes` are rejected.

## Tests added on 2026-10-17 (D40)

- `gate-c-no-admin-password-seeds.test.sh`: the seeds check (`c-constitution-no-admin-password-seeds.sh`, wired into Gate C on this date; nothing ran it before) rejects a one-line UPDATE, a multi-line INSERT or UPDATE that names `password_hash`, and a D01 pattern in a non-.sql seed; passes clean seeds; fails closed on an unreadable seed where the machine allows that case to be set up (it is skipped on Windows); and fails Gate C as the only BLOCKING failure when wired through `c-constitution.sh`.
- `gate-c-db-tests-fail-closed.test.sh`: the new Gate C article `db-tests-fail-closed` rejects a database test that can skip silently in CI (no guard, a guard on another flag, a commented-out guard, an indented guard), passes the guarded shapes with exact counts, works without git, and fails Gate C as the only BLOCKING failure when wired through `c-constitution.sh`.
- The Gate C fixtures in `gate-c-no-axios`, `gate-c-no-console`, `gate-c-no-fake-tests` and `gate-c-no-admin-password-seeds` now also copy `c-constitution-no-admin-password-seeds.sh` and `c-db-tests-fail-closed.py`. Without them those articles fail in the fixture and the "exactly one BLOCKING failure" checks could not pass.
- `gate-a-hashes-immutable-base.test.sh`: the Gate A fragment `a-cross-source-hashes-immutable.sh` fails when a `HASHES-CORRECTED.sha256` file changed, passes an unrelated change, and fails with "NOT CHECKED" when the comparison base is not in the checkout or no base exists at all. Before this date those last two cases printed OK (checked by running the old fragment with a missing base: it printed OK).

## Tests strengthened on 2026-10-17 (D40, after an agent review)

- `gate-c-no-fake-tests.test.sh`: cases I to N, one line per form the review found getting past the article: literal-only filler such as `expect(true).toBe(true)` next to an existence check, `toBeDefined` and similar on `existsSync`, values written either way round, `.exec`, citations with `.` `_` `-` or no separator and test file names that carry a bug ID, `toMatchObject` and object or array helpers, `assert.notEqual` / `notStrictEqual` / `notDeepStrictEqual`, `indexOf` or `search` compared with 0, a string value mistaken for 0, and files that mobile jest runs without `.test` in the name (`.tsx` in `__tests__`, `.mts`, `.cts`). The allowed set gained the matching absence and mock-call forms, with an exact file and block count. Run against the old article, the new test fails at case I.
- `gate-summary-fail-closed.test.sh`: part 1 now also fails on `continue-on-error`, a step `if:`, a `shell:` or `defaults:` override, a second step, or anything after the `# END gates-summary-check` line. Part 1b proves each of those edits to a copy of `gates.yml` is rejected. Before, adding `continue-on-error: true` to the step passed this test (checked on a copy: the old test exited 0, the new one exits 1).
