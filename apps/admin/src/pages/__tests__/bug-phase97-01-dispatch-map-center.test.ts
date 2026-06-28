// BUG-PHASE97-01 — admin DispatchConsole map default center.
//
// Pre-fix the map opened on Manila (14.5995, 120.9842) at zoom 11.
// Admins opening the dispatch console saw an empty Manila map and had
// to manually pan to the active market every shift — a real workflow
// tax for ops.
//
// Fix: replace the hardcoded `MANILA` constant with a `DEFAULT_MAP_CENTER`
// constant wired into the MapContainer. The default market is now Metro
// Cebu (10.3157, 123.8854), per the city-agnostic, Cebu-default direction
// in CLAUDE.md — superseding the earlier Boracay default this test was
// originally written against. The assertions below guard against the
// original Manila regression and confirm the map is driven by the
// constant rather than a hardcoded literal.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DISPATCH = readFileSync(
  resolve(__dirname, '../DispatchConsolePage.tsx'),
  'utf8',
);

describe('BUG-PHASE97-01 — dispatch map defaults to the active market, not Manila', () => {
  it('BUG-PHASE97-01 — pre-fix MANILA constant + Manila coords are gone', () => {
    expect(DISPATCH).not.toMatch(/^const MANILA: \[number, number\] = /m);
    expect(DISPATCH).not.toMatch(/14\.5995, 120\.9842/);
  });

  it('BUG-PHASE97-01 — DEFAULT_MAP_CENTER set to Metro Cebu (default launch market)', () => {
    expect(DISPATCH).toMatch(/DEFAULT_MAP_CENTER: \[number, number\] = \[10\.3157, 123\.8854\]/);
  });

  it('BUG-PHASE97-01 — DEFAULT_ZOOM is a city-level zoom, not the wide Manila-region zoom 11', () => {
    const m = DISPATCH.match(/const DEFAULT_ZOOM = (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(12);
  });

  it('BUG-PHASE97-01 — MapContainer center prop uses the new constant', () => {
    expect(DISPATCH).toMatch(/center=\{DEFAULT_MAP_CENTER\}/);
    expect(DISPATCH).not.toMatch(/center=\{MANILA\}/);
  });
});
