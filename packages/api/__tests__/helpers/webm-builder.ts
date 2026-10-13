// HA-M2 (D38 Milestone 2, package P3) helper: synthetic WebM (EBML) and Ogg
// Opus files for the browser voice-note readers in utils/webm-ogg.ts. The
// byte layouts follow the Matroska/EBML specification (element ID, size as a
// variable-length integer, payload) and RFC 3533/7845 (Ogg pages, OpusHead),
// including the shape Chrome's MediaRecorder writes: an unknown-size Segment
// with no Duration in Info.

function idBytes(id: number): Buffer {
  const bytes: number[] = [];
  let value = id;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  return Buffer.from(bytes);
}

function sizeVint(size: number): Buffer {
  // 8-byte size: marker 0x01 then 7 bytes of value.
  const out = Buffer.alloc(8);
  out[0] = 0x01;
  let value = size;
  for (let index = 7; index >= 1; index -= 1) {
    out[index] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return out;
}

/** Unknown size (all value bits set), as live recorders write the Segment. */
const UNKNOWN_SIZE = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

export function element(id: number, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  return Buffer.concat([idBytes(id), sizeVint(body.length), body]);
}

export function unknownSizeElement(id: number, ...payload: Buffer[]): Buffer {
  return Buffer.concat([idBytes(id), UNKNOWN_SIZE, ...payload]);
}

function uint(value: number, bytes = 4): Buffer {
  const out = Buffer.alloc(bytes);
  out.writeUIntBE(value, 0, bytes);
  return out;
}

function float64(value: number): Buffer {
  const out = Buffer.alloc(8);
  out.writeDoubleBE(value, 0);
  return out;
}

export interface WebmOptions {
  docType?: string;
  /** Duration in milliseconds at the default timecode scale (1 ms). Omitted = no Duration (Chrome). */
  durationMs?: number;
  tracks?: Array<{ type: 1 | 2; codec: string }>;
  unknownSizeSegment?: boolean;
}

export function buildWebm(options: WebmOptions = {}): Buffer {
  const header = element(0x1a45dfa3,
    element(0x4286, uint(1, 1)), // EBMLVersion
    element(0x4282, Buffer.from(options.docType ?? 'webm', 'latin1')), // DocType
  );
  const info = element(0x1549a966,
    element(0x2ad7b1, uint(1_000_000)), // TimecodeScale: 1 ms
    ...(options.durationMs === undefined ? [] : [element(0x4489, float64(options.durationMs))]),
  );
  const tracks = element(0x1654ae6b, ...(options.tracks ?? [{ type: 2, codec: 'A_OPUS' }]).map((track, index) =>
    element(0xae,
      element(0xd7, uint(index + 1, 1)), // TrackNumber
      element(0x83, uint(track.type, 1)), // TrackType
      element(0x86, Buffer.from(track.codec, 'latin1')), // CodecID
    )));
  const cluster = element(0x1f43b675, element(0xe7, uint(0, 1)), element(0xa3, Buffer.alloc(64, 0x55)));
  const segmentBody = [info, tracks, cluster];
  const segment = options.unknownSizeSegment === false
    ? element(0x18538067, ...segmentBody)
    : unknownSizeElement(0x18538067, ...segmentBody);
  return Buffer.concat([header, segment]);
}

// ── Ogg ──

export function oggPage(options: { headerType: number; granule: bigint; serial: number; sequence: number; data: Buffer }): Buffer {
  const segments: number[] = [];
  let remaining = options.data.length;
  while (remaining >= 255) {
    segments.push(255);
    remaining -= 255;
  }
  segments.push(remaining);
  const header = Buffer.alloc(27 + segments.length);
  header.write('OggS', 0, 'latin1');
  header[4] = 0;
  header[5] = options.headerType;
  header.writeBigInt64LE(options.granule, 6);
  header.writeUInt32LE(options.serial, 14);
  header.writeUInt32LE(options.sequence, 18);
  header.writeUInt32LE(0, 22); // CRC is not checked by the reader
  header[26] = segments.length;
  segments.forEach((value, index) => { header[27 + index] = value; });
  return Buffer.concat([header, options.data]);
}

export function opusHead(preSkip = 312): Buffer {
  const out = Buffer.alloc(19);
  out.write('OpusHead', 0, 'latin1');
  out[8] = 1; // version
  out[9] = 1; // channels
  out.writeUInt16LE(preSkip, 10);
  out.writeUInt32LE(48_000, 12);
  return out;
}

/** An Ogg Opus voice note whose last page's granule gives `durationMs` (after pre-skip). */
export function buildOggOpus(options: { durationMs: number; preSkip?: number; extraStream?: boolean }): Buffer {
  const serial = 0x51a7e;
  const preSkip = options.preSkip ?? 312;
  const pages = [
    oggPage({ headerType: 0x02, granule: 0n, serial, sequence: 0, data: opusHead(preSkip) }),
    ...(options.extraStream
      ? [oggPage({ headerType: 0x02, granule: 0n, serial: serial + 1, sequence: 0, data: Buffer.from('\x80theora-synthetic', 'latin1') })]
      : []),
    oggPage({ headerType: 0, granule: 0n, serial, sequence: 1, data: Buffer.from('OpusTags-synthetic', 'latin1') }),
    oggPage({ headerType: 0, granule: 48_000n, serial, sequence: 2, data: Buffer.alloc(300, 0x11) }),
    oggPage({ headerType: 0x04, granule: BigInt(options.durationMs * 48 + preSkip), serial, sequence: 3, data: Buffer.alloc(200, 0x22) }),
  ];
  return Buffer.concat(pages);
}
