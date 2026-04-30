# D05 — Spec vs schema decision (PART-3 §Dispatch 05 vs actual database)

**Status:** RESOLVED — Option A (Ken, 2026-04-30).
**Blocking:** cleared.
**Source spec:** `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-05-06.md` §"Dispatch 05" (lines 10–1228).
**Plan doc:** `.ai-coder/dispatches/D05-plan.md` (paraphrases the spec; same gaps).
**Discovered at:** subtask 1 (read + verify), branch `phase/14-d05-money-trust-closure` @ HEAD `ef70429` (after small gate-hygiene edit to drop literal trademark refs from plan doc).

---

## The question

The PART-3 spec for Dispatch 05 is internally consistent and well-written, but it was authored against a schema that does not match the actual database. Five concrete contradictions, ranked by blast radius:

1. **Subcategory table is named differently.** Spec consistently writes `db.selectFrom('subcategories')`. Codebase uses `service_subcategories` (defined in `packages/api/migrations/003_create_services.sql:19`, queried by `packages/api/src/services/booking.service.ts:82`, `services/catalog.service.ts:23`, `services/provider.service.ts:31`, `services/rebooking.service.ts:28`, `services/provider-admin.service.ts:196`).

2. **Price columns have no `_cents` suffix.** Spec writes `base_price_cents`, `min_price_cents`, `max_price_cents`. Schema has `base_price`, `min_price`, `max_price` (INTEGER, centavos by convention but no suffix). Same files as above.

3. **Subcategory `pricing_type` includes a third value.** Spec only handles `'fixed'` and `'quote'`. Schema is `CHECK (pricing_type IN ('fixed', 'quote', 'hourly'))`. The pricing.service.ts spec has no branch for hourly — runtime would silently miscompute or throw.

4. **Quotes table is `booking_quotes`, not `provider_quotes`.** Spec writes `db.selectFrom('provider_quotes')` with columns `customer_id`, `provider_id`, `subcategory_id`, `amount_cents`, `expires_at`, `status`. Codebase has `booking_quotes` (extends the `bookings` FK, defined in `migrations/018_quotes_change_orders.sql`) with columns `status IN ('submitted','accepted','declined','expired','withdrawn')`, `labor_amount`, `materials_amount`, `notes`, `portfolio_photos`, no `expires_at`, no direct `customer_id` (resolved via the booking FK), no `subcategory_id` (also via booking).

5. **`tip_max_amount_cents` is not seeded.** Spec assumes `settings.tip_max_amount_cents` exists at line 1009 ("`maxCents: settings.tip_max_amount_cents`"). Greps of `packages/api/migrations/` find zero references. Plan doc says "already in defaults at ₱5,000" but that is wrong.

There is also a sixth contradiction that is smaller but worth noting:

6. **Spec uses Kysely `selectFrom`; codebase uses raw `db.query`.** All existing services use node-postgres style template-string SQL. CLAUDE.md describes the stack as "Kysely + Postgres" but the actual code does not use Kysely query builders. Either Kysely was a planned adoption that didn't ship, or the spec is illustrative and pg-style is acceptable.

There is also a separate issue (independent of the question above) that I already handled: the gate `c-constitution-no-shield-references` was failing because the allowlist covers `D04-*` dispatch docs but not D05's. I made the lightest possible fix — reworded two lines of `D05-plan.md` to point to the D04 decision file by name instead of using the literal trademark string. Gates now pass except `article-16-closeout-exists` (which is structurally mid-dispatch and clears in subtask 17). Reporting it here for completeness; not part of this decision.

---

## Why this is Stop 5 (per `AUTONOMOUS-EXECUTION-PROTOCOL.md`)

> If during a phase, the AI coder discovers that the phase doc says X, the existing spec docs say Y, and X and Y are materially different (not just clarifications) → Stop. Document. Ask Ken which is correct.

The phase doc and the schema disagree on five points. They are not clarifications — they are wrong identifiers (table names, column names, missing enum value, missing seed row). Following the spec verbatim would produce code that does not compile against the actual database. Following the schema requires ignoring the spec.

