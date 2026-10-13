// HA-M2 (D38 Milestone 2, package P3) helper: synthetic ISO base media files
// (MP4, MOV, 3GP, M4A) for the job-media box walker. Every box is built from
// its real byte layout (ISO/IEC 14496-12 and the QuickTime file format), so
// the tests exercise utils/isobmff.ts on the same structures a phone writes:
// ftyp first, mdat before moov (moov at the end, as iPhones and Android
// phones record), mvhd v0/v1, tkhd with a rotation matrix, mdia/hdlr,
// stbl/stsd/stco, udta location boxes and both meta shapes with mdta keys.

export const XMP_UUID_HEX = 'be7acfcb97a942e89c71999491e3afac';

function fourcc(type: string): Buffer {
  const out = Buffer.from(type, 'latin1');
  if (out.length !== 4) throw new Error(`box type must be 4 bytes: ${type}`);
  return out;
}

/** A box with a 32-bit size header. */
export function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  fourcc(type).copy(header, 4);
  return Buffer.concat([header, body]);
}

/** A box with size field 1 and a 64-bit largesize. */
export function largeBox(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const header = Buffer.alloc(16);
  header.writeUInt32BE(1, 0);
  fourcc(type).copy(header, 4);
  header.writeBigUInt64BE(BigInt(16 + body.length), 8);
  return Buffer.concat([header, body]);
}

/** A full box: version (1 byte) and flags (3 bytes) before the payload. */
export function fullBox(type: string, version: number, flags: number, ...payload: Buffer[]): Buffer {
  const vf = Buffer.alloc(4);
  vf.writeUInt32BE(((version & 0xff) << 24) | (flags & 0xffffff), 0);
  return box(type, vf, ...payload);
}

export function ftyp(major = 'isom', compatible: string[] = ['isom', 'mp42']): Buffer {
  const minor = Buffer.alloc(4);
  return box('ftyp', fourcc(major), minor, ...compatible.map(fourcc));
}

export function mvhd(options: { version?: 0 | 1; timescale: number; duration: number | bigint }): Buffer {
  if (options.version === 1) {
    const body = Buffer.alloc(108 - 4 + 12);
    // creation(8) modification(8) timescale(4) duration(8), then the rest zeroed.
    body.writeUInt32BE(options.timescale, 16);
    body.writeBigUInt64BE(BigInt(options.duration), 20);
    return fullBox('mvhd', 1, 0, body);
  }
  const body = Buffer.alloc(96);
  // creation(4) modification(4) timescale(4) duration(4)
  body.writeUInt32BE(options.timescale, 8);
  body.writeUInt32BE(Number(options.duration), 12);
  return fullBox('mvhd', 0, 0, body);
}

