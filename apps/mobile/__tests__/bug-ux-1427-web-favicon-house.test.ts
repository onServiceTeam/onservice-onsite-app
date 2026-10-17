// Bug UX-1427: the web app's browser-tab icon (app.onservice.ph) came from
// web.favicon = ./assets/icon.png, the slate "oS" square. A 1024 px launcher
// icon is also the wrong source for a 16 px tab icon: Expo shrank it to 48 px
// and then to 32 and 16 px for favicon.ico.
//
// Now the tab icon is apps/mobile/public/favicon.ico: the favicon cut of the
// logo from docs/design-system/brand/README.md, a brand-blue rounded tile with
// a white house at 75% of the tile, drawn separately at 16, 32 and 48 px so
// the house stays sharp at 16 px (the same file as the admin app's
// favicon.ico). Its 48 px frame is assets/favicon.png, byte for byte. Expo
// copies public/favicon.ico into the web build as is. How the page links it
// is Bug UX-1429.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  HOUSE_OPEN_POINTS,
  HOUSE_STROKE_POINTS,
  colourDistance,
  decodePng,
  forEachPixel,
  housePoint,
  pixelAt,
  readMobileAsset,
  type DecodedPng,
} from '../test-support/png';

const BRAND_BLUE = '#003D9B';
const MOBILE_ROOT = path.resolve(__dirname, '..');

/** The frames of an ICO file whose images are stored as PNG. */
function icoPngFrames(bytes: Buffer): Array<{ width: number; png: Buffer }> {
  expect(bytes.readUInt16LE(0)).toBe(0);
  expect(bytes.readUInt16LE(2)).toBe(1); // 1 = icon
  const count = bytes.readUInt16LE(4);
  const frames: Array<{ width: number; png: Buffer }> = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + 16 * i;
    const size = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    frames.push({ width: bytes[entry] || 256, png: bytes.subarray(offset, offset + size) });
  }
  return frames;
}

/** Blue tile with rounded corners and a white house. */
function expectHouseTile(image: DecodedPng): void {
  const size = image.width;
  const last = size - 1;
  const middle = size / 2;
  expect(image.height).toBe(size);
  // Rounded corners: the corner pixel is mostly or fully transparent (at 16 px
  // the 2 px corner radius still covers a third of it).
  expect(pixelAt(image, 0, 0)[3]).toBeLessThan(128);
  expect(pixelAt(image, last, last)[3]).toBeLessThan(128);
  expect(colourDistance(pixelAt(image, middle, 1), BRAND_BLUE)).toBe(0);
  expect(colourDistance(pixelAt(image, 1, middle), BRAND_BLUE)).toBe(0);

  // White house strokes with blue showing through the door and the room.
  const houseBox = size * 0.75;
  for (const point of Object.values(HOUSE_STROKE_POINTS)) {
    const [x, y] = housePoint(houseBox, middle, middle, point);
    expect(pixelAt(image, x, y)).toEqual([255, 255, 255, 255]);
  }
  for (const point of Object.values(HOUSE_OPEN_POINTS)) {
    const [x, y] = housePoint(houseBox, middle, middle, point);
    expect(colourDistance(pixelAt(image, x, y), BRAND_BLUE)).toBe(0);
  }

  // Only blue, white and their blends: no slate, no orange.
  let offBrand = 0;
  forEachPixel(image, (rgba) => {
    if (rgba[3] === 0) return;
    const share = (255 - rgba[2]) / (255 - 155); // 0 = white, 1 = brand blue, along the blue channel
    const expected = [255 * (1 - share), 255 - 194 * share, 255 - 100 * share];
    const error = Math.hypot(rgba[0] - expected[0]!, rgba[1] - expected[1]!, rgba[2] - expected[2]!);
    if (error > 24) offBrand++;
  });
  expect(offBrand).toBe(0);
}

it('Bug UX-1427 — the web tab icon is the blue house tile at 16, 32 and 48 px, not the slate "oS" launcher icon', () => {
  const ico = readFileSync(path.join(MOBILE_ROOT, 'public', 'favicon.ico'));
  const frames = icoPngFrames(ico);
  expect(frames.map((frame) => frame.width)).toEqual([16, 32, 48]);

  for (const frame of frames) {
    const image = decodePng(frame.png);
    expect(image.width).toBe(frame.width);
    expectHouseTile(image);
  }

  // The 48 px frame is the favicon cut the legal pages also embed.
  const favicon = readMobileAsset('assets/favicon.png');
  expect([favicon.width, favicon.height]).toEqual([48, 48]);
  expect(frames[2]!.png.equals(favicon.bytes)).toBe(true);

  // One tab icon everywhere: the admin app's favicon.ico is the same file.
  const adminIco = readFileSync(path.resolve(MOBILE_ROOT, '..', 'admin', 'src', 'assets', 'brand', 'favicon.ico'));
  expect(ico.equals(adminIco)).toBe(true);
});
