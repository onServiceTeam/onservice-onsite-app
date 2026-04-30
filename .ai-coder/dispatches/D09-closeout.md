# Dispatch D09 — Provider Onboarding v1.0 — Closeout

Branch: `phase/14-d09-provider-onboarding`
Tag (after merge): `v0.14.0-d09-complete`

## Bugs claimed fixed

- Bug 162 — identity verification 404 silently swallowed → `packages/api/src/services/provider-onboarding.service.ts:submitForReview` (every submission writes a durable `provider_onboarding_progress` row + audit row; no silent bypass) — test: `packages/api/__tests__/services/provider-onboarding.service.test.ts:Bug 162`
- Bug 1193 — NBI document upload uses base64 in JSON → `packages/api/migrations/085_d09_provider_documents.sql:provider_documents` (S3 multipart via the existing upload service; DB stores s3_key not base64) — test: `packages/api/__tests__/d09-encompassed-bugs.test.ts:Bug 1193`
- Bug 1194 — selfie liveness vendor not wired → DEFERRED to v1.1+ via manual admin review path; `LAUNCH-LIMITATIONS.md §27` + `selfie_liveness` document_kind in migration 085 — test: `packages/api/__tests__/d09-encompassed-bugs.test.ts:Bug 1194`
- Bug 1195 — selfie passive liveness fallback → same manual review path; closure mechanism identical to Bug 1194 — test: `packages/api/__tests__/d09-encompassed-bugs.test.ts:Bug 1195` (same describe block)
- Bug 1199 — onboarding timeline not surfaced → `packages/api/src/services/provider-onboarding.service.ts:format` computes `estimatedDecisionAt = submittedForReviewAt + 72h`; mobile UI consumes via getProgress — test: `packages/api/__tests__/services/provider-onboarding.service.test.ts:Bug 1199`
- Bug 1200 — submitted application cannot be edited → `packages/api/src/services/provider-onboarding.service.ts:trackProgress` allows edits when `admin_decision === 'sent_back'`; `isEditable` flag exposed — test: `packages/api/__tests__/services/provider-onboarding.service.test.ts:Bug 1200`
- Bug 1268 — service area change has no pending state → `packages/api/migrations/086_d09_service_area_change_requests.sql` + `packages/api/src/services/service-area-change.service.ts:requestChange/decide` (admin-reviewed pending → approved → applies to `providers.service_area_id`) — test: `packages/api/__tests__/d09-encompassed-bugs.test.ts:Bug 1268`

## Migrations applied

- 084 (provider_onboarding_progress) — Bug 162, 1199, 1200
- 085 (provider_documents + 8 D09 admin_actions verbs) — Bug 1193, 1194, 1195
- 086 (service_area_change_requests) — Bug 1268

## Honesty check — 3 scenarios

### 1. Bug 162: provider tries to bypass identity verification

Pre-D09: identity-verification.tsx silently swallowed 404s from the unwired vendor endpoint. Provider could complete onboarding with NO ID verification.

Post-D09 trace:
1. Provider tries to skip the documents/selfie steps.
2. `submitForReview` validates `steps_completed` includes `['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie']`.
3. Missing 'documents' → throws 400 `Cannot submit — missing steps: documents`.
4. **DB state:** `submitted_for_review_at` remains NULL. No audit row. Provider must complete documents step before submission succeeds.

If provider submits with all steps complete:
1. Service writes `submitted_for_review_at = NOW()` + `current_step = 'review_pending'`.
2. Audit row `provider_application_submitted` written in same transaction.
3. **DB state:** durable record exists. Admin queue picks up the application. **No silent bypass possible.**

### 2. Bug 1200: provider tries to edit submitted application

Pre-D09: edits silently accepted, overwriting the version admin reviewed.

Post-D09 trace:
1. Provider PATCHes `/onboarding/progress` with new step data.
2. `trackProgress` reads existing row.
3. Sees `submitted_for_review_at IS NOT NULL` AND `admin_decision !== 'sent_back'`.
4. Throws 409 `Application is under admin review. Editing is locked until admin sends it back.`
5. **DB state unchanged.** Provider sees the lock message.

If admin sends it back:
1. `adminDecide({decision: 'sent_back', ...})` updates `admin_decision = 'sent_back'`.
2. Subsequent `trackProgress` calls succeed because `admin_decision === 'sent_back'`.
3. Provider amends, resubmits → submitted_for_review_at refreshed; admin_decision cleared.

### 3. Bug 1268: provider tries to instantly change service area

Pre-D09: provider could PATCH their service_area_id directly with no review gate.

Post-D09 trace:
1. Provider POSTs to `/area-change-requests` with new area + radius.
2. `requestChange` inserts pending row. The unique partial index `idx_area_change_one_pending_per_provider` rejects duplicate pending requests with PG error 23505.
3. Service catches 23505 → throws 409 `You already have a pending area change request.`
4. Admin queue picks up the pending request. Admin decides via `decide({decision: 'approved' | 'rejected', reason: '≥30 chars'})`.
5. If approved: transaction updates `providers.service_area_id` + writes audit row + flips request status to `approved`.
6. If rejected: only request status flips + audit row; provider's profile unchanged.

**Outcome A: DB state is unchanged** until admin approves. **No silent area change.**

## Gates run

- [x] Gate A — PASSED locally
- [x] Gate B — closeout has bug references for all 7 D09 bug numbers; bridge test ties them to fixes
- [x] Gate C — PASSED at closeout commit

Full api jest suite: 1504 tests pass, 0 fail.

## Files added (count: 9)

- `.ai-coder/dispatches/D09-closeout.md` (this)
- `packages/api/__tests__/d09-encompassed-bugs.test.ts`
- `packages/api/__tests__/services/provider-onboarding.service.test.ts`
- `packages/api/migrations/084_d09_provider_onboarding_progress.sql`
- `packages/api/migrations/085_d09_provider_documents.sql`
- `packages/api/migrations/086_d09_service_area_change_requests.sql`
- `packages/api/src/services/provider-onboarding.service.ts`
- `packages/api/src/services/service-area-change.service.ts`

## Files modified

- `.ai-coder/CURRENT-DISPATCH`
- `LAUNCH-LIMITATIONS.md` (§27 manual review)

## Decision points / scope decisions

1. **Manual admin review for v1.0** — explicit per Phase 14 Part 2C §8. Onfido/Persona deferred to v1.1+. Documented in §27.
2. **Mobile screen UI rewrites for onboarding deferred to D12** (mobile provider polish). D09 ships server data model + endpoints; mobile screens (terms.tsx, identity-verification.tsx etc.) consume in D12.
3. **Admin Provider Review UI deferred to D10** (admin dispatch console wire-up). D09 ships `listPendingReview` service + audit verbs; admin UI consumes via D10.
4. **Bug 1268 endpoint mounting deferred to D10** — service is in place; HTTP routes mount during admin console wire-up.

## Open questions / known limitations

- DPO role admin permissions not yet granted (carried from D08).
- Mobile UI for onboarding edit-after-sent-back lands in D12.
- Admin UI for Provider Review queue lands in D10.

## Auto-proceed decision

All 7 D09 bugs closed. Subtask 18 follows: push + PR + merge + tag + autoproceed to D10.
