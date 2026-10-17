// @vitest-environment node
// UX-1399 (Ken, 2026-10-14): the onService PH logo is the house. The admin
// browser tab icon was the old white "oS" on slate #1B3A4B (it borrowed the
// phone app's launcher icon). The admin now ships its own favicon set drawn
// from the brand masters (docs/design-system/brand/README.md): a #003D9B tile
// with the white lucide house. This test reads the real files that
// apps/admin/index.html links (UX-1374 proves the built page serves exactly
// these bytes) and checks their actual pixels and vector paths, so a slate
// "oS", an orange mark or a different glyph cannot pass.
import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { House } from 'lucide-react';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { fileURLToPath, URL } from 'node:url';

const brandDirectory = fileURLToPath(new URL('../assets/brand/', import.meta.url));

// The two path strings of the lucide 0.456.0 "house" icon, copied from the
// brand rulebook (docs/design-system/brand/README.md, "do not redraw").
const HOUSE_PATHS = [
  'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
  'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
];
const BLUE = [0, 61, 155] as const;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface Bitmap { width: number; height: number; channels: number; pixels: Buffer }

// A small decoder for 8-bit, non-interlaced RGB or RGBA PNGs (the only kinds
// in the favicon set). node:zlib only, no new dependency.
function decodePng(bytes: Buffer): Bitmap {
  expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      expect(chunk.readUInt8(8)).toBe(8);
      expect(chunk.readUInt8(12)).toBe(0);
      const colourType = chunk.readUInt8(9);
      channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
      if (!channels) throw new Error(`Unexpected PNG colour type ${colourType}`);
    } else if (type === 'IDAT') {
      data.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  expect(raw.length).toBe(height * (stride + 1));
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw.readUInt8(y * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels.readUInt8(y * stride + x - channels) : 0;
      const up = y > 0 ? pixels.readUInt8((y - 1) * stride + x) : 0;
      const upLeft = x >= channels && y > 0 ? pixels.readUInt8((y - 1) * stride + x - channels) : 0;
      let value = raw.readUInt8(y * (stride + 1) + 1 + x);
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        value += toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`Unexpected PNG filter ${filter}`);
      }
      pixels.writeUInt8(value & 0xff, y * stride + x);
    }
  }
  return { width, height, channels, pixels };
}

function pixel(bitmap: Bitmap, x: number, y: number): [number, number, number, number] {
  const start = (Math.floor(y) * bitmap.width + Math.floor(x)) * bitmap.channels;
  const channel = (index: number): number => bitmap.pixels.readUInt8(start + index);
  return [channel(0), channel(1), channel(2), bitmap.channels === 4 ? channel(3) : 255];
}

function isBlue([r, g, b, a]: readonly [number, number, number, number]): boolean {
  return a >= 235 && Math.abs(r - BLUE[0]) <= 12 && Math.abs(g - BLUE[1]) <= 12 && Math.abs(b - BLUE[2]) <= 12;
}

function isWhite([r, g, b, a]: readonly [number, number, number, number]): boolean {
  return a >= 235 && r >= 235 && g >= 235 && b >= 235;
}

// Every solid pixel must be brand blue, white, or an edge blend of the two.
// Slate #1B3A4B (27, 58, 75) and orange #FE8A00 are both far off that line.
function offBrandPixels(bitmap: Bitmap): number {
  let count = 0;
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const [r, g, b, a] = pixel(bitmap, x, y);
      if (a < 200) continue;
      const share = r / 255;
      if (Math.abs(g - (BLUE[1] + (255 - BLUE[1]) * share)) > 20 ||
          Math.abs(b - (BLUE[2] + (255 - BLUE[2]) * share)) > 20) count += 1;
    }
  }
  return count;
}

