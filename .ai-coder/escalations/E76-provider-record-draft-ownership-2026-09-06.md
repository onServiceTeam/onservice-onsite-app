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

## Customer 360 counterpart, 2026-09-06

After reading the complete 1,812-line CustomerDetailPage, five independent
real-render navigation regressions reproduced its counterpart: contact reveal
(UX-1360), suspension dialog/status tray (UX-1361), wallet adjustment draft
(UX-1362), forced-sign-out dialog (UX-1363), and dispute-tab fraud-review
confirmation (UX-1364). The concise repeat failed all five on actual retained
UI output in 2.96 seconds. The wallet case separately proves a same-customer
refresh retains its draft before moving to the second cached customer.

The same canonical-record-key containment is being applied to this page under
Ken's current engineering approval. This extension changes neither financial
rules nor account-policy semantics, and sends no live financial/status request.
It does not authorize an adjustment, suspension, fraud flag or forced sign-out.
Customer green/full-suite/browser verification remains pending at this entry.

Separate follow-up: admin main.tsx creates one long-lived QueryClient; normal
logout/login uses client-side navigation. Authentication transitions and late
transport responses need their own reproduction and ownership boundary. A
record-ID key does not by itself isolate different operators viewing the same
record. No session-cache or transport correction is claimed by this work.

Customer local follow-up: the five new real-render tests pass, including
same-customer draft preservation and delayed reveal completion. The first
full corrected admin run passes 574 files / 658 tests, with 1 skipped file /
3 TODOs. Types and lint pass after fixing test-only typing errors. All 36
compiled-browser scenarios pass at six widths; 72 screenshots are retained.
The old compiled customer page separately reproduces the contact leak.
See `docs/audits/CUSTOMER-RECORD-OWNERSHIP-2026-09-06.md` for full evidence
and the still-open actor/session and release boundaries. No financial or
status endpoint was submitted by the customer tests or browser audit.
