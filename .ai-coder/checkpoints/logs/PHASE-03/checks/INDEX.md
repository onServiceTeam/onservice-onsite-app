# Check Index — Phase 03 (Runtime Config)

| Gate | Check ID         | Description                                          | Status | Evidence                                                                 |
|------|------------------|------------------------------------------------------|--------|--------------------------------------------------------------------------|
| 1    | G1-TC            | `npm run typecheck`                                  | PASS   | `gates/gate-1-typecheck.log` (regen by verify-master)                    |
| 1    | G1-LINT          | `npm run lint`                                       | PASS   | `gates/gate-1-lint.log`                                                  |
| 1    | G1-FORBID        | No new forbidden patterns                            | PASS   | `gates/gate-1-forbidden.log` (5 baseline pre-existing — see BASELINE-DEBT.md) |
| 1    | G1-EMOJI         | No emoji-as-icon                                     | PASS   | `gates/gate-1-emoji.log` (absolute=0)                                    |
| 1    | G1-PHANTOM       | No phantom test mocks                                | PASS   | `gates/gate-1-phantom-tests.log`                                         |
| 1    | G1-DEPS          | Dependencies sane                                    | PASS   | `gates/gate-1-deps.log`                                                  |
| 2    | G2-TESTS         | `npm run api:test`                                   | PASS   | `gates/gate-2-alltests.log` (332 tests passing, 22 suites)              |
| 2    | G2-PT            | Paper-trace ≥8                                       | PASS   | `gates/gate-2-paper-trace-phase-03.md` (9 traces)                        |
| 2    | G2-BD            | Boundary patterns A-F + risk surface                 | PASS   | `gates/gate-2-boundaries-phase-03.md`                                    |
| 3    | G3-PM            | Pre-mortem 5 incidents                               | PASS   | `gates/gate-3-premortem.md`                                              |
| 3    | G3-FB            | Future-bugs analysis                                 | PASS   | `gates/gate-3-future-bugs.md`                                            |
| 3    | G3-MUT           | Mutation testing on money services                   | N-A    | Skipped — no commits in this phase, MONEY_TOUCHED diff is empty. Will run on orchestrator's commit. |
| 4    | G4-VISUAL        | UI screenshots ≥4 + REPORT.md                        | PASS   | `visual/REPORT.md`, `visual/admin-settings/*.png` (7 PNGs)              |
| 5    | G5-MONEY         | Money conservation                                   | PASS   | `gates/gate-5-money.log`                                                 |
| 5    | G5-MIG           | Migrations sane (filenames + ordering)               | PASS   | `gates/gate-5-migrations.log` (050 + 051 in order)                      |
| 5    | G5-NPLUS1        | No new N+1 query patterns                            | PASS   | `gates/gate-5-n-plus-1.log` (16 baseline pre-existing — see BASELINE-DEBT.md) |
| 6    | G6-INDEX         | This file                                            | PASS   | `checks/INDEX.md`                                                        |
| 6    | G6-MANIFEST      | EVIDENCE-MANIFEST.md ≥20 rows + attestation         | PASS   | `EVIDENCE-MANIFEST.md`                                                   |
| 6    | G6-HONESTY       | HONESTY-CHECK.md ≥200 bytes                         | PASS   | `HONESTY-CHECK.md`                                                       |
| 6    | G6-SANITY        | sanity-checks.log entries ≥ significant changes      | PASS   | `sanity-checks.log` (≥10 entries)                                        |
| 6    | G6-HASH          | HASHES.sha256 covers every artifact                  | PASS   | `HASHES.sha256` (regen by verify-master)                                 |
