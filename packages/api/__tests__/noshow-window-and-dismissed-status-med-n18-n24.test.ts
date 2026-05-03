// MED-N18 + MED-N24 fix verified.
//
// MED-N18: dispute auto-resolution no_show window is now admin-tunable
// via `noshow_auto_resolve_window_minutes` (default 30, up from the
// hardcoded 5 that auto-flagged real providers doing legitimate
// quick repairs).
//
// MED-N24: provider.service.getTierProgression open-disputes filter
// previously excluded the non-existent 'dismissed' status (migration
// 014 only defines: open, under_review, escalated, resolved). The
// filter accidentally excluded nothing extra but signaled developer
// confusion. Now: only filters by the actual terminal status.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as settingsService from '../src/services/settings.service';

const DISPUTE_SVC = readFileSync(
  resolve(__dirname, '../src/services/dispute.service.ts'),
  'utf8',
);
const PROVIDER_SVC = readFileSync(
  resolve(__dirname, '../src/services/provider.service.ts'),
  'utf8',
);

describe('MED-N18 — noshow_auto_resolve_window_minutes is admin-tunable', () => {
  it('SETTING_DEFAULTS contains the new key with default 30', () => {
    expect(settingsService.SETTING_DEFAULTS['noshow_auto_resolve_window_minutes']).toBe('30');
  });

  it('dispute.service imports settingsService', () => {
    expect(DISPUTE_SVC).toMatch(/import \* as settingsService from '\.\/settings\.service'/);
  });

  it('attemptAutoResolution reads the window value via getSettingInteger', () => {
    expect(DISPUTE_SVC).toMatch(/settingsService\.getSettingInteger\('noshow_auto_resolve_window_minutes'\)/);
  });

  it('the threshold check uses the dynamic value, not hardcoded 5', () => {
    expect(DISPUTE_SVC).toMatch(/if \(minutesBetween < noShowWindowMinutes\)/);
    // The OLD hardcoded `if (minutesBetween < 5)` must be GONE
    // from the auto-resolution code path.
    const block = DISPUTE_SVC.match(/attemptAutoResolution[\s\S]*?return false;\s*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/minutesBetween < 5\)/);
  });

  it('falls back to 30 when settings unreadable (debug log)', () => {
    expect(DISPUTE_SVC).toMatch(/let noShowWindowMinutes = 30/);
    expect(DISPUTE_SVC).toMatch(/noshow_auto_resolve_window_minutes setting unreadable/);
  });
});

describe('MED-N24 — getTierProgression no longer references non-existent "dismissed" status', () => {
  it('the open-disputes COUNT query no longer includes \'dismissed\'', () => {
    // BUG-PHASE18-08 fix update: pre-fix the test asserted the SQL was
    // `disputes WHERE provider_id = $1 AND status NOT IN ('resolved')`,
    // but `disputes` table has no `provider_id` column — that query
    // returned 500 in production. Phase 18 changed the query to join
    // through bookings; the constraint we still want to enforce is
    // (a) the filter still excludes ONLY 'resolved' (no 'dismissed'),
    // and (b) the join is via bookings.provider_id, not a direct
    // disputes.provider_id reference.
    expect(PROVIDER_SVC).toMatch(/JOIN bookings b ON b\.id = d\.booking_id/);
    expect(PROVIDER_SVC).toMatch(/WHERE b\.provider_id = \$1/);
    expect(PROVIDER_SVC).toMatch(/d\.status NOT IN \('resolved'\)/);
  });

  it("does NOT include 'dismissed' as a SQL filter value in any disputes query", () => {
    // The word may appear in the explanatory comment, but no SQL
    // string literal should contain it as a status filter.
    expect(PROVIDER_SVC).not.toMatch(/status NOT IN \([^)]*'dismissed'/);
    expect(PROVIDER_SVC).not.toMatch(/status IN \([^)]*'dismissed'/);
    expect(PROVIDER_SVC).not.toMatch(/status\s*=\s*'dismissed'/);
  });

  it('comment documents the MED-N24 fix rationale', () => {
    expect(PROVIDER_SVC).toMatch(/MED-N24 fix/);
    expect(PROVIDER_SVC).toMatch(/migration 014 defines/);
  });
});
