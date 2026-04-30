# Dispatch 07 — Provider Job Execution Trust — Plan (HANDOFF DOC)

Branch: `phase/14-d07-provider-job-trust`
Started from: master @ `c9632a9` (post-D06 merge, tag `v0.14.0-d06-complete`)
Source spec: `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-07-08.md` lines 10–926
Related: `.ai-coder/CURRENT-DISPATCH` has the numbered subtask list. THIS doc has the lifted technical detail.

---

## Spec corrections inherited from D05 + D06 (READ BEFORE PART-3 §07)

The PART-3 source spec was authored against schema and file-layout assumptions that don't match the actual codebase. D05 documented 10 corrections; D06 documented 15 more (totaling 25). D07 inherits all 25 — the spec was not rewritten between D06 and D07.

**Read both** [`.ai-coder/dispatches/D05-closeout.md`](D05-closeout.md) §"Spec corrections applied" **AND** [`.ai-coder/dispatches/D06-closeout.md`](D06-closeout.md) §"Spec corrections inherited from D05 + extended in D06"  before authoring any D07 code.

The corrections that are MOST RELEVANT to D07's photo-upload + checklist + signature work:

| # | Spec says | Codebase reality | D07 implication |
|---|---|---|---|
| 1 | Migrations 076 + 077 | 076 already taken by D06 (soft-delete columns); 077 deferred to D07 (D05's `promo_redemptions` table). D07 uses **078** (checklist_templates) and **079** (booking_photos_signatures) — plus **077** if D07 chooses to also implement `promo_redemptions` (likely defer to a later dispatch since promo work is unrelated). |
| 2 | Table `subcategories` | Table `service_subcategories` (migration 003). |
| 3 | FK `created_by REFERENCES admin_users(id)` | Table `admin_users` does not exist. Use `users(id)` (role-based admin) or omit `created_by`. |
| 4 | Kysely `db.transaction().execute((trx) => ...)` | Raw pg via `db.transaction(async (client) => { client.query(...) })` — helper exists at `packages/api/src/models/db.ts:17-37`. **CRITICAL:** D07 has multiple multi-row writes (booking_checklists + items, photo upload + booking record); each must use the existing pg-style helper. Translate every Kysely transaction example. |
| 5 | `provider.service.ts:approveProvider` | `provider-admin.service.ts:*` — file moved during Phase 13 (D06 also encountered this). |
| 6 | `apps/mobile/src/services/upload.service.ts` | Verify exists. May need creation; pattern from existing image upload paths. |

**Subtask 1 work:** verify each of the 12 D07 functions / file paths actually exists at master HEAD `c9632a9`. Document additional divergences here.

---

## Standing instructions (read before any code)

**This is the customer ↔ provider trust integrity layer.** Customer pays → provider does work → photos prove work → checklist documents → server verifies → customer reviews → escrow releases. Every link currently has a hole; D07 closes them.

1. **Photos must reach S3.** Mobile uploads use multipart form data via the existing or new `upload.service.ts`. Server stores S3 URL, never `file://`. Validate URL shape on receipt — reject any value matching `^file:\/\//`.

2. **Photo-upload tests verify S3 URL shape AND reject `file://` URIs.** Same test rigor as D06's rollback assertions: write the test FIRST, simulate the failure mode (e.g., client sends `file:///var/data/IMG_1234.jpg`), assert the server rejects with 400.

3. **Server-side checklist completion validation.** Provider can NOT mark a job complete until: (a) all required template items are checked, (b) photo-required items have ≥1 photo, (c) total ≥2 after-photos uploaded. Server-side enforcement, NOT just mobile gating.

4. **Signature is a PNG.** Captured via `react-native-signature-canvas` on the IC agreement screen and the customer review screen. PNG bytes uploaded to S3, URL stored alongside `signedAt`. Provider's signature is part of the IC agreement audit trail; customer's signature on review is the work-acceptance artifact.

5. **Trx-aware composition for checklist completion.** Marking a checklist item complete writes to `booking_checklist_items` AND optionally inserts photo rows into `booking_photos`. Both writes happen in ONE `db.transaction` (use D06's pattern: top-level service wraps; helpers accept `client` parameter).

6. **Honesty check at end of dispatch must include 3 partial-failure scenarios manually traced.** Same shape as D06's:
   - Photo upload to S3 succeeds but DB row insert fails — file leaked? Test: use S3 client's deleteObject in catch handler OR rely on lifecycle policy that purges orphan keys.
   - Mobile retries a complete-job request after partial failure — should be idempotent on server side.
   - Customer's review-screen signature canvas fails to upload — partial completion state must not block escrow release.

7. **Cross-cutting awareness with D06.** D06 modified `provider-admin.service.ts` (notes + profile + wallet adjust), `booking-admin.service.ts` (cancellation + escrow release), `escrow.service.ts` (added 3 trx-aware helpers), and others. D07 modifies DIFFERENT functions in some of these files — read the D06 closeout's "Files modified" list before each subtask.

---

## Bug list (12 entries — Gate B parses this section)

Per PART-3 §07 lines 887–899 (the spec's own closeout claim) — file:line citations to be VERIFIED in subtask 1 against actual master HEAD `c9632a9`:

- Bug 36 — Provider job-completion screen sends `file://` URIs for photos — `apps/mobile/app/provider/job/[id]/complete.tsx` (verify path) — test: `apps/mobile/__tests__/provider/job-complete-photo-upload.test.tsx`
- Bug 37 — IC agreement signature: only `signedAt` timestamp persisted, signature bitmap never sent — `apps/mobile/app/provider/onboarding/identity-verification.tsx` (verify path) + new signature-upload service — test: `apps/mobile/__tests__/provider/signature-capture.test.tsx`
- Bug 38 — Chat photos & messages broken — DEFERRED to v1.1 per spec line 873; add to LAUNCH-LIMITATIONS.md.
- Bug 460 — Checklist hardcoded for cleaning services — `apps/mobile/app/provider/job/[id]/checklist.tsx:39-82` + new `packages/api/src/services/checklist.service.ts` — test: `packages/api/__tests__/services/checklist-templates.test.ts`
- Bug 461 — Checklist photos: same `file://` problem as Bug 36 — same files as Bug 460 — test: `packages/api/__tests__/services/checklist-photo-upload.test.ts`
- Bug 463 — Server has no record the checklist was even shown — `packages/api/src/services/booking-completion.service.ts:markComplete` (verify) — test: `packages/api/__tests__/services/booking-completion.test.ts:bug-463-checklist-required`
- Bug 73 — Admin photo display uses `file://` URLs — `apps/admin/src/pages/booking-detail.tsx` (or similar) — test: `apps/admin/__tests__/booking-photos.test.tsx`
- Bug 943 — Customer photo viewer pinch-zoom broken because photos are broken — `apps/mobile/app/customer/job/[id]/photos.tsx` (verify) — test as part of Bug 36 fix.
- Bug 944 — Customer photo viewer save-to-device broken (same root cause) — same files as Bug 943.
- Bug 1216 — Mobile photo compression + resize before upload — new `apps/mobile/src/services/photo-upload.ts` — test: `apps/mobile/__tests__/services/photo-upload.test.ts`
- Bug 1220 — Server validates ≥2 after-photos before allowing complete — new server-side validation — test: as part of Bug 463.
- Bug 1224 — Earlier provider photos screen migrated to new upload helper — `apps/mobile/app/provider/job/[id]/photos.tsx` (verify) — same upload helper as Bug 36.

**Pre-implementation verification (subtask 1 work):** the file:line citations above are derived from the spec's bug list at lines 887–899. The fresh session must verify each named function/file actually exists in the cited location at HEAD `c9632a9`. If a file has been renamed or moved, update the citations and document in this plan's §"Spec corrections inherited + extended" addendum.

---

## Migration list

- **Migration 078** — `078_d07_checklist_templates.sql`: tables `checklist_templates`, `checklist_template_sections`, `checklist_template_items`, `booking_checklists`, `booking_checklist_items`, `booking_checklist_item_photos`. Seed 8 starter templates (cleaning, aircon, plumbing, electrical, beauty, massage, pest control, gardening). Test: `packages/api/__tests__/migrations/078-checklist-templates.test.ts`. **Note:** PART-3 §07 calls this migration `076_checklist_templates`; renumber to 078 because D06 took 075 + 076.
- **Migration 079** — `079_d07_booking_photos_signatures.sql`: tables `booking_photos` (with `s3_key`, `s3_url`, `image_type`, `uploaded_by`), `booking_signatures` (provider IC + customer acceptance variants). Test: `packages/api/__tests__/migrations/079-booking-photos-signatures.test.ts`. **Note:** PART-3 §07 calls this `077_booking_photos_signatures`; renumber to 079.
- **(Optional) Migration 077** — `077_promo_redemptions.sql`: closes D05's deferred per-customer promo limit (D05 closeout §"Open questions" item 1, also D06 closeout §"Open questions" item 1). **Decision for fresh session: include in D07, defer to D08+, or include in a follow-up "tech debt sweep" dispatch?** Including means promo.service.resolvePromo can finally enforce `usage_limit_per_customer` AND the booking-creation transaction (Bug 175/176 path) gets one extra write inside it. The schema is in D06-plan.md §"Migration list" item 4. If included, the migration number 077 sits between D06's 076 and D07's 078.

---

## S3 + signature architecture

This dispatch introduces real S3 storage for booking artifacts. Architecture:

1. **Mobile upload flow:**
   - User picks photo via ImagePicker / signature canvas captures bitmap.
   - Mobile compresses (Bug 1216): max 1600x1600, 75% JPEG quality, ~200KB target.
   - Mobile sends multipart POST to `/api/v1/uploads/booking-photo` (or `/booking-signature`) with auth.
   - Server validates booking ownership (provider or customer of the booking), receives multipart blob, uploads to S3 with KMS-encrypted bucket `onservice-booking-evidence`, returns `{s3Url, s3Key}`.
   - Mobile stores `{s3Url, s3Key}` in screen state, includes in subsequent requests (e.g., complete-job payload).

2. **Server-side ingestion endpoint:** `packages/api/src/routes/uploads.ts` (new). Uses multer or busboy for multipart parsing. KMS encryption via `aws-sdk`'s `s3.upload({ ServerSideEncryption: 'aws:kms', SSEKMSKeyId: env.S3_KMS_KEY_ID })`.

3. **Booking photo / signature persistence:** `booking_photos` and `booking_signatures` rows are inserted via `markComplete` (Bug 463 path) or via the IC agreement submission. URLs are server-side; client only sees the URL after server confirms.

4. **Validation on complete:** `markComplete` reads `booking_photos WHERE booking_id = $1 AND image_type = 'after'` and rejects with 400 if count < 2 (Bug 1220).

---

## Cross-cutting concerns with D06

D06 modified these files; D07 will modify SOME of them again. List the conflict-risk areas explicitly so the fresh session can plan the rebase / merge resolution:

- **`packages/api/src/services/provider-admin.service.ts`** — D06 modified `adjustProviderWallet` (Bug 78), `updateProviderProfile` (Bug 79), `createProviderNote` (Bug 82), `deleteProviderNote` (Bug 80). D07 doesn't modify those; D07 may add `approveProvider` flow if onboarding is on the bug list (verify in subtask 1). Low conflict risk.
- **`packages/api/src/services/booking-admin.service.ts`** — D06 modified `cancelBookingAsAdmin`, `manualReleaseEscrow`, `refundBookingEscrow`. D07's `markComplete` lives in a DIFFERENT service (`booking-completion.service.ts` or similar). Low conflict risk.
- **`packages/api/src/routes/catalog.routes.ts`** — D06 extracted catalog mutations to `catalog.service.ts`. D07 doesn't modify catalog. No conflict.
- **`packages/api/migrations/`** — D06 added 075 + 076. D07 adds 078 + 079 (and optionally 077). No collision with renumbering.
- **`scripts/gates/MODES.json` + `EXPECTED-FAILURES.md`** — D06 promoted `money-in-transaction` to BLOCKING. D07 doesn't promote a new gate (D11/D12 own visual + emoji + console.* timeline). Don't change MODES.json unless adding a NEW gate fragment for photo-upload integrity (out of scope per spec).

**Rebase risk: low.** D07 is mostly mobile + new server routes/services + new migrations. Existing services are mostly read-only or auxiliary mods.

---

## Subtask list (run sequentially; each is a coherent commit)

Mirrors D05/D06's 18-subtask structure.

1. **Read + verify state.** Read D05-closeout.md §"Spec corrections applied" + D06-closeout.md §"Spec corrections inherited from D05 + extended in D06" first. Read `EXECUTION-DISCIPLINE.md`, `AUTONOMOUS-EXECUTION-PROTOCOL.md`, this plan doc. Verify branch is `phase/14-d07-provider-job-trust` from master HEAD `c9632a9`. Run `bash scripts/gates/run-gate-a.sh` and `bash scripts/gates/c-constitution.sh` — both green except `article-16-closeout-exists`. Verify each file/function on the 12-bug list exists at master HEAD. Document spec/reality mismatches in §"Spec corrections inherited + extended" addendum to this plan. Resolve the optional Migration 077 + admin_users FK + S3 bucket existence questions.
2. **Migration 078 — checklist_templates.** 6 tables + seed for 8 starter templates. Commit: `feat(d07): migration 078 — checklist templates + 8 starter templates`.
3. **Migration 079 — booking_photos_signatures.** 2 tables (booking_photos, booking_signatures). Commit: `feat(d07): migration 079 — booking_photos + booking_signatures tables`.
4. **(Optional) Migration 077 — promo_redemptions.** Per subtask 1 decision. Commit: `feat(d07): migration 077 — promo_redemptions for D05+D06 deferred per-customer enforcement`.
5. **Server: uploads route + S3 service.** New `packages/api/src/services/upload.service.ts` (or extend existing) + `routes/uploads.ts`. KMS-encrypted multipart upload. Commit: `feat(d07): server-side booking photo + signature upload (S3 + KMS)`.
6. **Server: checklist.service.ts.** Read templates, create booking_checklist on first view, update item completion, server-side validation. Commit: `feat(d07): checklist.service — template fetch + completion tracking`.
7. **Server: booking-completion enforcement.** Bug 463 + 1220. Reject markComplete unless ≥2 after-photos + all required checklist items checked. Commit: `fix(d07): server-validate checklist + ≥2 after-photos before complete — Bug 463 + 1220`.
8. **Mobile: photo-upload service + compression.** Bug 1216. Commit: `feat(d07): mobile photo-upload service with compression — Bug 1216`.
9. **Mobile: provider job-complete screen.** Bug 36. Commit: `fix(d07): provider complete screen sends S3 URLs not file:// — Bug 36`.
10. **Mobile: provider photos screen.** Bug 1224. Commit: `fix(d07): provider photos screen migrated to upload service — Bug 1224`.
11. **Mobile: provider checklist screen.** Bug 460 + 461. Commit: `fix(d07): server-driven checklist UI + S3 photos — Bug 460 + 461`.
12. **Mobile: provider IC signature capture.** Bug 37. Adds `react-native-signature-canvas`. Commit: `fix(d07): provider IC signature captured to S3 — Bug 37`.
13. **Mobile: customer photo viewer.** Bug 943 + 944. Commit: `fix(d07): customer photo viewer uses S3 URLs — Bug 943 + 944`.
14. **Admin: booking photos display.** Bug 73. Commit: `fix(d07): admin booking-detail shows S3 photos — Bug 73`.
15. **LAUNCH-LIMITATIONS update.** Bug 38 chat deferred to v1.1 — add §25 (or similar). Commit: `docs(d07): defer Bug 38 chat fix to v1.1 — LAUNCH-LIMITATIONS §25`.
16. **(Optional) Gate addition.** No new gate per spec. Skip.
17. **Write D07 closeout** at `.ai-coder/dispatches/D07-closeout.md`. Bug list (12 entries with file:line + test) + §"Spec corrections inherited" (link to D05 + D06 mappings + any extensions found in subtask 1) + §"Honesty check — 3 partial-failure scenarios manually traced" (one per category: photo-upload partial failure, mobile retry idempotency, signature canvas failure) + §"Open questions / known limitations" + §"What dispatches D08+ now have available". Commit: `docs(d07): closeout`.
18. **Run full local audit chain** (gates A–E + full api jest suite). Push. Open PR titled `Dispatch 07 — Provider job execution trust (12 bugs + S3 + KMS evidence storage)`. Watch CI. Once green, autoproceed to D08 (NPC compliance + DSR) per autonomous protocol. D08 spec: `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-07-08.md` lines 928–end.

---

## Definition of done (D07 closeout passes Gate B + audit chain)

1. All 12 bugs above have a closing commit with `Bug NNNN` in the message AND a test in `packages/api/__tests__/` or `apps/mobile/__tests__/` or `apps/admin/__tests__/` that references the bug number.
2. Migrations 078 + 079 (and optionally 077) are applied; their migration tests pass.
3. `c-constitution-money-in-transaction` continues to pass (D06's BLOCKING gate).
4. All 5 gates pass on the open PR: A, B, C, D, E + gates-summary.
5. Honesty check at end of closeout includes 3 partial-failure scenarios manually traced — each ends with one of the two acceptable DB-state statements per standing instruction §6.
6. The §"Spec corrections inherited" section in the closeout enumerates each D05 + D06 correction that affected D07 implementation, with a one-sentence note on how D07 honored it.
7. `LAUNCH-LIMITATIONS.md` gains a new §25 (or appropriate number) for Bug 38 chat deferral.
8. EAS rebuild instructions documented in closeout's "Decision points for Ken" section.

---

## Notes for fresh session

- D06 + tag `v0.14.0-d06-complete` are on master at `c9632a9`. Branch protection restored.
- The atomic relax-merge-restore pattern documented in D01-final-closeout.md and used through D06 is available for D07's self-merge.
- D06's gate logic fix (raw-pg pattern detection) carries forward — any new D07 code is automatically subject to the BLOCKING `money-in-transaction` check.
- The D06 `// gate-c-allowed: best-effort-audit-only` markers are documented inline; D07 should follow the same convention for any try/catch'd audit.
- Don't skim the spec corrections inherited section — D05 + D06 spent time deriving the 25 corrections combined. D07 inherits them all.
- The 5 hard stops still apply. The most likely halt point is subtask 1's verification step: if many of the 12 file paths have shifted or several functions don't exist, that's a Stop 5 — escalate vs proceed-with-corrections decision.
- Open the D07 PR titled `Dispatch 07 — Provider job execution trust (12 bugs + S3 + KMS evidence storage)`.

---

## Spec corrections inherited + extended (D07 subtask-1 verification)

Subtask-1 verification at master HEAD `c9632a9` resolves the 5 open questions and finds additional spec/reality divergences. Headlines:

| # | Spec said | Reality | D07 implication |
|---|---|---|---|
| 1 | Migration `076_checklist_templates` + `077_booking_photos_signatures` | 075 + 076 already taken by D06; 077 reserved for D05's deferred `promo_redemptions` | Use **078** (checklist_templates) and **079** (booking_photos_signatures). 077 stays reserved. |
| 2 | Table `subcategories` | Table `service_subcategories` (migration 003; same finding as D05/D06) | Migration 078 references `service_subcategories(id)`. |
| 3 | FK `created_by REFERENCES admin_users(id)` | Table `admin_users` does not exist | Use `users(id)` for `created_by` (matches the actor convention used in `admin_actions.admin_id`). |
| 4 | Kysely `db.transaction().execute((trx) => ...)` | Raw pg `db.transaction(async (client) => ...)` | All D07 server code uses raw pg via the existing helper. |
| 5 | New `multer`, `sharp`, `@aws-sdk/client-s3` deps | Already installed: `@aws-sdk/client-s3@^3.1038.0`, `multer` (via existing `routes/upload.routes.ts`); `sharp` NOT installed | D07 uses a **server-side passthrough** model: mobile compresses + resizes via `expo-image-manipulator` (no server-side `sharp` dep). Server validates MIME/size and uploads the compressed blob as-is. Closes Bug 1216 client-side; defers thumbnail-generation to a v1.1 polish. |
| 6 | New `routes/uploads.ts` | Existing `routes/upload.routes.ts` already accepts multipart uploads | Add a NEW endpoint `POST /api/v1/uploads/booking-photo` that wraps the existing `upload.service.saveUploadedFile` AND inserts into `booking_photos`. Existing generic `POST /upload` is preserved for general use cases (job-request, change-order, dispute, chat, etc.). |
| 7 | `apps/mobile/app/provider/onboarding/identity-verification.tsx` | Actually `apps/mobile/app/provider-onboarding/identity-verification.tsx` (one path segment, not nested) | Use the actual path. |
| 8 | `apps/mobile/app/customer/job/[id]/photos.tsx` | Actually `apps/mobile/app/customer/booking/photos.tsx` (different segment) | Use actual path. Verify when fixing Bug 943/944. |
| 9 | `apps/admin/src/pages/booking-detail.tsx` | Actually `apps/admin/src/pages/BookingDetailPage.tsx` (PascalCase) | Use actual path for Bug 73. |
| 10 | `react-native-signature-canvas` native dep | Not installed in mobile | Add to `apps/mobile/package.json`. EAS rebuild required on next mobile deploy — flagged in closeout. |
| 11 | S3 bucket configured via Terraform | `infra/` Terraform state not verified; existing `upload.service.ts` works in dual mode (local FS dev, S3 prod via env) | D07 reuses the existing dual-mode service. Production S3 bucket configuration is a D14 cutover concern. |

## Open verification questions resolved (subtask 1 outcome)

1. **`admin_users` FK target.** Resolved row #3 above: use `users(id)`.
2. **Migration 077 (`promo_redemptions`).** **DEFERRED to D14 cleanup sweep.** D07 has plenty of scope (12 bugs + 2 migrations + new server route + 8 checklist templates + signature canvas dep). Adding a 13th unrelated bug would inflate scope further. Documented in §"Scope decisions" of D07 closeout.
3. **S3 + KMS Terraform state.** Resolved row #11: existing `upload.service.ts` already handles dual mode. Production env config is D14 work. D07 ships the code; deployment ops happens in D14.
4. **`react-native-signature-canvas` dep.** Resolved row #10: add to mobile package.json + flag EAS rebuild in closeout.
5. **Bug 38 (chat photos broken).** Confirmed deferral to v1.1 per spec line 873. Add to LAUNCH-LIMITATIONS as §25.

## Migration renumbering: 078, 079 (077 reserved)

- D05: 074 (service area bounds)
- D06: 075 (admin_actions.full_notes), 076 (soft-delete columns)
- D07-reserved-for-future: 077 (promo_redemptions, DEFERRED)
- D07: 078 (checklist_templates), 079 (booking_photos + signatures)

## Subtask sequence adjustment

Mostly unchanged from the original plan. Specific path corrections:
- Subtask 9: `apps/mobile/app/provider/job/[id]/complete.tsx` ✓ exists.
- Subtask 11: `apps/mobile/app/provider/job/[id]/checklist.tsx` ✓ exists.
- Subtask 12: `apps/mobile/app/provider-onboarding/identity-verification.tsx` (NOT `provider/onboarding/`).
- Subtask 13: `apps/mobile/app/customer/booking/photos.tsx` (NOT `customer/job/[id]/photos.tsx`).
- Subtask 14: `apps/admin/src/pages/BookingDetailPage.tsx` (PascalCase).
- Skip subtask 4 (Migration 077): deferred per resolution above.
