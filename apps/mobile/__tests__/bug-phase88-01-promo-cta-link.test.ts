// BUG-PHASE88-01 — promotion ctaLink dispatch.
//
// promotions.cta_link is a VARCHAR(500) with no format constraint
// (see packages/api/migrations/044_promotions.sql). Operators set it
// to either internal paths (e.g. '/customer/category/cleaning') or
// external URLs (e.g. 'https://onservice.ph/promo'). Pre-fix the
// home tab passed the value straight to expo-router's router.push,
// which silently fails for external URLs — the customer's tap on
// the promo CTA did nothing.
//
// Fix: route by shape — internal paths (start with '/') go through
// router.push; http/https URLs go through Linking.openURL; any
// other shape is ignored.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const HOME = readFileSync(
  resolve(__dirname, '../app/(tabs)/home.tsx'),
  'utf8',
);

describe('BUG-PHASE88-01 — promotion ctaLink routes by shape', () => {
  it('BUG-PHASE88-01 — Linking is imported from react-native (was missing pre-fix)', () => {
    expect(HOME).toMatch(/from 'react-native'[\s\S]*?Linking/);
  });

  it('BUG-PHASE88-01 — internal paths (start with /) go through router.push', () => {
    expect(HOME).toMatch(/link\.startsWith\(['"]\/['"]\)/);
    expect(HOME).toMatch(/link\.startsWith\(['"]\/['"]\)\) \{\s*\n\s*router\.push\(link\)/);
  });

  it('BUG-PHASE88-01 — http/https URLs go through Linking.openURL', () => {
    expect(HOME).toMatch(/\^https\?:\\\/\\\//);
    expect(HOME).toMatch(/Linking\.openURL\(link\)/);
  });

  it('BUG-PHASE88-01 — pre-fix unconditional router.push(item.ctaLink) is gone', () => {
    // The exact pre-fix line was:
    //   if (item.ctaLink) router.push(item.ctaLink);
    expect(HOME).not.toMatch(/if \(item\.ctaLink\) router\.push\(item\.ctaLink\);/);
  });
});
