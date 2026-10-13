/**
 * WebM and Ogg Opus readers for D38 voice notes recorded in a browser.
 * Chrome's MediaRecorder writes WebM (Opus) and Firefox writes Ogg (Opus).
 *
 * inspectWebm(first 64 KiB)
 * - The EBML DocType must be 'webm' (plain Matroska is refused).
 * - TimecodeScale and Duration are read from Segment/Info when present
 *   (source 'container'). Chrome's recorder writes no Duration, so the caller
 *   then relies on the app's declared length (source 'client'), bounded by the
 *   length limit plus tolerance and by the size limit.
 * - Tracks: any video track is reported so the caller can refuse it.
 *
 * inspectOgg(first 4 KiB, last 64 KiB)
 * - The first page must start the Opus stream (OpusHead); pre-skip is read.
 * - The length comes from the granule position of the last page of that
 *   stream: (granule - pre-skip) / 48 milliseconds (Opus runs at 48 kHz).
 *
 * Nothing here trusts a size field: every read is bounds-checked and anything
 * that cannot be walked is refused as malformed.
 */

export class ContainerError extends Error {
  constructor(readonly code: 'malformed', message: string) {
    super(message);
    this.name = 'ContainerError';
  }
}

function malformed(message: string): never {
  throw new ContainerError('malformed', message);
}

// ── WebM (EBML) ──

const EBML_HEADER = 0x1a45dfa3;
const DOC_TYPE = 0x4282;
const SEGMENT = 0x18538067;
const CLUSTER = 0x1f43b675;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_TYPE = 0x83;
const CODEC_ID = 0x86;

export interface WebmReport {
  docType: string;
  durationMs: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  audioCodecs: string[];
}

interface Element {
  id: number;
  dataStart: number;
  /** null = unknown size (live recordings). */
  size: number | null;
}

function vintLength(first: number): number {
  for (let index = 0; index < 8; index += 1) {
    if (first & (0x80 >> index)) return index + 1;
  }
  return 0;
}

/** Read one element header at pos. Null when the buffer ends inside the header. */
function readElement(buf: Buffer, pos: number): Element | null {
  if (pos >= buf.length) return null;
  const idLength = vintLength(buf[pos]!);
  if (idLength === 0 || idLength > 4) malformed('A WebM element ID is invalid.');
  if (pos + idLength >= buf.length) return null;
  let id = 0;
  for (let index = 0; index < idLength; index += 1) id = id * 256 + buf[pos + index]!;
  const sizeAt = pos + idLength;
  const sizeLength = vintLength(buf[sizeAt]!);
  if (sizeLength === 0) malformed('A WebM element size is invalid.');
  if (sizeAt + sizeLength > buf.length) return null;
  const mask = 0xff >> sizeLength;
  let value = buf[sizeAt]! & mask;
  let allOnes = value === mask;
  for (let index = 1; index < sizeLength; index += 1) {
    const byte = buf[sizeAt + index]!;
    value = value * 256 + byte;
    allOnes = allOnes && byte === 0xff;
  }
  if (!allOnes && !Number.isSafeInteger(value)) malformed('A WebM element is too large.');
  return { id, dataStart: sizeAt + sizeLength, size: allOnes ? null : value };
}

function readUnsigned(buf: Buffer, start: number, size: number): number {
  if (size < 1 || size > 6) malformed('A WebM number has a bad size.');
  let value = 0;
  for (let index = 0; index < size; index += 1) value = value * 256 + buf[start + index]!;
  return value;
}

function readFloat(buf: Buffer, start: number, size: number): number {
  if (size === 4) return buf.readFloatBE(start);
  if (size === 8) return buf.readDoubleBE(start);
  malformed('A WebM duration has a bad size.');
}

/** Children of a known-size master element that fits in the buffer. */
function* children(buf: Buffer, start: number, end: number): Generator<Element & { size: number }> {
  let pos = start;
  while (pos < end) {
    const element = readElement(buf, pos);
    if (!element || element.size === null) malformed('A WebM element inside a header has no size.');
    if (element.dataStart + element.size > end) malformed('A WebM element runs past its parent.');
    yield element as Element & { size: number };
    pos = element.dataStart + element.size;
  }
}