// Samples on the lucide 24-unit grid, mapped into the icon through the
// house box (box edge in px, centred). Wall and door-post strokes are white;
// the space inside the house and inside the door is the blue tile showing
// through. A letter mark like "oS" fails these.
function expectHouse(bitmap: Bitmap, boxShare: number): void {
  const box = bitmap.width * boxShare;
  const origin = (bitmap.width - box) / 2;
  const at = (x: number, y: number): [number, number, number, number] =>
    pixel(bitmap, origin + (x * box) / 24, origin + (y * box) / 24);
  expect(isWhite(at(3, 15))).toBe(true); // left wall
  expect(isWhite(at(21, 15))).toBe(true); // right wall
  expect(isWhite(at(9, 17))).toBe(true); // left door post
  expect(isBlue(at(6, 15))).toBe(true); // inside the house, left of the door
  expect(isBlue(at(12, 17))).toBe(true); // inside the door
  expect(isBlue(pixel(bitmap, bitmap.width / 2, 0))).toBe(true); // tile above the roof
  expect(offBrandPixels(bitmap)).toBe(0);
}

it('Bug UX-1399 — the admin browser icons are the white house on the brand blue tile, not the slate "oS"', async () => {
  // The literal brand paths are exactly what the installed lucide House draws.
  const lucide = new JSDOM(renderToStaticMarkup(createElement(House)), { contentType: 'image/svg+xml' });
  expect(Array.from(lucide.window.document.querySelectorAll('path')).map((path) => path.getAttribute('d'))).toEqual(HOUSE_PATHS);
  lucide.window.close();

  // favicon.svg (Chrome, Edge, Firefox): blue tile, white lucide house, no other colours.
  const svg = new JSDOM(await fs.readFile(`${brandDirectory}favicon.svg`, 'utf8'), { contentType: 'image/svg+xml' });
  const document = svg.window.document;
  expect(document.documentElement.getAttribute('viewBox')).toBe('0 0 48 48');
  expect(document.querySelector('rect')?.getAttribute('fill')).toBe('#003D9B');
  const glyph = document.querySelector('g');
  expect(glyph?.getAttribute('stroke')).toBe('#FFFFFF');
  expect(glyph?.getAttribute('stroke-width')).toBe('2');
  expect(glyph?.getAttribute('fill')).toBe('none');
  expect(Array.from(document.querySelectorAll('path')).map((path) => path.getAttribute('d'))).toEqual(HOUSE_PATHS);
  const paints = new Set(Array.from(document.querySelectorAll('*')).flatMap((element) =>
    ['fill', 'stroke'].map((name) => element.getAttribute(name)).filter((value): value is string => value !== null)));
  expect([...paints].sort()).toEqual(['#003D9B', '#FFFFFF', 'none']);
  expect(document.documentElement.textContent?.trim().includes('oS')).toBe(false);
  svg.window.close();

  // favicon.ico (fallback): 16, 32 and 48 px PNG frames of the favicon cut
  // (house box 75% of the tile), with rounded transparent tile corners.
  const ico = await fs.readFile(`${brandDirectory}favicon.ico`);
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
  const sizes: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const entry = 6 + 16 * index;
    const size = ico.readUInt8(entry) || 256;
    const start = ico.readUInt32LE(entry + 12);
    const frame = decodePng(ico.subarray(start, start + ico.readUInt32LE(entry + 8)));
    expect([frame.width, frame.height, frame.channels]).toEqual([size, size, 4]);
    expect(pixel(frame, 0, 0)[3]).toBeLessThan(128);
    expectHouse(frame, 0.75);
    sizes.push(size);
  }
  expect(sizes).toEqual([16, 32, 48]);

  // apple-touch-icon.png (iOS home screen): 180 px, fully opaque, full-bleed
  // blue (iOS rounds the corners itself), house box 56% of the icon.
  const touch = decodePng(await fs.readFile(`${brandDirectory}apple-touch-icon.png`));
  expect([touch.width, touch.height, touch.channels]).toEqual([180, 180, 3]);
  const corners: Array<[number, number]> = [[0, 0], [179, 0], [0, 179], [179, 179]];
  for (const [x, y] of corners) expect(isBlue(pixel(touch, x, y))).toBe(true);
  expectHouse(touch, 0.56);
});
