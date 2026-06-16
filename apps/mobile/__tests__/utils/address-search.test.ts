// Real behavioral test for the customer Address Picker's offline city matcher.
//
// Bug (reported by a Cebu City tester, 2026-06-16): typing a real street
// address ("flordeliz street bulacao, Cebu City, Philippines 6000") returned no
// city, and the Confirm step then blocked with "Location Not Recognized — We
// could not determine the city for this pin." Root cause: handleSearch matched
// with the `.includes` arguments reversed (it asked whether the short city name
// contained the whole typed address, which is always false for a street-level
// address). The matching logic now lives in src/utils/ph-regions.ts so it can be
// exercised directly (the screen itself can't mount in this jest harness because
// react-native-maps throws at import — see customer-address-picker.real.test.tsx).
//
// The screen can't be rendered here, so we test the extracted matcher against
// the exact tester input. This is the real decision the screen makes, not a
// regex over source.

import { matchRegionForQuery, guessRegionFromCoordinates } from '../../src/utils/ph-regions';

describe('Address Picker city matcher (matchRegionForQuery)', () => {
  it('Bug 2026-06-16 — a typed street address containing the city resolves the city (was: "Location Not Recognized")', () => {
    const match = matchRegionForQuery('flordeliz street bulacao, Cebu City, Philippines 6000');
    expect(match).not.toBeNull();
    expect(match).toMatchObject({ city: 'Cebu City', province: 'Cebu' });
  });

  it('returns null when the typed text contains no known city, so the picker shows a hint instead of a confusing empty-city result', () => {
    expect(matchRegionForQuery('lot 5 block 2 phase 3 unknown subdivision')).toBeNull();
    expect(matchRegionForQuery('   ')).toBeNull();
  });

  it('matches when only the city name is typed', () => {
    expect(matchRegionForQuery('Makati')).toMatchObject({ city: 'Makati' });
    expect(matchRegionForQuery('cebu')).toMatchObject({ province: 'Cebu' });
  });
});

describe('Address Picker pin-to-city fallback (guessRegionFromCoordinates)', () => {
  it('resolves a Cebu City coordinate to Cebu City', () => {
    expect(guessRegionFromCoordinates(10.3157, 123.8854)).toEqual({ city: 'Cebu City', province: 'Cebu' });
  });

  it('returns empty city for a coordinate far from any known city', () => {
    // Mid-ocean point — more than ~0.5 degrees from every listed city.
    expect(guessRegionFromCoordinates(5.0, 130.0)).toEqual({ city: '', province: '' });
  });
});