export function inspectWebm(head: Buffer): WebmReport {
  const header = readElement(head, 0);
  if (!header || header.id !== EBML_HEADER || header.size === null) malformed('The file has no EBML header.');
  const headerEnd = header.dataStart + header.size;
  if (headerEnd > head.length) malformed('The EBML header is truncated.');
  let docType = '';
  for (const child of children(head, header.dataStart, headerEnd)) {
    if (child.id === DOC_TYPE) docType = head.toString('latin1', child.dataStart, child.dataStart + child.size).replace(/\0+$/, '');
  }

  const segment = readElement(head, headerEnd);
  if (!segment || segment.id !== SEGMENT) malformed('The file has no WebM segment.');
  const segmentEnd = segment.size === null ? head.length : Math.min(head.length, segment.dataStart + segment.size);

  let timecodeScale = 1_000_000;
  let duration: number | null = null;
  let sawTracks = false;
  let hasVideo = false;
  let hasAudio = false;
  const audioCodecs: string[] = [];

  let pos = segment.dataStart;
  while (pos < segmentEnd) {
    const element = readElement(head, pos);
    if (!element || element.id === CLUSTER) break;
    if (element.size === null) break;
    const end = element.dataStart + element.size;
    if (element.id === INFO || element.id === TRACKS) {
      if (end > head.length) malformed('WebM headers do not fit in the first 64 KiB.');
      if (element.id === INFO) {
        for (const child of children(head, element.dataStart, end)) {
          if (child.id === TIMECODE_SCALE) timecodeScale = readUnsigned(head, child.dataStart, child.size);
          if (child.id === DURATION) duration = readFloat(head, child.dataStart, child.size);
        }
      } else {
        sawTracks = true;
        for (const entry of children(head, element.dataStart, end)) {
          if (entry.id !== TRACK_ENTRY) continue;
          let trackType = 0;
          let codec = '';
          for (const field of children(head, entry.dataStart, entry.dataStart + entry.size)) {
            if (field.id === TRACK_TYPE) trackType = readUnsigned(head, field.dataStart, field.size);
            if (field.id === CODEC_ID) codec = head.toString('latin1', field.dataStart, field.dataStart + field.size).replace(/\0+$/, '');
          }
          if (trackType === 1) hasVideo = true;
          if (trackType === 2) {
            hasAudio = true;
            audioCodecs.push(codec);
          }
        }
      }
    }
    if (end > head.length) break;
    pos = end;
  }

  if (!sawTracks) malformed('No WebM track list in the first 64 KiB.');
  const durationMs = duration !== null && Number.isFinite(duration) && duration > 0 && timecodeScale > 0
    ? Math.round((duration * timecodeScale) / 1_000_000)
    : null;
  return { docType, durationMs, hasVideo, hasAudio, audioCodecs };
}

// ── Ogg ──

export interface OggReport {
  /** 'opus' when the first stream is Opus, otherwise the first bytes of its first packet. */
  firstCodec: string;
  preSkip: number;
  /** True when another stream (video, Vorbis) starts beside the Opus one. */
  hasOtherStream: boolean;
  durationMs: number | null;
}

interface OggPage {
  headerType: number;
  granule: bigint;
  serial: number;
  dataStart: number;
  dataEnd: number;
}

function readPage(buf: Buffer, pos: number): OggPage | null {
  if (pos + 27 > buf.length || buf.toString('latin1', pos, pos + 4) !== 'OggS' || buf[pos + 4] !== 0) return null;
  const segments = buf[pos + 26]!;
  if (pos + 27 + segments > buf.length) return null;
  let dataLength = 0;
  for (let index = 0; index < segments; index += 1) dataLength += buf[pos + 27 + index]!;
  const dataStart = pos + 27 + segments;
  if (dataStart + dataLength > buf.length) return null;
  return {
    headerType: buf[pos + 5]!,
    granule: buf.readBigInt64LE(pos + 6),
    serial: buf.readUInt32LE(pos + 14),
    dataStart,
    dataEnd: dataStart + dataLength,
  };
}

export function inspectOgg(first: Buffer, last: Buffer): OggReport {
  const page = readPage(first, 0);
  if (!page || !(page.headerType & 0x02)) malformed('The file does not start an Ogg stream.');
  const packet = first.subarray(page.dataStart, page.dataEnd);
  const isOpus = packet.length >= 19 && packet.toString('latin1', 0, 8) === 'OpusHead';
  const firstCodec = isOpus ? 'opus' : packet.toString('latin1', 0, Math.min(8, packet.length)).replace(/[^\x20-\x7e]/g, '');
  const preSkip = isOpus ? packet.readUInt16LE(10) : 0;

  // Other beginning-of-stream pages follow the first one directly.
  let hasOtherStream = false;
  let pos = page.dataEnd;
  for (;;) {
    const next = readPage(first, pos);
    if (!next || !(next.headerType & 0x02)) break;
    if (next.serial !== page.serial) hasOtherStream = true;
    pos = next.dataEnd;
  }

  let durationMs: number | null = null;
  if (isOpus) {
    for (let at = last.length - 27; at >= 0; at -= 1) {
      if (last[at] !== 0x4f) continue;
      const candidate = readPage(last, at);
      if (!candidate || candidate.serial !== page.serial || candidate.granule < 0n) continue;
      const samples = candidate.granule - BigInt(preSkip);
      if (samples >= 0n) durationMs = Math.round(Number(samples) / 48);
      break;
    }
  }
  return { firstCodec, preSkip, hasOtherStream, durationMs };
}
