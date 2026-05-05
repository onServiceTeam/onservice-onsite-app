// BUG-PHASE108-01 — admin AuditLogPage empty-state message was
// filter-blind: it checked only `actionFilter || entityTypeFilter`
// to decide between "Try adjusting your filters" and "Audit entries
// will appear as system actions occur." The page also exposes
// sourceFilter, fromDate, and toDate filters (Phase 14 dispatch +
// BUG-PHASE42-02). When a compliance officer narrowed by date range
// or source stream and got zero hits, the empty state claimed NO
// entries exist anywhere in the system — the opposite of the truth,
// and the kind of false-negative that would bury a compliance
// investigation.
//
// Fix: empty-state condition now mirrors the same filter-aware
// condition the page already uses to show the "Clear Filters"
// button (line 190 of the source pre-fix), so the messaging matches
// reality across all five filter inputs.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const AUDIT = readFileSync(
  resolve(__dirname, '../AuditLogPage.tsx'),
  'utf8',
);

describe('BUG-PHASE108-01 — audit log empty-state message respects all filters', () => {
  it('BUG-PHASE108-01 — empty-state condition checks all five filters', () => {
    // The empty-state branch should reference all four filter sources
    // (action / entityType / source / fromDate / toDate). Match the
    // exact pattern used in the conditional inside the empty state.
    expect(AUDIT).toMatch(
      /\(actionFilter \|\| entityTypeFilter \|\| sourceFilter !== 'all' \|\| fromDate \|\| toDate\)\s*\?\s*'Try adjusting your filters\.'/,
    );
  });

  it('BUG-PHASE108-01 — pre-fix narrow check is gone from the empty state', () => {
    // The pre-fix snippet `actionFilter || entityTypeFilter ? 'Try adjusting`
    // (with NO sourceFilter/fromDate/toDate guards) must no longer appear.
    expect(AUDIT).not.toMatch(/\{actionFilter \|\| entityTypeFilter \? 'Try adjusting your filters\.'/);
  });

  it('BUG-PHASE108-01 — the existing Clear Filters button condition is preserved (regression guard)', () => {
    // The Clear Filters button uses the same condition. If a future
    // refactor narrows it, the empty state would drift back out of
    // sync. Lock both call-sites by counting occurrences.
    const clearButtonMatch = AUDIT.match(
      /\(actionFilter \|\| entityTypeFilter \|\| sourceFilter !== 'all' \|\| fromDate \|\| toDate\)/g,
    );
    // Expect at least 2 occurrences: Clear Filters button + empty state.
    expect(clearButtonMatch?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
