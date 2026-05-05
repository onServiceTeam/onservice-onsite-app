// BUG-PHASE97-01 — admin DispatchConsole map default center.
//
// Pre-fix the map opened on Manila (14.5995, 120.9842) at zoom 11.
// The platform's launch market is Boracay (Aklan); mobile customer/
// booking/tracker.tsx + provider/job/active.tsx + provider/service-
// area.tsx all default to Boracay (11.9685, 121.9162) per Phase D
// CRIT-77. Admins opening the dispatch console at launch saw an
// empty Manila map and had to manually pan to Boracay every shift —
// a real workflow tax for ops.
//
// Fix: replace `MANILA` constant with `DEFAULT_MAP_CENTER` set to
// the Boracay coords used by the rest of the platform. Zoom moves
// from 11 (Metro-Manila-sized region) to 13 (tighter — Boracay is a
// 7km-long island, zoom 11 would render mostly empty water).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DISPATCH = readFileSync(
  resolve(__dirname, '../DispatchConsolePage.tsx'),
  'utf8',
);

describe('BUG-PHASE97-01 — dispatch map defaults to Boracay (launch market)', () => {
  it('BUG-PHASE97-01 — pre-fix MANILA constant + Manila coords are gone', () => {
    expect(DISPATCH).not.toMatch(/^const MANILA: \[number, number\] = /m);
    expect(DISPATCH).not.toMatch(/14\.5995, 120\.9842/);
  });

  it('BUG-PHASE97-01 — DEFAULT_MAP_CENTER set to Boracay (matches mobile platform default)', () => {
    expect(DISPATCH).toMatch(/DEFAULT_MAP_CENTER: \[number, number\] = \[11\.9685, 121\.9162\]/);
  });

  it('BUG-PHASE97-01 — DEFAULT_ZOOM tightened from 11 to 13', () => {
    expect(DISPATCH).toMatch(/const DEFAULT_ZOOM = 13/);
  });

  it('BUG-PHASE97-01 — MapContainer center prop uses the new constant', () => {
    expect(DISPATCH).toMatch(/center=\{DEFAULT_MAP_CENTER\}/);
    expect(DISPATCH).not.toMatch(/center=\{MANILA\}/);
  });
});