/** tkhd v0 with a display size and an optional 90-degree rotation matrix. */
export function tkhd(options: { width?: number; height?: number; rotate90?: boolean } = {}): Buffer {
  const body = Buffer.alloc(80);
  // After version/flags: creation(4) modification(4) track_ID(4) reserved(4)
  // duration(4) reserved(8) layer(2) alt group(2) volume(2) reserved(2)
  // matrix(36) width(4) height(4) => matrix at 36, width at 72 in `body`.
  body.writeUInt32BE(1, 8);
  const matrix = options.rotate90
    ? [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000]
    : [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
  matrix.forEach((value, index) => body.writeInt32BE(value, 36 + index * 4));
  body.writeUInt32BE((options.width ?? 0) * 0x10000, 72);
  body.writeUInt32BE((options.height ?? 0) * 0x10000, 76);
  return fullBox('tkhd', 0, 3, body);
}

/** hdlr: pre_defined/component type, handler type, reserved, empty name. */
export function hdlr(handler: string, componentType = '\0\0\0\0'): Buffer {
  return fullBox('hdlr', 0, 0, fourcc(componentType), fourcc(handler), Buffer.alloc(12), Buffer.from([0]));
}

/** stsd with one sample entry of the given format. */
export function stsd(codec: string): Buffer {
  const count = Buffer.alloc(4);
  count.writeUInt32BE(1, 0);
  const entry = box(codec, Buffer.alloc(8));
  return fullBox('stsd', 0, 0, count, entry);
}

export function stco(offsets: number[]): Buffer {
  const body = Buffer.alloc(4 + offsets.length * 4);
  body.writeUInt32BE(offsets.length, 0);
  offsets.forEach((offset, index) => body.writeUInt32BE(offset, 4 + index * 4));
  return fullBox('stco', 0, 0, body);
}

export interface TrackOptions {
  handler: 'vide' | 'soun' | 'meta';
  codec: string;
  width?: number;
  height?: number;
  rotate90?: boolean;
  chunkOffsets?: number[];
  /** Extra boxes appended inside the trak (udta, meta). */
  extra?: Buffer[];
}

export function trak(options: TrackOptions): Buffer {
  const stbl = box('stbl', stsd(options.codec), stco(options.chunkOffsets ?? []));
  const minf = box('minf', stbl);
  const mdia = box('mdia', hdlr(options.handler, 'mhlr'), minf);
  return box('trak', tkhd(options), mdia, ...(options.extra ?? []));
}

/** QuickTime (c)xyz user-data location: [u16 length][u16 language][ISO 6709 text]. */
export function copyrightXyz(iso6709 = '+10.3157+123.8854/'): Buffer {
  const text = Buffer.from(iso6709, 'latin1');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt16BE(text.length, 0);
  prefix.writeUInt16BE(0x15c7, 2);
  return box('©xyz', prefix, text);
}

/** 3GPP loci: version/flags, language, name, role, longitude, latitude, altitude, body, notes. */
export function loci(name = 'Synthetic house'): Buffer {
  return fullBox('loci', 0, 0, Buffer.from([0x15, 0xc7]), Buffer.from(`${name}\0`, 'utf8'),
    Buffer.from([0]), Buffer.alloc(12, 0x41), Buffer.from('Earth\0', 'latin1'), Buffer.from('home notes\0', 'latin1'));
}

export function xmpBox(text = '<x:xmpmeta>exif:GPSLatitude 10.3157</x:xmpmeta>'): Buffer {
  return box('XMP_', Buffer.from(text, 'utf8'));
}

export function xmpUuid(text = '<x:xmpmeta>exif:GPSLatitude 10.3157</x:xmpmeta>'): Buffer {
  return box('uuid', Buffer.from(XMP_UUID_HEX, 'hex'), Buffer.from(text, 'utf8'));
}

/** keys: mdta key names (1-based indexes in ilst). */
export function keys(names: string[]): Buffer {
  const count = Buffer.alloc(4);
  count.writeUInt32BE(names.length, 0);
  const entries = names.map(name => {
    const value = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + value.length, 0);
    head.write('mdta', 4, 'latin1');
    return Buffer.concat([head, value]);
  });
  return fullBox('keys', 0, 0, count, ...entries);
}

/** One ilst item: type = 1-based key index, holding one UTF-8 data box. */
export function mdtaItem(keyIndex: number, value: string): Buffer {
  const typeAndLocale = Buffer.alloc(8);
  typeAndLocale.writeUInt32BE(1, 0); // well-known type 1 = UTF-8
  const data = box('data', typeAndLocale, Buffer.from(value, 'utf8'));
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + data.length, 0);
  header.writeUInt32BE(keyIndex, 4);
  return Buffer.concat([header, data]);
}

/** An mdta meta box (iPhone style). `shape` picks QuickTime (no version) or ISO full box. */
export function mdtaMeta(entries: Array<[string, string]>, shape: 'quicktime' | 'iso' = 'quicktime'): Buffer {
  const children = [
    hdlr('mdta'),
    keys(entries.map(([name]) => name)),
    box('ilst', ...entries.map(([, value], index) => mdtaItem(index + 1, value))),
  ];
  return shape === 'iso' ? fullBox('meta', 0, 0, ...children) : box('meta', ...children);
}

export const IPHONE_LOCATION = '+10.3157+123.8854+012.345/';
export const IPHONE_MAKE = 'Apple';
export const IPHONE_MODEL = 'iPhone 15 Pro';

