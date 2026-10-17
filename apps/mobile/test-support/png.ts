// Minimal PNG reader for the brand-asset tests: 8-bit RGB (colour type 2) or
// RGBA (colour type 6), not interlaced, all five row filters. That covers the
// files rendered for the house logo (Playwright Chromium screenshots). Uses
// node:zlib only, so the tests need no image package.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

export interface DecodedPng {
  width: number;
  height: number;
  colorType: number;
  /** RGBA, 4 bytes per pixel, row by row. Alpha is 255 for RGB files. */
  pixels: Uint8Array;
  bytes: Buffer;
}

export type Rgba = [number, number, number, number];

const MOBILE_ROOT = path.resolve(__dirname, '..');

export function readMobileAsset(relativePath: string): DecodedPng {
  return decodePng(readFileSync(path.resolve(MOBILE_ROOT, relativePath)));
}

export function decodePng(bytes: Buffer): DecodedPng {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG file');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG: bit depth ${bitDepth}, colour type ${colorType}, interlace ${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw.readUInt8(y * (stride + 1));
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels]! : 0;
      const up = previous[x]!;
      const upLeft = x >= channels ? previous[x - channels]! : 0;
      let value = line[x]!;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        value += toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      }
      line[x] = value & 255;
    }
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      pixels[target] = line[x * channels]!;
      pixels[target + 1] = line[x * channels + 1]!;
      pixels[target + 2] = line[x * channels + 2]!;
      pixels[target + 3] = channels === 4 ? line[x * channels + 3]! : 255;
    }
    previous = line;
  }
  return { width, height, colorType, pixels, bytes };
}

export function pixelAt(image: DecodedPng, x: number, y: number): Rgba {
  const index = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  const { pixels } = image;
  return [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!];
}

export function forEachPixel(image: DecodedPng, visit: (rgba: Rgba, x: number, y: number) => void): void {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) visit(pixelAt(image, x, y), x, y);
  }
}

export function colourDistance(rgba: Rgba, hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return Math.hypot(rgba[0] - ((value >> 16) & 255), rgba[1] - ((value >> 8) & 255), rgba[2] - (value & 255));
}

// Landmarks of the lucide house, in its own 24-unit box. The first group lies
// on the house's strokes; the second group is open space inside the house.
// Together they tell the house apart from the old "oS" letters.
export const HOUSE_STROKE_POINTS = {
  leftWall: [3, 15],
  rightWall: [21, 15],
  leftDoorPost: [9, 17],
  rightDoorPost: [15, 17],
  floor: [12, 21],
} as const;
export const HOUSE_OPEN_POINTS = {
  insideDoor: [12, 17],
  insideRoom: [12, 8.5],
} as const;

/** Pixel position of lucide point (u, v) when the 24-unit house box is `box` px wide, centred on (cx, cy). */
export function housePoint(box: number, cx: number, cy: number, point: readonly [number, number]): [number, number] {
  return [cx - box / 2 + (point[0] * box) / 24, cy - box / 2 + (point[1] * box) / 24];
}

/** Farthest non-transparent pixel from the image centre, in px. */
export function farthestInkRadius(image: DecodedPng): number {
  let farthest = 0;
  forEachPixel(image, (rgba, x, y) => {
    if (rgba[3] > 0) farthest = Math.max(farthest, Math.hypot(x + 0.5 - image.width / 2, y + 0.5 - image.height / 2));
  });
  return farthest;
}
