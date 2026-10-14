# Repository alignment, 2026-10-14

Ken asked on 2026-10-14 for this computer, GitHub and the live server to be aligned on `master`, with every open pull request and branch finished or closed.

This file is the public record of that cleanup. Every branch that is removed is listed with its last commit, so any of them can be restored with `git push origin <sha>:refs/heads/<name>`. Private material (security escalations and server notes) is kept off GitHub because this repository is public. It is backed up outside the repository on Ken's machine.

## Before

- `master` was at `738641095d3ae1dcbba14c5803b96cf63ae93ee8` (2026-08-31), 474 commits behind the code the live server runs.
- The live server ran `codex/financials-operator-truth` (PR #81), not `master`.
- Four pull requests were open: #43, #80 (draft), #81 and #82 (draft).
- GitHub had 22 branches.
- `master` has no branch protection and no rulesets, although CLAUDE.md says the five gates are enforced. Turning protection on is a decision for Ken.

## How master moves

`master` moves by a plain fast-forward push of the exact commit that passed CI and runs on live (`git push origin <sha>:refs/heads/master`). It does not use a merge, squash or rebase button, because those create new commit IDs that would differ from what live runs. The "Deploy to Production" workflow is manual-only, has never run and has no secrets, so it is not used. Live deploys go through the server-side release scripts.

## Pull requests

| PR | Head | Outcome |
|---|---|---|
| #81 Resume audited provider, customer and operator-console development | `codex/financials-operator-truth` | Merged by the fast-forward of `master`. |
| #82 Android delivery (draft) | `ee0e66fcbd8eb58e40b1703c185c0bcbf7bacb60` | Fully contained in #81, so the fast-forward includes it. |
| #80 Pricing publication workflow (draft) | `27e4eafbd681cbb74e1e8dd1a8ba9c8fcc3e1939` | Fully contained in #81, so the fast-forward includes it. |
| #43 Restore requested to payment_pending (E03) | `8ff33a4a54fbcff45b17bb8b89c453dbbd2c6378` | Closed without merging. It was replaced by #44 (merge `865f55e`, 2026-06-18). In the live line, `packages/api/src/types/booking.types.ts` allows requested to payment_pending, and `packages/api/__tests__/booking-state-machine.test.ts` tests it, plus the instant-pay path. Its 2026-06-10 "resolved" note was never true, because this branch was never merged. The E03 escalation records the real resolution through #44. |

## Branches removed after master contains them

All of these are ancestors of the new `master`, so no commit is lost.

| Branch | Last commit |
|---|---|
| codex/admin-booking-dispatch-audit | `2b08b0d46a98a2ee826943e659f2cdf645ea746a` |
| codex/admin-company-audit | `4a113a00bd2576f08fbe83e126409202bc3826e0` |
| codex/admin-configuration-audit | `1403b6bacf49d84ece7494a536e04ed992218d93` |
| codex/admin-governance-controls-audit | `2c185c8863f4d772e72b6833e4ead40c9c1c4d45` |
| codex/admin-policy-audit | `1320691171c04e4507f2451280bcec667b6e252d` |
| codex/admin-support-operations-audit | `cbf69013ecbee04ab78cf12c535c82dc6fa5a8ff` |
| codex/android-test-delivery | `ee0e66fcbd8eb58e40b1703c185c0bcbf7bacb60` |
| codex/customer-provider-360-audit | `17156b3921bf83a1081459c03881d1651e232646` |
| codex/customer-provider-desktop-audit | `b92886241cecfc69c7de090409185c87a76e2031` |
| codex/governance-tier-workspaces | `df6ed0fe1966f1827aa6e3e131a04acd01ca638b` |
| codex/privacy-workspace-fix | `a102f4bae132534e9ddc618cc5439b3b19c9f284` |
| codex/security-operations-atomicity | `910189e2da843e28f087b5607457f7f883cf1283` |
| codex/system-settings-control-audit | `1e2fda019cde10a1045e519c7707e17a06fe2690` |
| codex/system-settings-control-fix | `27e4eafbd681cbb74e1e8dd1a8ba9c8fcc3e1939` |
| feat/provider-staff | `c20308b33b139a19ba3eacbf08c88a93f54c049a` |
| fix/e03-instant-pay-money-path | `b6aaa1e5b9663ece1434efa78f1c09f94765f73f` |
| fix/escrow-atomicity-a4-a5 | `3e140c0472802450543f2025e2b8584a6b7b2f83` |
| codex/financials-operator-truth | removed last, once `master` equals it and every checkout has moved to `master` |

## Branches removed that held commits not in master

Each one was checked by one reader and then by an independent skeptic who tried to prove something would be lost. Both agreed that nothing needed would be.

| Branch | Last commit | Why it is not merged |
|---|---|---|
| fix/e03-checkout-state-machine | `8ff33a4a54fbcff45b17bb8b89c453dbbd2c6378` | PR #43; replaced by #44 (see above). |
| native-build-sdk55-align | `e8860b7fc79d854b51d57ac0eae6e1dc591383cb` | June package alignment for Expo SDK 55. The live line already has newer SDK 55 versions of every package it touched (for example react-native 0.83.10 and expo ~55.0.31). |
| claude/contabo-hetzner-migration-rhak0z | `3240544d71609fade28e474360732bf564ba5b83` | Server-consolidation plan written before the move. The move was built differently (a different front door, port and folder layout), so landing these as runbooks would mislead. It includes a post-move security checklist, which is tracked privately. A copy of the branch is kept off GitHub. |

## Tags

All 35 tags on GitHub point at commits inside the new `master` and are left as they are. The tags CLAUDE.md names (`v0.14.0-d01-complete` through `v0.14.1-audit-clean`) all exist. `v1.0.0-launch-ready` does not exist yet, as expected.

## This computer

- The main checkout moves from `codex/financials-operator-truth` (48 commits behind) to `master`.
- Two Codex worktrees were clean and fully contained in `master`, so they are removed.
- The parked worktree from the previous Claude account held unfinished repair work. That work was finished, reviewed and landed first. Its private records were then backed up, and the worktree was removed.
- Records that were never committed because the repository is public stay private: escalations E67, E68, E70, E72, E80, E81 and E82, an old Codex instruction copy, and uploaded attachments. Whether to publish E71, E73, E74 and E75 is a question for Ken.