/** The metadata entries an iPhone writes into moov/meta (keys + ilst). */
export function iphoneMetadataEntries(): Array<[string, string]> {
  return [
    ['com.apple.quicktime.make', IPHONE_MAKE],
    ['com.apple.quicktime.model', IPHONE_MODEL],
    ['com.apple.quicktime.software', '17.6.1'],
    ['com.apple.quicktime.location.ISO6709', IPHONE_LOCATION],
    ['com.apple.quicktime.location.accuracy.horizontal', '4.766546'],
    ['com.apple.quicktime.creationdate', '2026-10-13T09:41:00+0800'],
  ];
}

export interface Mp4Options {
  brand?: string;
  /** mvhd duration in milliseconds at timescale 1000 (ignored when `timescale`/`rawDuration` given). */
  durationMs?: number;
  timescale?: number;
  rawDuration?: number | bigint;
  mvhdVersion?: 0 | 1;
  tracks?: Array<Omit<TrackOptions, 'chunkOffsets'>>;
  /** Boxes appended inside moov after the tracks (udta, meta). */
  moovExtra?: Buffer[];
  /** Top level boxes between ftyp and mdat. */
  topLevelExtra?: Buffer[];
  mdatBytes?: Buffer;
  /** Write mdat with a 64-bit largesize header. */
  largeMdat?: boolean;
}

/**
 * ftyp, [extra], mdat, moov (moov last). Each track's stco points at the
 * start of the mdat payload, so a test can check the offsets survive.
 */
export function buildMp4(options: Mp4Options = {}): Buffer {
  const head = Buffer.concat([ftyp(options.brand ?? 'isom'), ...(options.topLevelExtra ?? [])]);
  const mdatPayload = options.mdatBytes ?? Buffer.from('synthetic-media-sample-bytes-'.repeat(8), 'latin1');
  const mdat = options.largeMdat ? largeBox('mdat', mdatPayload) : box('mdat', mdatPayload);
  const sampleOffset = head.length + (options.largeMdat ? 16 : 8);
  const tracks = options.tracks ?? [{ handler: 'vide', codec: 'avc1', width: 1280, height: 720 }];
  const timescale = options.timescale ?? 1000;
  const duration = options.rawDuration ?? options.durationMs ?? 10_000;
  const moov = box('moov',
    mvhd({ version: options.mvhdVersion ?? 0, timescale, duration }),
    ...tracks.map(track => trak({ ...track, chunkOffsets: [sampleOffset] })),
    ...(options.moovExtra ?? []));
  return Buffer.concat([head, mdat, moov]);
}

/** A synthetic iPhone-style .mov: qt brand, HEVC video + AAC sound, location in udta and in mdta meta. */
export function buildIphoneMov(options: { durationMs?: number; metaShape?: 'quicktime' | 'iso' } = {}): Buffer {
  return buildMp4({
    brand: 'qt  ',
    durationMs: options.durationMs ?? 12_000,
    tracks: [
      { handler: 'vide', codec: 'hvc1', width: 1920, height: 1080, rotate90: true },
      { handler: 'soun', codec: 'mp4a' },
    ],
    topLevelExtra: [box('wide')],
    moovExtra: [
      box('udta', copyrightXyz(IPHONE_LOCATION), Buffer.alloc(4)),
      mdtaMeta(iphoneMetadataEntries(), options.metaShape ?? 'quicktime'),
    ],
  });
}

/** Offsets of every occurrence of `needle` in `haystack`. */
export function findAll(haystack: Buffer, needle: Buffer | string): number[] {
  const target = typeof needle === 'string' ? Buffer.from(needle, 'latin1') : needle;
  const out: number[] = [];
  let at = haystack.indexOf(target);
  while (at >= 0) {
    out.push(at);
    at = haystack.indexOf(target, at + 1);
  }
  return out;
}

/** The stco chunk offsets of every track, in file order. */
export function readChunkOffsets(file: Buffer): number[] {
  const out: number[] = [];
  for (const at of findAll(file, 'stco')) {
    const count = file.readUInt32BE(at + 8);
    for (let index = 0; index < count; index += 1) out.push(file.readUInt32BE(at + 12 + index * 4));
  }
  return out;
}
