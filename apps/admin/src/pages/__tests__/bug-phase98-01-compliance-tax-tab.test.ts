// BUG-PHASE98-01 — admin CompliancePage TaxTab no longer shows "TODO:"
//
// Pre-fix the TaxTab rendered:
//   <p>TODO: pulls from /api/v1/admin/bir/exports (Phase 08). Filter by year and type.</p>
//   + dummy year/type pickers
//   + EmptyState "Not yet wired"
// Admins / super-admins / DPOs visiting Compliance > Tax saw a stub
// with a TODO marker leaked into the UI. The /api/v1/admin/bir/*
// endpoints DO exist (mounted via bir-admin.routes.ts) and the
// FinancialsPage > BIR Reports tab actually wires VAT 2550M, 2307
// quarterly batches, reconciliation, and overview. The TaxTab here
// was a duplicate stub left over from Phase 11.
//
// Fix: replace the stub body with a clear directive pointing admins
// to the canonical Financials → BIR Reports surface. No "TODO:",
// no fake form, no "Not yet wired" EmptyState. Button uses
// react-router-dom's useNavigate so it stays inside the SPA.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const COMPLIANCE = readFileSync(
  resolve(__dirname, '../CompliancePage.tsx'),
  'utf8',
);

describe('BUG-PHASE98-01 — CompliancePage TaxTab points at Financials, no TODO leak', () => {
  it('BUG-PHASE98-01 — pre-fix "TODO: pulls from" string is gone', () => {
    expect(COMPLIANCE).not.toMatch(/TODO: pulls from/);
  });

  it('BUG-PHASE98-01 — pre-fix "Not yet wired" EmptyState is gone', () => {
    expect(COMPLIANCE).not.toMatch(/Not yet wired/);
  });

  it('BUG-PHASE98-01 — pre-fix dummy year/type Select pickers are gone from TaxTab', () => {
    // The pre-fix dummy <SelectItem value="2307"> + <SelectItem value="2550m">
    // pickers were specific to the stub. The real surface is on
    // FinancialsPage; CompliancePage shouldn't repeat them.
    const taxStart = COMPLIANCE.indexOf('function TaxTab(');
    const taxEnd = COMPLIANCE.indexOf('function ReportsTab(');
    expect(taxStart).toBeGreaterThan(0);
    expect(taxEnd).toBeGreaterThan(taxStart);
    const taxBody = COMPLIANCE.slice(taxStart, taxEnd);
    expect(taxBody).not.toMatch(/SelectItem/);
  });

  it('BUG-PHASE98-01 — TaxTab uses useNavigate to route to /financials', () => {
    expect(COMPLIANCE).toMatch(/import \{ useNavigate \} from 'react-router-dom'/);
    const taxStart = COMPLIANCE.indexOf('function TaxTab(');
    const taxEnd = COMPLIANCE.indexOf('function ReportsTab(');
    const taxBody = COMPLIANCE.slice(taxStart, taxEnd);
    expect(taxBody).toMatch(/navigate\(['"]\/financials['"]\)/);
    expect(taxBody).toMatch(/Open Financials/);
  });
});
