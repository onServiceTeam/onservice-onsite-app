# E76 - Provider record ownership of private reveals and operator drafts

Date: 2026-09-06

Status: Recommended engineering containment authorized by Ken's current
instruction approving recommended mandatory escalations. Implemented and
locally verified; fresh CI and deployment remain pending. This is not a separately named E76 approval,
approval to alter financial policy, or approval to transact on production.

## Reproduced finding

Four real-render tests navigate the actual router between two synthetic,
already-cached provider profiles. The unchanged Provider 360 page retains
the first provider's revealed contact details (UX-1356), internal-note draft
(UX-1357), suspension confirmation (UX-1358), and wallet-adjustment amount
and reason (UX-1359) under the second provider's heading. All four tests
failed on those actual outputs before any runtime change, in 7.91 seconds.
The wallet test never submits an adjustment. No production data was used.

App.tsx and AdminLayout.tsx do not remount the page when the route's provider
ID changes. ProviderDetailPage has correctly separated query keys but keeps
record-specific state in unkeyed child components. A loading interlude can
mask the problem; the warm-cache test intentionally avoids that interlude.

## Recommended option A: isolate the existing record subtree by provider ID

Key the successfully loaded page subtree by the canonical profile ID. This
remounts private reveal state, drafts, and confirmation hooks on a different
record, without clearing the query cache or resetting drafts on a same-record
refresh. The existing useReasonDialog hook resolves outstanding requests to
null on unmount. This is a narrow lifecycle correction using existing React
and repository patterns, not a new dependency or financial workflow.

Alternatives are scattered per-field reset effects (easy to omit fields and
allow a transient incorrect render) or a global pathname-keyed application
remount (unnecessarily resets unrelated state and same-record navigation).
Neither is preferable for this contained defect.

## Limits and evidence required

- Verify all four regressions green, including a delayed contact response.
- Verify a same-provider profile refresh retains its unsaved note draft.
- Run admin type checking, lint, existing provider regressions, and full tests.
- No wallet submission, ledger mutation, suspension, refund, commission,
  historic transaction rewrite, role change, or production action is authorized
  or performed by these tests or this fix.
- This does not certify all Provider 360 actions, all customer/admin pages,
  financial endpoint semantics, production readiness, or full Stitch fidelity.
- A request already submitted to the server is not canceled by UI unmounting.
  Server authorization and idempotency remain independent requirements.

The money-adjacent risk is surfaced to Ken in chat before implementation.
Any broader financial-policy change or unresolved specification conflict
remains a separate boundary, not covered by this UI containment decision.

## Local verification completed

All four regressions and the existing provider page tests pass (5 files,
7 tests). Same-provider note preservation is verified. Full admin execution
passes 569 files / 653 tests, with 1 skipped file / 3 TODOs. Types, lint and
the unchanged regression-ID gate pass. Thirty compiled-browser scenarios
pass at six widths; the old compiled build separately reproduces the leak.
See `docs/audits/PROVIDER-RECORD-OWNERSHIP-2026-09-06.md` for exact evidence
and limits. This closes the local UI containment work, not financial endpoint
certification, production rollout or the rest of the operator-console audit.
