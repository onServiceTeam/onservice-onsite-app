# Check Index — Phase 06 (Customer 360)

| Gate | Check ID         | Description                                          | Status | Evidence                                                                 |
|------|------------------|------------------------------------------------------|--------|--------------------------------------------------------------------------|
| 1    | G1-TC            | `npm run typecheck`                                  | PASS   | `gates/gate-1-typecheck.log` (regen by verify-master)                    |
| 1    | G1-LINT          | `npm run lint`                                       | PASS   | `gates/gate-1-lint.log`                                                  |
| 1    | G1-FORBID        | No new forbidden patterns                            | PASS   | `gates/gate-1-forbidden.log` (baseline carried forward)                  |
| 1    | G1-EMOJI         | No emoji-as-icon                                     | PASS   | `gates/gate-1-emoji.log` (absolute=0)                                    |
| 1    | G1-PHANTOM       | No phantom test mocks                                | PASS   | `gates/gate-1-phantom-tests.log`                                         |
| 1    | G1-DEPS          | Dependencies sane                                    | PASS   | `gates/gate-1-deps.log`                                                  |
| 2    | G2-TESTS         | `npm run api:test`                                   | PASS   | `gates/gate-2-alltests.log` (594 tests passing; +36 new this phase)      |
| 2    | G2-PT            | Paper-trace ≥8                                       | PASS   | `gates/gate-2-paper-trace-phase-06.md` (8 traces)                        |
| 2    | G2-BD            | Boundary patterns + risk surface                     | PASS   | `gates/gate-2-boundaries-phase-06.md` (every export covered)             |
| 3    | G3-PM            | Pre-mortem 5 incidents                               | PASS   | `gates/gate-3-premortem.md`                                              |
| 3    | G3-FB            | Future-bugs analysis                                 | PASS   | `gates/gate-3-future-bugs.md`                                            |
| 3    | G3-MUT           | Mutation testing on money services                   | PASS   | `gates/gate-3-mutations.log` — verify-master Stryker pass cleared the gate; `creditCustomerWallet` covered by 11 boundary tests including money-conservation invariant |
| 5    | G5-MONEY         | Money conservation                                   | PASS   | `gates/gate-5-money.log` — `creditCustomerWallet` runs in `db.transaction` with SELECT FOR UPDATE; ledger row paired with wallet update; auto-creates wallet under same lock |
| 5    | G5-MIG           | Migrations sane                                      | PASS   | `gates/gate-5-migrations.log` (zero new migrations this phase)           |
| 5    | G5-NPLUS1        | No new N+1 query patterns                            | PASS   | `gates/gate-5-n-plus-1.log` — every list endpoint uses single-query JOIN/EXISTS |
| 6    | G6-INDEX         | This file                                            | PASS   | `checks/INDEX.md`                                                        |
| 6    | G6-MANIFEST      | EVIDENCE-MANIFEST.md                                 | PASS   | `EVIDENCE-MANIFEST.md`                                                   |
| 6    | G6-HONESTY       | HONESTY-CHECK.md                                     | PASS   | `HONESTY-CHECK.md`                                                       |
| 6    | G6-SANITY        | sanity-checks.log entries                            | PASS   | `sanity-checks.log` (§0–§2)                                              |
| 6    | G6-HASH          | HASHES.sha256 covers every artifact                  | PASS   | `HASHES.sha256` (regen by verify-master)                                 |
