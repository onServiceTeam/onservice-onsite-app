# Check Index — Phase 04 (Admin Dashboard)

| Gate | Check ID         | Description                                          | Status | Evidence                                                                 |
|------|------------------|------------------------------------------------------|--------|--------------------------------------------------------------------------|
| 1    | G1-TC            | `npm run typecheck`                                  | PASS   | `gates/gate-1-typecheck.log` (regen by verify-master)                    |
| 1    | G1-LINT          | `npm run lint`                                       | PASS   | `gates/gate-1-lint.log`                                                  |
| 1    | G1-FORBID        | No new forbidden patterns                            | PASS   | `gates/gate-1-forbidden.log` (baseline carried forward — see BASELINE-DEBT.md) |
| 1    | G1-EMOJI         | No emoji-as-icon                                     | PASS   | `gates/gate-1-emoji.log` (absolute=0)                                    |
| 1    | G1-PHANTOM       | No phantom test mocks                                | PASS   | `gates/gate-1-phantom-tests.log`                                         |
| 1    | G1-DEPS          | Dependencies sane                                    | PASS   | `gates/gate-1-deps.log`                                                  |
| 2    | G2-TESTS         | `npm run api:test`                                   | PASS   | `gates/gate-2-alltests.log` (513 tests passing across 25 suites; 35 new) |
| 2    | G2-PT            | Paper-trace ≥8                                       | PASS   | `gates/gate-2-paper-trace-phase-04.md` (9 traces)                        |
| 2    | G2-BD            | Boundary patterns + risk surface                     | PASS   | `gates/gate-2-boundaries-phase-04.md` (Patterns A-F)                     |
| 3    | G3-PM            | Pre-mortem 5 incidents                               | PASS   | `gates/gate-3-premortem.md`                                              |
| 3    | G3-FB            | Future-bugs analysis                                 | PASS   | `gates/gate-3-future-bugs.md`                                            |
| 3    | G3-MUT           | Mutation testing on money services                   | N-A    | admin-analytics.service.ts is NOT in the sacred-file allowlist (read-only analytics, no money mutations). Per-phase delta contains no sacred file. Tests written regardless. |
| 5    | G5-MONEY         | Money conservation                                   | PASS   | `gates/gate-5-money.log`                                                 |
| 5    | G5-MIG           | Migrations sane                                      | PASS   | `gates/gate-5-migrations.log` (no new migrations this phase)             |
| 5    | G5-NPLUS1        | No new N+1 query patterns                            | PASS   | `gates/gate-5-n-plus-1.log` (baseline carried forward — see BASELINE-DEBT.md) |
| 6    | G6-INDEX         | This file                                            | PASS   | `checks/INDEX.md`                                                        |
| 6    | G6-MANIFEST      | EVIDENCE-MANIFEST.md ≥20 rows + attestation         | PASS   | `EVIDENCE-MANIFEST.md`                                                   |
| 6    | G6-HONESTY       | HONESTY-CHECK.md ≥200 bytes                         | PASS   | `HONESTY-CHECK.md`                                                       |
| 6    | G6-SANITY        | sanity-checks.log entries                            | PASS   | `sanity-checks.log` (≥5 entries)                                         |
| 6    | G6-HASH          | HASHES.sha256 covers every artifact                  | PASS   | `HASHES.sha256` (regen by verify-master)                                 |