CLAUDE.md also says: "Do not edit `.ai-coder/phase-14/*` files. They are read-only references. If you find an error in them, write `.ai-coder/escalations/E<NN>-doc-error-<date>.md` describing the error and pause." The PART-3 doc has errors; this file doubles as the doc-error escalation.

---

## Option A — Follow the codebase schema, document divergence in closeout

**What it means.** Implement subtasks 2–18 against the real schema. Service files use `service_subcategories`, columns without `_cents` suffix, raw `db.query` style. Add a third branch in `pricing.service.ts` for `pricing_type === 'hourly'` (likely throws "hourly_pricing_not_supported_in_v1" or routes to a separate hourly resolver — needs a sub-decision). For the quote flow, build `from-quote.service.ts` against `booking_quotes` with the actual columns; the service signature changes from "quote → new booking" to "quote → existing booking is the parent, mark accepted." Migration 074 (not 073) for service-area CHECKs. Add a small migration 075 (or fold into 074) to seed `tip_max_amount_cents` and the three new admin-editable settings.

The D05 closeout records all six divergences with a paragraph each ("spec said X, codebase has Y, implementation followed Y because…"). A follow-up dispatch (or a directly-issued correction PR) updates PART-3 to match.

**Pros**
- Smallest change footprint. No schema renames. No risk to D03/D04 code.
- Real bug-fix intent (server-canonical pricing, validator strictness) preserved 1:1.
- Tests run against real seeded rows (the standing instruction §1) without table-rename gymnastics.
- D05 stays inside its 16-bug-fix scope; doesn't expand into a schema-migration dispatch.

**Cons**
- Closeout has a long divergence section. Reviewer (Ken) has to read it carefully.
- PART-3 spec stays incorrect until a separate amendment lands.
- Future dispatches reading PART-3 §05 will hit the same gaps if they don't read this decision file first.
- Sub-decision required on what to do with `pricing_type='hourly'` (defer to v1.1? throw? route to separate resolver?).

---

## Option B — Migrate the schema to match the spec

**What it means.** New migration 074 that does ALTER TABLE service_subcategories RENAME TO subcategories, ALTER COLUMN base_price RENAME TO base_price_cents, etc. Same for booking_quotes → provider_quotes (or create new provider_quotes side-by-side). Adopt Kysely properly throughout (replacing every existing `db.query` call site). Seed tip_max_amount_cents. Then implement D05 against the renamed schema.

**Pros**
- Single source of truth: spec and schema align.
- Future audits comparing PART-3 spec to implementation pass cleanly.

**Cons**
- Massive blast radius. Every service that queries the renamed tables/columns breaks: `booking.service.ts`, `catalog.service.ts`, `provider.service.ts`, `rebooking.service.ts`, `provider-admin.service.ts`, `routes/catalog.routes.ts`, plus admin pages and mobile screens that consume the responses.
- Renames are cosmetic. No behavioral benefit. Pure churn 6 weeks before launch.
- Risk of breaking unrelated D03/D04 code that already merged.
- Adopting Kysely is itself a multi-day change, well outside D05's scope.
- Production risk: Stop 4 territory if applied to staging (renames break in-flight queries).

---

## Option C — Edit PART-3 spec to match the codebase, then implement

**What it means.** Treat this session's discovery as a doc-error escalation. Open a separate PR that updates `PART-3-BUG-REMEDIATION-DISPATCHES-05-06.md` lines 10–1228 to use real table/column names, add the `'hourly'` branch, fix the quote-table assumption, add the seed-migration step. Ken reviews and merges. Then resume D05 against the corrected spec.

**Pros**
- Clean. Spec and implementation both correct, both reviewable independently.
- Future dispatches read the right thing.
- No code-time divergence section in the closeout.

**Cons**
- Requires Ken to review and merge a spec-correction PR before D05 can resume — adds elapsed time.
- CLAUDE.md says "Do not edit `.ai-coder/phase-14/*` files" — this option requires explicit Ken signoff to do so.
- The spec PR must be careful not to accidentally re-write the dispatch's intent while editing it for schema correctness.
- D05's 18 subtasks are otherwise ready to run; pausing for spec correction loses momentum.

---

## My recommendation

