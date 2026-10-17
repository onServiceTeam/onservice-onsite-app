// Bug UX-1452 (Ken's house-logo decision, 2026-10-14): the public Terms of
// Service page (legal/terms.html, app.onservice.ph/terms) had no logo at all,
// and with no tab icon of its own the browser tab showed the app's old "oS"
// favicon. It now shows the house logo above the heading: on a white page, the
// #003D9B tile with the white house (docs/design-system/brand/onservice-mark-blue.svg),
// plus inline house tab icons.
// Only a logo image was added, no text: the job's rule for legal pages is that
// the wording stays as it is. So the tile stands alone, with no "onService PH"
// wordmark beside it (the unchanged line under the heading already names us).
//
// The real page file is parsed into a DOM; nothing is mocked.
import {
  expectHouseTabIcons, loadLegalPage, masterHousePaths, readMark, readMaster,
} from './helpers/house-logo-dom';

it('Bug UX-1452 — the Terms of Service page shows the house logo above its heading and its tab icon is the house, not the old oS favicon', () => {
  const { dom } = loadLegalPage('terms.html');
  const doc = dom.window.document;
  const header = doc.querySelector('.wrap > header')!;
  expect(header).not.toBeNull();

  // The logo is the first thing in the header, directly above the unchanged heading.
  const brand = header.firstElementChild!;
  expect(brand.className).toBe('brand');
  expect(brand.getAttribute('role')).toBe('img');
  expect(brand.getAttribute('aria-label')).toBe('onService PH');
  expect(brand.nextElementSibling?.tagName).toBe('H1');
  expect(brand.nextElementSibling?.textContent).toBe('Terms of Service');

  // The tile is the blue master, drawn exactly: same tile, same house, same paths.
  const tile = brand.querySelector('svg.brand-tile')!;
  expect(tile.getAttribute('aria-hidden')).toBe('true');
  expect(tile.getAttribute('viewBox')).toBe('0 0 48 48');
  const mark = readMark(tile);
  expect(mark).toEqual(readMaster('onservice-mark-blue.svg'));
  expect(mark.tile.fill).toBe('#003D9B');
  expect(mark.house.stroke).toBe('#FFFFFF');
  expect(mark.house.paths).toEqual(masterHousePaths());

  // The logo is an image only: the tile is its one child and it adds no words
  // to the page. The visible header text is the unchanged heading, date line
  // and links, and the name still shows in the date line under the heading.
  expect(Array.from(brand.children).map(el => el.tagName.toLowerCase())).toEqual(['svg']);
  expect(brand.textContent).toBe('');
  expect(doc.querySelector('.brand-word')).toBeNull();
  expect(header.textContent!.replace(/\s+/g, ' ').trim()).toBe(
    'Terms of Service onService PH · Last updated: June 5, 2026 Privacy Policy · support@onservice.ph',
  );
  expect(Array.from(doc.querySelectorAll('body *')).filter(el => el.textContent?.trim() === 'oS')).toEqual([]);

  expectHouseTabIcons(doc);
});
