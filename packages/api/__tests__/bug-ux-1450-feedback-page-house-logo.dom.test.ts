// Bug UX-1450 (Ken's house-logo decision, 2026-10-14): the tester feedback
// page (legal/feedback.html, app.onservice.ph/feedback) showed the old brand: a
// two-tone text mark, "on" in white plus "Service" in teal #5eead4, on a navy
// bar, with no tab icon of its own, so the browser tab showed the app's old
// "oS" favicon. The logo is now the house: on brand blue, a white tile with the
// #003D9B house (docs/design-system/brand/onservice-mark-white.svg) next to
// "onService PH" in one colour, plus inline house tab icons.
//
// The real page file is parsed into a DOM; nothing is mocked.
import {
  expectHouseTabIcons, loadLegalPage, masterHousePaths, readMark, readMaster,
} from './helpers/house-logo-dom';

it('Bug UX-1450 — the feedback page header shows the house logo and "onService PH" in one colour, and its tab icon is the house, not the teal two-tone text or the oS', () => {
  const { dom, html } = loadLegalPage('feedback.html');
  const doc = dom.window.document;
  const header = doc.querySelector('header.top')!;
  expect(header).not.toBeNull();

  // The bar is brand blue, so the white-tile version of the mark is the right one.
  expect(dom.window.getComputedStyle(header).backgroundColor).toBe('rgb(0, 61, 155)');
  const brand = header.querySelector('.brand')!;
  expect(brand.getAttribute('role')).toBe('img');
  expect(brand.getAttribute('aria-label')).toBe('onService PH');

  // The tile is the white master, drawn exactly: same tile, same house, same paths.
  const tile = brand.querySelector('svg.brand-tile')!;
  expect(tile.getAttribute('aria-hidden')).toBe('true');
  expect(tile.getAttribute('viewBox')).toBe('0 0 48 48');
  const mark = readMark(tile);
  expect(mark).toEqual(readMaster('onservice-mark-white.svg'));
  expect(mark.tile.fill).toBe('#FFFFFF');
  expect(mark.house.stroke).toBe('#003D9B');
  expect(mark.house.paths).toEqual(masterHousePaths());

  // The wordmark is one piece of text in one colour: no <b>, no teal "Service".
  const word = brand.querySelector('.brand-word')!;
  expect(word.textContent).toBe('onService PH');
  expect(word.children).toHaveLength(0);
  expect(dom.window.getComputedStyle(word).color).toBe('rgb(255, 255, 255)');
  expect(brand.textContent).toBe('onService PH');

  // The old mark is gone.
  expect(doc.querySelector('.mark')).toBeNull();
  expect(header.querySelector('b')).toBeNull();
  expect(html).not.toMatch(/#5eead4/i);
  expect(Array.from(doc.querySelectorAll('body *')).filter(el => el.textContent?.trim() === 'oS')).toEqual([]);

  expectHouseTabIcons(doc);
});
