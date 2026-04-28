# Money handling guide (centavos & BIGINT)

**Status:** canonical reference for any code that reads, writes, or sums money in
the onService platform. Last updated: Phase 13 Dispatch E.

## Storage convention

All monetary values in Postgres are stored as **integer centavos** (1/100 PHP).
There are NO `DECIMAL`, `NUMERIC`, or floating-point columns for money. This
avoids fixed-point arithmetic bugs and ensures exact equality in transfers,
escrow, and reconciliation.

As of migration `059_money_columns_to_bigint.sql`, **every column that
represents money is `BIGINT`** (signed 64-bit). The exhaustive list and the
classification rationale lives in:

- `.ai-coder/checkpoints/logs/PHASE-13/dispatch-E/bigint-inventory.md`

Counter / measurement / display-order columns remain `INTEGER` (see Section 2
of the inventory).

## Runtime: how BIGINT comes back from pg

Without configuration, the `pg` driver returns `BIGINT` (OID 20) values as
**JavaScript strings** to avoid silent precision loss above `2^53 - 1`. This
breaks every money-arithmetic call site in the codebase, none of which expect
strings.

We therefore register a project-wide `pg-types` parser at module load:

```ts
// packages/api/src/config/database.config.ts
import * as pgTypes from 'pg-types';
pgTypes.setTypeParser(20, (val: string) => Number(val));
```

This is **Option B** in the trade-off table below. Importing
`database.config` (directly or transitively via `models/db`) is sufficient to
register the parser; there is no opt-out per query.

## OID parsers registered project-wide

| OID | Postgres type | Coerced to | Where registered |
|----:|---------------|------------|------------------|
| 20  | BIGINT / INT8 | JS `Number` | `packages/api/src/config/database.config.ts` |

Nothing else is overridden — the rest follows pg defaults.

## The Option B ceiling (and what it means)

`Number.MAX_SAFE_INTEGER = 2^53 - 1 = 9_007_199_254_740_991` centavos
≈ ₱90 trillion per single value. After auditing every BIGINT money column in
the inventory, no plausible single-row value approaches this ceiling:

- Largest plausible single booking: ~₱650M (≪ ₱90T).
- Largest plausible aggregate row (`reconciliation_snapshots`,
  `vat_monthly_reports`): ~₱100B (still ≪ ₱90T).

Tracked as `LAUNCH-LIMITATIONS.md §15`.

## Trade-offs considered

**Option A — `BigInt` end-to-end.** Use a custom parser that returns native
JS `BigInt`. No precision loss ever. Cost: every money-math call site must use
`BigInt` operators (`+`, `*` work; mixed `Number + BigInt` throws). JSON
serialization of `BigInt` requires custom replacers. Migration would touch
hundreds of call sites.

**Option B — `Number` (chosen).** Register OID-20 parser to coerce to
`Number`. Zero call-site changes. Loses precision above
`Number.MAX_SAFE_INTEGER`. Acceptable for current and foreseeable platform
scale.

**Option C — DECIMAL with string passthrough.** Store as `NUMERIC(20,0)` and
keep the pg default of returning strings; do arithmetic via a money helper
library (e.g., `dinero.js`). Same call-site cost as Option A; adds a runtime
dependency. Not adopted.

## When you add a new BIGINT column

1. **If it's money:** add the column as `BIGINT`. Nothing else to do — the
   parser will return it as `Number`. Add it to the inventory rationale
   (Section 1) for future reference.

2. **If it's NOT money but is BIGINT** (e.g., a snowflake ID, a monotonic
   counter, an external system identifier that legitimately exceeds 2^53):
   - The global parser will coerce it to `Number`, **silently losing
     precision** above `2^53 - 1`.
   - You MUST handle this at the call site. Options:
     - Use a per-query parser override on the `Pool.Client`:
       ```ts
       const client = await pool.connect();
       try {
         client.setTypeParser?.(20, (v: string) => v); // raw string
         // …queries that read your special BIGINT column…
       } finally {
         client.release();
       }
       ```
       (The `setTypeParser` on a borrowed client is per-connection-only;
       confirm with the pg version in use.)
     - Or cast the column to `TEXT` in the SELECT (`SELECT id::text AS id …`)
       and parse to `BigInt` in TypeScript.
   - **Document the choice in this file** by adding a row to the OID-parser
     table above (or a sub-section explaining the per-query exception).

3. **Never** introduce a `BIGINT` accumulator that could realistically exceed
   `~₱1T cumulative GMV` (10^14 centavos) without revisiting Option A.

## Related references

- `.ai-coder/checkpoints/logs/PHASE-13/dispatch-E/bigint-inventory.md` —
  per-column CHANGE / KEEP / ALREADY-BIGINT classification.
- `LAUNCH-LIMITATIONS.md §14` — polymorphic discount/conversion column debt.
- `LAUNCH-LIMITATIONS.md §15` — Option B ceiling.
- `LAUNCH-LIMITATIONS.md §16` — project-wide parser scope.
- `packages/api/migrations/059_money_columns_to_bigint.sql` — the canonical
  ALTER list.
- `packages/api/__tests__/bigint-money-precision.test.ts` — round-trip tests
  for the parser.
