// HA-M2-92 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 13): with keepOrientation (request and chat photos) the
// JPEG keeps only its EXIF orientation, here 6 (rotate 90 degrees), in a
// fresh 36-byte APP1, and the GPS IFD and every other EXIF field are gone.
// The default call (tester-feedback screenshots) still drops the whole APP1.
// Synthetic JPEG with a real big-endian TIFF/EXIF structure through the real
// stripper (utils/image-metadata.ts).
import { stripImageMetadata } from '../src/utils/image-metadata';
import { GPS_MARKER, syntheticJpeg } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function app1Segments(jpeg: Buffer): Buffer[] {
  const found: Buffer[] = [];
  let offset = 2;
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xff) {
    const marker = jpeg[offset + 1]!;
    if (marker === 0xda) break;
    const length = jpeg.readUInt16BE(offset + 2);
    if (marker === 0xe1) found.push(jpeg.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  return found;
}

it('HA-M2-92: keepOrientation removes the GPS IFD but keeps orientation 6, the default call drops the whole APP1', () => {
  const photo = syntheticJpeg({ orientation: 6 });
  expect(photo.includes(Buffer.from(GPS_MARKER))).toBe(true);

  const kept = stripImageMetadata(photo, 'image/jpeg', { keepOrientation: true });
  const segments = app1Segments(kept);
  expect(segments).toHaveLength(1);
  const app1 = segments[0]!;
  expect(app1.length).toBe(36);
  expect(app1.readUInt16BE(2)).toBe(34);
  expect(app1.toString('latin1', 4, 10)).toBe('Exif\0\0');
  // Big-endian TIFF, IFD0 at 8 with exactly one entry: Orientation SHORT = 6.
  const tiff = app1.subarray(10);
  expect(tiff.toString('latin1', 0, 2)).toBe('MM');
  expect(tiff.readUInt16BE(8)).toBe(1);
  expect(tiff.readUInt16BE(10)).toBe(0x0112);
  expect(tiff.readUInt16BE(12)).toBe(3);
  expect(tiff.readUInt16BE(18)).toBe(6);
  expect(tiff.readUInt32BE(22)).toBe(0);
  expect(kept.includes(Buffer.from(GPS_MARKER))).toBe(false);
  expect(kept.includes(Buffer.from([0x88, 0x25]))).toBe(false); // no GPS IFD pointer tag
  // The picture data is copied unchanged.
  expect(kept.subarray(-514)).toEqual(photo.subarray(-514));

  const dropped = stripImageMetadata(photo, 'image/jpeg');
  expect(app1Segments(dropped)).toHaveLength(0);
  expect(dropped.includes(Buffer.from('Exif'))).toBe(false);
  expect(dropped.includes(Buffer.from(GPS_MARKER))).toBe(false);
});
