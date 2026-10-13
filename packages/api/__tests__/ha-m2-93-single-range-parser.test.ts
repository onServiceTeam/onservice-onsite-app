// HA-M2-93 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 14): the HTTP Range parser used to stream request videos
// and voice notes handles an open range (0-), a closed range (100-199), a
// suffix (-500), a range past the end (unsatisfiable, answered 416) and
// several ranges (null, answered with the whole file). Real parser, no mocks.
import { parseSingleRange } from '../src/utils/http-range';

it('HA-M2-93: the Range parser handles 0-, 100-199, -500, out of range and multiple ranges', () => {
  const size = 1000;
  expect(parseSingleRange('bytes=0-', size)).toEqual({ start: 0, end: 999 });
  expect(parseSingleRange('bytes=100-199', size)).toEqual({ start: 100, end: 199 });
  expect(parseSingleRange('bytes=-500', size)).toEqual({ start: 500, end: 999 });
  // An end past the file is clamped; a suffix longer than the file is the whole file.
  expect(parseSingleRange('bytes=900-5000', size)).toEqual({ start: 900, end: 999 });
  expect(parseSingleRange('bytes=-5000', size)).toEqual({ start: 0, end: 999 });
  // Unsatisfiable: starts at or after the end, or an empty suffix.
  expect(parseSingleRange('bytes=1000-', size)).toBe('unsatisfiable');
  expect(parseSingleRange('bytes=1500-1600', size)).toBe('unsatisfiable');
  expect(parseSingleRange('bytes=-0', size)).toBe('unsatisfiable');
  // Several ranges, missing or malformed headers: send the whole file.
  expect(parseSingleRange('bytes=0-99,200-299', size)).toBeNull();
  expect(parseSingleRange(undefined, size)).toBeNull();
  expect(parseSingleRange('items=0-10', size)).toBeNull();
  expect(parseSingleRange('bytes=abc-def', size)).toBeNull();
  expect(parseSingleRange('bytes=200-100', size)).toBeNull();
});