**Option A**, with a sub-recommendation for hourly: defer hourly-pricing to v1.1 by throwing `hourly_pricing_not_supported_in_v1` from the new `pricing.service.ts` and adding a `LAUNCH-LIMITATIONS.md` entry. The audit's bug list does not name an hourly bug; the codebase has the schema column but no real flow exercising hourly today.

Reasoning: the goal of D05 is to close 12 client-money bugs by enforcing server-canonical pricing. The architectural pattern (clients send IDs, server computes from DB) is the same regardless of which table name we use. Renaming tables (Option B) trades real risk against zero behavioral benefit. Editing the spec (Option C) is the cleanest path *but* requires Ken's review on the spec PR before D05 can resume; Option A lets D05 land first and the spec correction follow as a small follow-up.

Whichever you pick: I will also append a one-line note to PART-3 §Dispatch 05 (or open a separate `D05-followup-spec-correction` task) to flag the contradictions so the next AI coder reading PART-3 §Dispatch 06 (Transactional audit completeness, lines 1231+) is aware that the same caveats may apply.

---

## What I need from you

Pick one:

- **Option A** → I update CURRENT-DISPATCH to clear the block, document the divergences as I go, and run subtasks 2–18 against the real schema. I'll surface the hourly sub-decision separately (or accept the v1.1-defer recommendation if you nod).
- **Option B** → I write a much more cautious plan with the full schema-rename impact analysis before any code change. I'd want to escalate again before applying renames.
- **Option C** → I draft the PART-3 correction PR (touching only the schema-identifier text, not the bug-fix logic). You review and merge. I resume D05 after.
- **Other** → tell me what you want.

Once you write your choice at the bottom of this file, I clear the block in `.ai-coder/CURRENT-DISPATCH`, append the resolution to `.ai-coder/SESSION-LOG.md`, and resume.

---

## Ken's decision

**Option A.** Follow the actual schema. Document divergence in the closeout. Defer `'hourly'` pricing to a tracked v1.1 limitation per `LAUNCH-LIMITATIONS.md` §24. Migration numbering corrected: 074 instead of 073. `tip_max_amount_cents` seeded via new migration 074 since the column-or-row doesn't exist anywhere. Push the decision file. Proceed with subtask 2.

Concrete corrections to apply (canonical mapping — see `D05-plan.md` §"Schema correction (Ken's Option A — 2026-04-30)"):

- Spec `subcategories` → use `service_subcategories`.
- Spec `base_price_cents`/`min_price_cents`/`max_price_cents` → use `base_price`/`min_price`/`max_price` (columns store centavos despite no suffix; documented in migration 003 comments).
- Spec `provider_quotes(customer_id, subcategory_id, amount_cents, expires_at, status)` → reality is `booking_quotes(booking_id, provider_id, quoted_price, expires_at, is_accepted)` bound to an existing booking. `from-quote.service.ts` takes a `bookingId`, verifies the quote belongs to the booking, hasn't expired, and `is_accepted=true`. Bug 175 intent (server validates the quote at booking time) stands; implementation differs because quotes here aren't pre-booking pricing requests.
- Spec Kysely `selectFrom` → use raw `db.query` style consistent with the rest of `packages/api/src/services/`. Type-safe via TypeScript `interface` on row results. Don't introduce Kysely.
- Spec migration 073 → use 074 (073 is taken by `073_founding_tier.sql` from D03).
- Spec assumes `tip_max_amount_cents` seeded → not seeded anywhere. Add to migration 074 as a new `platform_settings` row (`category='fees'`, `key='tip_max_amount_cents'`, `value='500000'`, `value_type='currency'`, `unit='centavos'`, `min_value=10000`, `max_value=10000000`).

`pricing_type='hourly'`: deferred to v1.1+ per LAUNCH-LIMITATIONS §24. New `pricing.service.ts` throws `subcategory_pricing_type_unsupported` (HTTP 400) when called with an hourly subcategory. Admin UI to be hardened in a later dispatch (out of D05 scope).

Each commit for subtasks 2–15 will include a `Schema-divergence:` footer naming which correction applies (or "none" when the change is schema-agnostic). The D05 closeout (subtask 17) will have a §"Spec corrections applied" section mapping each divergence to its resolution; this becomes the reference for D06+ if those dispatches inherit the same spec assumptions.
