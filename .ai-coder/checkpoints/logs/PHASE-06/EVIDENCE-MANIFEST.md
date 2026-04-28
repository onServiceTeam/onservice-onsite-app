# Phase 06 — Evidence Manifest (Customer 360)

## Claims and Artifacts

| #  | Claim                                                                                  | Artifact                                                                 |
|----|----------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| 1  | Final typecheck (verify-master regen) shows 0 errors.                                  | `logs/PHASE-06/gates/gate-1-typecheck.log`                              |
| 2  | Final lint (verify-master regen) shows 0 errors.                                       | `logs/PHASE-06/gates/gate-1-lint.log`                                   |
| 3  | Forbidden-patterns scan: 0 introduced this phase.                                      | `logs/PHASE-06/gates/gate-1-forbidden.log`                              |
| 4  | Emoji scan: absolute=0, introduced=0.                                                  | `logs/PHASE-06/gates/gate-1-emoji.log`                                  |
| 5  | Phantom-test scan: 0 patterns detected.                                                | `logs/PHASE-06/gates/gate-1-phantom-tests.log`                          |
| 6  | Dependency graph stable.                                                               | `logs/PHASE-06/gates/gate-1-deps.log`                                   |
| 7  | All 594 jest tests pass (36 new this phase: customer-admin.test.ts).                   | `logs/PHASE-06/gates/gate-2-alltests.log`                               |
| 8  | 8 paper-traces walking each new runtime path step-by-step.                             | `logs/PHASE-06/gates/gate-2-paper-trace-phase-06.md`                    |
| 9  | Boundary tests for every new exported function in customer-admin.service.ts.           | `logs/PHASE-06/gates/gate-2-boundaries-phase-06.md`                     |
| 10 | Pre-mortem with 5 incident scenarios.                                                  | `logs/PHASE-06/gates/gate-3-premortem.md`                               |
| 11 | Future-bugs analysis (most-likely 2-week regression).                                  | `logs/PHASE-06/gates/gate-3-future-bugs.md`                             |
| 12 | Mutation testing covered by Stryker via verify-master.                                 | `logs/PHASE-06/gates/gate-3-mutations.log`                              |
| 13 | Money-conservation gate: creditCustomerWallet uses transactional FOR UPDATE.           | `logs/PHASE-06/gates/gate-5-money.log`                                  |
| 14 | Migration scan: zero new migrations this phase.                                        | `logs/PHASE-06/gates/gate-5-migrations.log`                             |
| 15 | N+1 query scan: 0 introduced this phase.                                               | `logs/PHASE-06/gates/gate-5-n-plus-1.log`                               |
| 16 | Backend service implementing the Phase 06 endpoints.                                   | `packages/api/src/services/customer-admin.service.ts`                   |
| 17 | Express routes mounting the service under /api/v1/admin/customers.                     | `packages/api/src/routes/customer-admin.routes.ts`                      |
| 18 | Server.ts wires the routes ahead of /api/v1/admin so /:id wins.                        | `packages/api/src/server.ts`                                            |
| 19 | Frontend CustomerDetailPage with all 6 tabs.                                           | `apps/admin/src/pages/CustomerDetailPage.tsx`                           |
| 20 | App.tsx route registration for /customers/:id (lazy).                                  | `apps/admin/src/App.tsx`                                                |
| 21 | CustomersPage row name → Link to /customers/:id.                                       | `apps/admin/src/pages/CustomersPage.tsx`                                |
| 22 | 36 Jest unit tests for customer-admin service (boundary + mutation invariants).        | `packages/api/__tests__/customer-admin.test.ts`                         |
| 23 | Honesty check disclosing every shortcut, deferral, and limitation.                     | `logs/PHASE-06/HONESTY-CHECK.md`                                        |
| 24 | Sanity log (timestamped after-every-change ritual).                                    | `logs/PHASE-06/sanity-checks.log`                                       |
| 25 | Check INDEX listing every Gate ID with PASS status.                                    | `logs/PHASE-06/checks/INDEX.md`                                         |
| 26 | Cryptographic hash chain over every artifact (regen by verify-master).                 | `logs/PHASE-06/HASHES.sha256`                                           |

---

## Deferred to later phases

- **`POST …/refund` (full customer refund flow)** — touches the sacred
  refund / dispute service. See `HONESTY-CHECK.md`.
- **`POST …/message` (in-app message)** — no in-app messaging
  infrastructure yet.
- **Customer admin notes (`POST …/notes`)** — no `customer_admin_notes`
  table; Provider 360 has notes (Phase 05) but customer notes is its own
  scope.
- **NPS scoring** — no schema; the Profile tab shows
  `averageRatingGiven` (avg of reviews this customer wrote about
  providers) as a directional proxy.
- **Address CRUD (admin-edit)** — read-only only; admin write-back is
  out-of-scope for Customer 360.
- **`POST …/wallet/withdraw`** — withdrawals are not part of admin-360
  scope; out-of-scope for this phase.
- **`'customer_flagged'` first-class admin_actions.action_type** —
  flag_fraud is currently encoded via reason prefix on
  `customer_suspended`. See `HONESTY-CHECK.md` and the boundary test.
- **`provider_login_history` / `customer_login_history`** — login lookup
  reuses `login_attempts` JOINed by phone (carries Phase 05's debt).

---

## Self-attestation

I have reviewed every artifact listed above. Each path resolves to a file
generated during this phase's session. The Claims column accurately
describes what each artifact proves. I have separately disclosed every
known limitation, shortcut, and deferral in `HONESTY-CHECK.md`.

I attest the above is true.
