// Removes hidden metadata (EXIF, including GPS location, XMP, IPTC, comments
// and text chunks) from JPEG, PNG and WebP files before they are stored.
// Tester screenshots and phone photos can carry the place they were taken.
// Only container segments are dropped; the picture data is copied unchanged.
// A file whose structure cannot be walked is refused rather than stored as is.

import { createAppError } from '../middleware/error.middleware';

function malformed(): never {
  throw createAppError('This image file could not be read. Please try a different screenshot.', 400);
}

// JPEG markers that only carry metadata: APP1 (EXIF/XMP), APP12, APP13
// (IPTC/Photoshop) and COM. APP0 (JFIF), APP2 (colour profile) and APP14
// (Adobe colour transform) change how the picture looks, so they stay.
const JPEG_DROP = new Set([0xe1, 0xec, 0xed, 0xfe]);

function stripJpeg(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) malformed();
  const parts: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;
  while (offset < input.length) {
    if (input[offset] !== 0xff) malformed();
    let marker = input[offset + 1];
    // Fill bytes between segments.
    while (marker === 0xff && offset + 2 < input.length) { offset += 1; marker = input[offset + 1]; }
    if (marker === undefined) malformed();
    if (marker === 0xd9) { parts.push(input.subarray(offset, offset + 2)); return Buffer.concat(parts); }
    // Markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > input.length) malformed();
    const length = input.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > input.length) malformed();
    const segmentEnd = offset + 2 + length;
    if (marker === 0xda) {
      // Start of scan: everything from here is picture data (plus any later
      // markers inside it), copied unchanged.
      parts.push(input.subarray(offset));
      return Buffer.concat(parts);
    }
    if (!JPEG_DROP.has(marker)) parts.push(input.subarray(offset, segmentEnd));
    offset = segmentEnd;
  }
  malformed();
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(input: Buffer): Buffer {
  if (input.length < 8 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) malformed();
  const parts: Buffer[] = [PNG_SIGNATURE];
  let offset = 8;
  let sawEnd = false;
  while (offset < input.length) {
    if (offset + 12 > input.length) malformed();
    const length = input.readUInt32BE(offset);
    const type = input.toString('latin1', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > input.length) malformed();
    if (!PNG_DROP.has(type)) parts.push(input.subarray(offset, end));
    offset = end;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (!sawEnd) malformed();
  return Buffer.concat(parts);
}

function stripWebp(input: Buffer): Buffer {
  if (input.length < 12 || input.toString('latin1', 0, 4) !== 'RIFF' || input.toString('latin1', 8, 12) !== 'WEBP') malformed();
  const riffEnd = 8 + input.readUInt32LE(4);
  if (riffEnd > input.length) malformed();
  const chunks: Buffer[] = [];
  let offset = 12;
  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) malformed();
    const type = input.toString('latin1', offset, offset + 4);
    const size = input.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > riffEnd) malformed();
    if (type === 'EXIF' || type === 'XMP ') { offset = end; continue; }
    let chunk = input.subarray(offset, end);
    if (type === 'VP8X' && size >= 1) {
      // Clear the "has EXIF" (0x08) and "has XMP" (0x04) flags.
      chunk = Buffer.from(chunk);
      chunk[8] = chunk[8]! & ~0x0c;
    }
    chunks.push(chunk);
    offset = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

export function stripImageMetadata(input: Buffer, mime: string): Buffer {
  if (mime === 'image/jpeg') return stripJpeg(input);
  if (mime === 'image/png') return stripPng(input);
  if (mime === 'image/webp') return stripWebp(input);
  malformed();
}
