/**
 * Shared reading helpers for the house-logo tests of the static pages nginx
 * serves from legal/ (feedback, privacy, terms). Ken, 2026-10-14: the onService
 * PH logo is the lucide house, drawn from the masters in
 * docs/design-system/brand/ (README.md there is the rulebook).
 *
 * The tests load the real page files, and these helpers read what is actually
 * in them: the inline SVG mark, the tab-icon links and the pixels of the PNG
 * tab icon. expectHouseTabIcons is the one shared assertion, because all three
 * pages carry the same two tab-icon links.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { JSDOM } from 'jsdom';

export const REPO_ROOT = path.resolve(__dirname, '../../../..');

export function readRepoFile(...parts: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
}

/** The real page file, parsed into a DOM. Scripts do not run: the logo is static markup. */
export function loadLegalPage(name: 'feedback.html' | 'privacy.html' | 'terms.html'): { dom: JSDOM; html: string } {
  const html = readRepoFile('legal', name);
  return { dom: new JSDOM(html), html };
}

export interface MarkGeometry {
  tile: { width: string | null; height: string | null; rx: string | null; fill: string | null };
  house: {
    transform: string | null; fill: string | null; stroke: string | null; strokeWidth: string | null;
    linecap: string | null; linejoin: string | null; paths: string[];
  };
}

/** Reads the tile and the house out of an <svg> element (a master file or a page copy). */
export function readMark(svg: Element): MarkGeometry {
  const rects = svg.querySelectorAll('rect');
  const groups = svg.querySelectorAll('g');
  if (rects.length !== 1 || groups.length !== 1) {
    throw new Error(`expected one tile <rect> and one house <g>, found ${rects.length} and ${groups.length}`);
  }
  const rect = rects[0]!;
  const g = groups[0]!;
  return {
    tile: {
      width: rect.getAttribute('width'),
      height: rect.getAttribute('height'),
      rx: rect.getAttribute('rx'),
      fill: rect.getAttribute('fill'),
    },
    house: {
      transform: g.getAttribute('transform'),
      fill: g.getAttribute('fill'),
      stroke: g.getAttribute('stroke'),
      strokeWidth: g.getAttribute('stroke-width'),
      linecap: g.getAttribute('stroke-linecap'),
      linejoin: g.getAttribute('stroke-linejoin'),
      paths: Array.from(g.querySelectorAll('path')).map(p => p.getAttribute('d') ?? ''),
    },
  };
}

function parseSvg(source: string): Element {
  const doc = new JSDOM(source, { contentType: 'image/svg+xml' }).window.document;
  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg') throw new Error(`not an SVG document: <${svg.tagName}>`);
  return svg;
}

/** A master from docs/design-system/brand/, e.g. 'onservice-mark-blue.svg'. */
export function readMaster(name: string): MarkGeometry {
  return readMark(parseSvg(readRepoFile('docs', 'design-system', 'brand', name)));
}

/** The house paths in the glyph master (no tile), the single source of the d strings. */
export function masterHousePaths(): string[] {
  const svg = parseSvg(readRepoFile('docs', 'design-system', 'brand', 'onservice-house-glyph.svg'));
  return Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d') ?? '');
}

export interface TabIcons {
  svg: MarkGeometry | null;
  svgLink: HTMLLinkElement | null;
  png: Buffer | null;
  pngLink: HTMLLinkElement | null;
  hrefs: string[];
}

/** Every <link rel="icon"> in the page, with the inline SVG and PNG decoded. */
export function readTabIcons(doc: Document): TabIcons {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('head link[rel~="icon"]'));
  const result: TabIcons = { svg: null, svgLink: null, png: null, pngLink: null, hrefs: links.map(l => l.getAttribute('href') ?? '') };
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('data:image/svg+xml,')) {
      result.svgLink = link;
      result.svg = readMark(parseSvg(decodeURIComponent(href.slice('data:image/svg+xml,'.length))));
    } else if (href.startsWith('data:image/png;base64,')) {
      result.pngLink = link;
      result.png = Buffer.from(href.slice('data:image/png;base64,'.length), 'base64');
    }
  }
  return result;
}

