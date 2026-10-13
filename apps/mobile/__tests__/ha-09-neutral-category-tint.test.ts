// Human audit 2026-10-13, item HA-09 (task HA-DISC item 5): Ken called the
// per-category rainbow pastels "cartoonish". getCategoryTint keeps its
// signature (addresses, payment methods, booking configure/form and the
// category header still call it) but now returns one neutral brand pair for
// every key. (Moved here from the HA-03 file so each ID covers one behaviour
// in one file.)
import { colors, getCategoryTint } from '@/config/theme';

it('HA-09: getCategoryTint returns the same neutral brand pair for every key', () => {
  const expected = { bg: colors.primaryLight, fg: colors.primary };
  for (const key of ['cleaning', 'electrical', 'pest-control', 'aircon', 'Home', 'gcash', '', undefined, null]) {
    expect(getCategoryTint(key)).toEqual(expected);
  }
});
