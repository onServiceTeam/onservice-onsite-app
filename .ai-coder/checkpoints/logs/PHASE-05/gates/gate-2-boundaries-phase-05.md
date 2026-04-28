# Phase 05 — Boundary Tests

Boundary behavior for each new service function. ✓ = covered by a unit test in
`packages/api/__tests__/provider-admin.test.ts`. (T) = test name reference.

## getProviderProfile(id)
- ✓ id matches no row → throws 404 (T: "returns 404 when provider missing")
- ✓ valid id → projects nested `user`, `documents`, `categories`, `serviceAreas`
- ✓ documents.governmentIdUrl & selfieUrl always null (no schema columns)
- ✓ Decimal columns (latitude, average_rating) are coerced via Number()

## getProviderJobs(providerId, page, pageSize, status?)
- ✓ page = 0 → clamped to 1 (T: "clamps page/pageSize")
- ✓ pageSize = 999 → clamped to 100
- ✓ status filter appends a $2 placeholder (T: "applies status filter")
- ✓ no rows → returns empty array, total=0
- has_dispute is computed via EXISTS subquery (no N+1)

## getProviderFinancials(providerId)
- ✓ Returns zeros when no transactions exist (COALESCE 0 baked into SQL)
- ✓ All BIGINT columns coerced via Number()
- ✓ Limits payouts to 20, monthly to 12 months
- ✓ Distinguishes earnings (escrow_release positive) from commission (abs of commission rows)

## getProviderReviews(providerId)
- ✓ Returns array; image_urls coerced from null to []

## setReviewVisibility(reviewId, isVisible)
- ✓ Missing review → 404 (T: "throws 404 when missing")
- ✓ Successful update → no return value

## setReviewAdminResponse(reviewId, response)
- ✓ Updates row with provided params (T: "updates row")
- Empty response is rejected at route layer (route validates non-empty)

## getProviderDisputes(providerId)
- ✓ Maps `resolution_type` → `resolutionType` (T: covered)
- LIMIT 200 ceiling

## getProviderActivity(providerId, limit)
- ✓ Provider missing → 404 (T: covered)
- ✓ Merges audit + login_attempts; sorts desc by createdAt (T: "merges + sorts")
- limit clamped to [1,200]
- audit query uses entity_id IN (provider_id, user_id) — covers both shapes

## listProviderNotes(providerId)
- ✓ Returns rows with author_name JOINed (T: "list orders pinned desc")
- Empty list → []

## createProviderNote(providerId, authorId, category, body, pinned)
- ✓ Empty/whitespace body rejected with 400 (T: "rejects empty body")
- ✓ Invalid category rejected with 400 (T: "rejects invalid category")
- ✓ Successful insert returns full note row (T: "inserts and returns")

## updateProviderNote(noteId, authorId, isSuperAdmin, patch)
- ✓ Note missing → 404 (T: "404 when note missing")
- ✓ Non-author non-super-admin → 403 (T: "rejects non-author")
- ✓ Super-admin override allowed (T: "allows super-admin override")
- ✓ Empty body in patch rejected with 400 (validation guard)
- ✓ Empty patch is no-op (no SQL issued)

## deleteProviderNote(noteId, authorId, isSuperAdmin)
- ✓ Non-author non-super-admin → 403 (T: covered)
- ✓ Author can delete (T: covered)

## updateProviderProfile(providerId, patch)
- ✓ Empty businessName trimmed → 400 (T: covered)
- ✓ serviceRadiusKm clamped to [1,200] (T: covered)
- ✓ No fields → no-op (T: covered)
- ✓ Provider missing → 404 (T: covered)

## adjustProviderWallet(providerId, deltaAmount, reason, adminUserId)  ← SACRED
- ✓ Zero delta → 400 (T: parameterized)
- ✓ Non-integer delta (1.5, NaN) → 400 (T: parameterized)
- ✓ Empty/whitespace reason → 400 (T: parameterized)
- ✓ Reason shorter than 5 chars → 400 (T: "tiny")
- ✓ Wallet missing → 404 (T: covered)
- ✓ Negative resulting balance → 400 (T: covered)
- ✓ Credit case: balance_after == prev + delta, paired ledger row written
       inside the transaction (T: "credits wallet … conserves money")
- ✓ Debit case: same invariant with negative delta (T: "debits wallet correctly")
- ✓ Ledger insert returning no id → 500 (T: "rolls back via thrown error")
- Uses SELECT … FOR UPDATE to prevent concurrent races
- description embeds `[admin:<id>]` and the verbatim reason
- reference_id encoded as `admin_adjustment:<id>` for traceability
