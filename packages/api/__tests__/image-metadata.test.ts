// Tester screenshots and phone photos can carry where they were taken. The
// stripper must drop metadata segments and copy the picture data unchanged.
import { stripImageMetadata } from '../src/utils/image-metadata';

const segment = (marker: number, body: Buffer): Buffer => {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
};

function jpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0keep-jfif', 'latin1')),
    segment(0xe1, Buffer.from('Exif\0\0GPSLatitude 10.31', 'latin1')),
    segment(0xe2, Buffer.from('ICC_PROFILE keep-colour', 'latin1')),
    segment(0xed, Buffer.from('Photoshop IPTC location', 'latin1')),
    segment(0xfe, Buffer.from('comment: my house', 'latin1')),
    segment(0xdb, Buffer.from('quant-table', 'latin1')),
    segment(0xda, Buffer.from('scan-header', 'latin1')),
    Buffer.from('compressed-picture-bytes', 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function webp(): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 'latin1');
    header.writeUInt32LE(data.length, 4);
    return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x0c | 0x10; // EXIF + XMP + alpha flags
  const body = Buffer.concat([chunk('VP8X', vp8x), chunk('VP8L', Buffer.from('picture', 'latin1')),
    chunk('EXIF', Buffer.from('GPS 10.31 N', 'latin1')), chunk('XMP ', Buffer.from('<xmp>home</xmp>', 'latin1'))]);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

it('E52 - JPEG location, IPTC and comments are removed, colour and picture data kept', () => {
  const out = stripImageMetadata(jpeg(), 'image/jpeg');
  for (const gone of ['GPSLatitude', 'IPTC location', 'my house']) expect(out.includes(Buffer.from(gone))).toBe(false);
  for (const kept of ['keep-jfif', 'keep-colour', 'quant-table', 'compressed-picture-bytes']) {
    expect(out.includes(Buffer.from(kept))).toBe(true);
  }
  expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
});

it('E52 - WebP EXIF and XMP chunks are removed and the header flags and size are corrected', () => {
  const out = stripImageMetadata(webp(), 'image/webp');
  expect(out.includes(Buffer.from('GPS'))).toBe(false);
  expect(out.includes(Buffer.from('<xmp>'))).toBe(false);
  expect(out.includes(Buffer.from('picture'))).toBe(true);
  expect(out.readUInt32LE(4)).toBe(out.length - 8);
  expect(out[20]! & 0x0c).toBe(0); // VP8X flags byte: EXIF/XMP cleared
  expect(out[20]! & 0x10).toBe(0x10); // other flags untouched
});

it('E52 - a file whose structure cannot be read is refused instead of stored as is', () => {
  expect(() => stripImageMetadata(Buffer.from('not a jpeg'), 'image/jpeg')).toThrow(/could not be read/);
  const truncated = jpeg().subarray(0, 20);
  expect(() => stripImageMetadata(truncated, 'image/jpeg')).toThrow(/could not be read/);
  expect(() => stripImageMetadata(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toThrow(/could not be read/);
});