export interface Rgba { width: number; height: number; at(x: number, y: number): [number, number, number, number] }

/** Minimal PNG reader (8-bit RGB or RGBA, not interlaced), so no image package is needed. */
export function decodePng(png: Buffer): Rgba {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!png.subarray(0, 8).equals(signature)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colourType = data[9];
      const interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (colourType !== 6 && colourType !== 2)) {
        throw new Error(`unsupported PNG: depth ${depth}, colour type ${colourType}, interlace ${interlace}`);
      }
      channels = colourType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? pixels[y * stride + i - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i]! : 0;
      const upLeft = y > 0 && i >= channels ? pixels[(y - 1) * stride + i - channels]! : 0;
      let predictor: number;
      switch (filter) {
        case 0: predictor = 0; break;
        case 1: predictor = left; break;
        case 2: predictor = up; break;
        case 3: predictor = Math.floor((left + up) / 2); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          break;
        }
        default: throw new Error(`bad PNG filter ${filter} on row ${y}`);
      }
      pixels[y * stride + i] = (line[i]! + predictor) & 0xff;
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const i = y * stride + x * channels;
      return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, channels === 4 ? pixels[i + 3]! : 255];
    },
  };
}

const BRAND_BLUE: [number, number, number, number] = [0, 61, 155, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];

function pixelNear(actual: [number, number, number, number], expected: [number, number, number, number]): boolean {
  return actual.every((channel, i) => Math.abs(channel - expected[i]!) <= 8);
}

/**
 * The page's tab icon is the house favicon cut (README "Geometry"): a #003D9B
 * 48-unit tile, radius 6, the lucide box scaled 1.5 at (6, 6), white stroke 2.
 * Both links are inline data, so the page never falls back to the app's
 * long-cached /favicon.ico (today the old "oS" art).
 */
export function expectHouseTabIcons(doc: Document): void {
  const icons = readTabIcons(doc);
  expect(icons.hrefs).toHaveLength(2);
  expect(icons.hrefs.filter(href => !href.startsWith('data:'))).toEqual([]);

  expect(icons.svgLink?.getAttribute('type')).toBe('image/svg+xml');
  expect(icons.svg).toEqual({
    tile: { width: '48', height: '48', rx: '6', fill: '#003D9B' },
    house: {
      transform: 'translate(6 6) scale(1.5)', fill: 'none', stroke: '#FFFFFF', strokeWidth: '2',
      linecap: 'round', linejoin: 'round', paths: masterHousePaths(),
    },
  });

  // Browsers without SVG tab icons use the PNG. It is a copy of the phone web
  // app's favicon, byte for byte, so a redraw of apps/mobile/assets/favicon.png
  // fails here until the copy in the page is regenerated too (README "Raster
  // assets"). The pixel checks below then say what the picture must show.
  expect(icons.pngLink?.getAttribute('type')).toBe('image/png');
  expect(icons.pngLink?.getAttribute('sizes')).toBe('48x48');
  const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  expect(sha256(icons.png!)).toBe(sha256(readFileSync(path.join(REPO_ROOT, 'apps', 'mobile', 'assets', 'favicon.png'))));
  const png = decodePng(icons.png!);
  expect([png.width, png.height]).toEqual([48, 48]);
  const at = (x: number, y: number) => png.at(x, y);
  expect(at(0, 0)[3]).toBe(0); // rounded corner, transparent
  const checks: Array<[string, [number, number], [number, number, number, number]]> = [
    ['tile, top edge', [24, 2], BRAND_BLUE],
    ['roof peak', [24, 8], WHITE],
    ['under the roof', [24, 18], BRAND_BLUE],
    ['left wall', [10, 28], WHITE],
    ['right wall', [37, 28], WHITE],
    ['inside the door', [24, 31], BRAND_BLUE],
    ['floor', [16, 37], WHITE],
    ['tile, bottom edge', [24, 45], BRAND_BLUE],
  ];
  const wrong = checks
    .filter(([, [x, y], colour]) => !pixelNear(at(x, y), colour))
    .map(([name, [x, y]]) => `${name} (${x},${y}) is ${at(x, y).join(',')}`);
  expect(wrong).toEqual([]);
}
