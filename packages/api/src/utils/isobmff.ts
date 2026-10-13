/**
 * ISO base media file (MP4, MOV, 3GP, M4A) inspection and location removal
 * for D38 request videos and voice notes. No new dependency: the box walk is
 * small and only reads what the rules below need.
 *
 * What it reads
 * - The top level box list (16-byte headers at file offsets; mdat is skipped
 *   by its size, so files with moov at the end, as iPhones and Android phones
 *   write them, work). The first box must be ftyp; there must be exactly one
 *   moov, which is read into memory.
 * - Inside moov: mvhd duration, each track's handler (mdia/hdlr), first sample
 *   entry (stbl/stsd, the codec) and tkhd width and height (swapped for a 90 or
 *   270 degree rotation matrix).
 *
 * What it removes (D38: "location data is removed from photos and from video
 * metadata"; critique M14)
 * - Any box named (c)xyz (bytes A9 78 79 7A, QuickTime and Android location),
 *   loci (3GPP location), XMP_ and an XMP uuid box. Each is renamed to 'free'
 *   and its payload zeroed.
 * - In a meta box whose handler is mdta (iPhone), the value bytes of every
 *   item whose key starts with com.apple.quicktime.location. are zeroed. The
 *   16-byte data box header is kept, and so are the other keys (make, model,
 *   software).
 * Every patch keeps the length of the box, so no size field changes and the
 * stco/co64 chunk offsets into mdat stay valid. The patched moov is written
 * back once at its own offset, and the file is then walked again; if any
 * location item is still present the caller must refuse the upload.
 *
 * Anything that cannot be walked safely (a box running past its parent or the
 * end of the file, a size below its header, more than 1,000 top level boxes,
 * nesting deeper than 12, a missing or duplicate moov) is refused as malformed.
 */
import type { FileHandle } from 'node:fs/promises';

export class IsoBmffError extends Error {
  readonly code = 'malformed' as const;
  constructor(message: string) {
    super(message);
    this.name = 'IsoBmffError';
  }
}

export interface IsoBmffTrack {
  handler: string | null;
  codec: string | null;
  width?: number;
  height?: number;
}

export interface IsoBmffReport {
  majorBrand: string;
  durationMs: number | null;
  tracks: IsoBmffTrack[];
  /** Location boxes or items removed by this call. */
  patched: number;
  /** Location boxes or items still present when the call finished (must be 0). */
  locationRemaining: number;
}

const FTYP_MAX_BYTES = 1024;
const MOOV_MAX_BYTES = 16 * 1024 * 1024;
const TOP_LEVEL_META_MAX_BYTES = 16 * 1024 * 1024;
const MAX_TOP_LEVEL_BOXES = 1000;
const MAX_DEPTH = 12;
const TRAILING_ZERO_TOLERANCE = 8;
const LOCATION_KEY_PREFIX = 'com.apple.quicktime.location.';
const COPYRIGHT_XYZ = '©xyz';
const LOCATION_BOX_TYPES = new Set([COPYRIGHT_XYZ, 'loci', 'XMP_']);
/** XMP packets in ISO files: uuid BE7ACFCB-97A9-42E8-9C71-999491E3AFAC. */
const XMP_UUID = Buffer.from('be7acfcb97a942e89c71999491e3afac', 'hex');
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'edts']);

function malformed(message: string): never {
  throw new IsoBmffError(message);
}

interface BoxHeader {
  type: string;
  /** Absolute start of the box (buffer or file offset). */
  start: number;
  headerSize: number;
  size: number;
}

/** Parse one child box header inside [pos, end) of an in-memory buffer. Null = tolerated trailing zeros. */
function readChildHeader(buf: Buffer, pos: number, end: number): BoxHeader | null {
  const remaining = end - pos;
  if (remaining < 8) {
    if (remaining <= TRAILING_ZERO_TOLERANCE && buf.subarray(pos, end).every(byte => byte === 0)) return null;
    malformed('A box header runs past its parent.');
  }
  const size32 = buf.readUInt32BE(pos);
  const type = buf.toString('latin1', pos + 4, pos + 8);
  if (size32 === 0 && type === '\0\0\0\0' && remaining <= TRAILING_ZERO_TOLERANCE) return null;
  let headerSize = 8;
  let size: number;
  if (size32 === 1) {
    if (remaining < 16) malformed('A 64-bit box header runs past its parent.');
    const large = buf.readBigUInt64BE(pos + 8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) malformed('A box is too large.');
    size = Number(large);
    headerSize = 16;
  } else if (size32 === 0) {
    size = remaining;
  } else {
    size = size32;
  }
  if (size < headerSize) malformed('A box is smaller than its header.');
  if (pos + size > end) malformed('A box runs past its parent.');
  return { type, start: pos, headerSize, size };
}

interface TrackState extends IsoBmffTrack {}

interface WalkState {
  scrub: boolean;
  patched: number;
  remaining: number;
  durationMs: number | null;
  tracks: TrackState[];
}

function scrubBox(buf: Buffer, box: BoxHeader, state: WalkState): void {
  if (state.scrub) {
    buf.write('free', box.start + 4, 'latin1');
    buf.fill(0, box.start + box.headerSize, box.start + box.size);
    state.patched += 1;
  } else {
    state.remaining += 1;
  }
}

function isLocationBox(buf: Buffer, box: BoxHeader): boolean {
  if (LOCATION_BOX_TYPES.has(box.type)) return true;
  if (box.type === 'uuid' && box.size >= box.headerSize + 16) {
    return buf.subarray(box.start + box.headerSize, box.start + box.headerSize + 16).equals(XMP_UUID);
  }
  return false;
}

function readMvhd(buf: Buffer, box: BoxHeader, state: WalkState): void {
  const p = box.start + box.headerSize;
  const end = box.start + box.size;
  if (p + 4 > end) malformed('mvhd is truncated.');
  const version = buf[p]!;
  let timescale: number;
  let duration: bigint;
  let unknown: bigint;
  if (version === 1) {
    if (p + 32 > end) malformed('mvhd is truncated.');
    timescale = buf.readUInt32BE(p + 20);
    duration = buf.readBigUInt64BE(p + 24);
    unknown = 0xffffffffffffffffn;
  } else {
    if (p + 20 > end) malformed('mvhd is truncated.');
    timescale = buf.readUInt32BE(p + 12);
    duration = BigInt(buf.readUInt32BE(p + 16));
    unknown = 0xffffffffn;
  }
  if (timescale === 0 || duration === 0n || duration === unknown) {
    state.durationMs = null;
    return;
  }
  const ms = Number((duration * 1000n + BigInt(timescale) / 2n) / BigInt(timescale));
  state.durationMs = Number.isSafeInteger(ms) ? ms : null;
}

function readTkhd(buf: Buffer, box: BoxHeader, track: TrackState): void {
  const p = box.start + box.headerSize;
  const end = box.start + box.size;
  if (p + 4 > end) malformed('tkhd is truncated.');
  const version = buf[p]!;
  const matrixAt = p + (version === 1 ? 52 : 40);
  const widthAt = p + (version === 1 ? 88 : 76);
  if (widthAt + 8 > end) malformed('tkhd is truncated.');
  let width = buf.readUInt32BE(widthAt) >>> 16;
  let height = buf.readUInt32BE(widthAt + 4) >>> 16;
  const a = buf.readInt32BE(matrixAt);
  const b = buf.readInt32BE(matrixAt + 4);
  const c = buf.readInt32BE(matrixAt + 12);
  const d = buf.readInt32BE(matrixAt + 16);
  if (a === 0 && d === 0 && b !== 0 && c !== 0) [width, height] = [height, width];
  if (width > 0) track.width = width;
  if (height > 0) track.height = height;
}

function readHandler(buf: Buffer, box: BoxHeader): string | null {
  const p = box.start + box.headerSize;
  if (p + 12 > box.start + box.size) return null;
  return buf.toString('latin1', p + 8, p + 12);
}

function readFirstSampleEntry(buf: Buffer, box: BoxHeader): string | null {
  const p = box.start + box.headerSize;
  const end = box.start + box.size;
  if (p + 8 > end) malformed('stsd is truncated.');
  const count = buf.readUInt32BE(p + 4);
  if (count === 0) return null;
  if (p + 16 > end) malformed('stsd is truncated.');
  return buf.toString('latin1', p + 12, p + 16);
}

function readKeys(buf: Buffer, box: BoxHeader): string[] {
  const p = box.start + box.headerSize;
  const end = box.start + box.size;
  if (p + 8 > end) malformed('keys is truncated.');
  const count = buf.readUInt32BE(p + 4);
  const names: string[] = [];
  let pos = p + 8;
  for (let index = 0; index < count; index += 1) {
    if (pos + 8 > end) malformed('A key entry runs past its box.');
    const keySize = buf.readUInt32BE(pos);
    if (keySize < 8 || pos + keySize > end) malformed('A key entry has a bad size.');
    names.push(buf.toString('utf8', pos + 8, pos + keySize));
    pos += keySize;
  }
  return names;
}

/** mdta items whose key is a location key: zero (or, when only checking, count) their data values. */
function handleMdtaItems(buf: Buffer, ilst: BoxHeader, keys: string[], state: WalkState): void {
  let pos = ilst.start + ilst.headerSize;
  const end = ilst.start + ilst.size;
  while (pos < end) {
    const item = readChildHeader(buf, pos, end);
    if (!item) break;
    const keyIndex = buf.readUInt32BE(item.start + 4);
    const keyName = keyIndex >= 1 && keyIndex <= keys.length ? keys[keyIndex - 1]! : null;
    if (keyName && keyName.startsWith(LOCATION_KEY_PREFIX)) {
      let childPos = item.start + item.headerSize;
      const itemEnd = item.start + item.size;
      let carriesValue = false;
      while (childPos < itemEnd) {
        const child = readChildHeader(buf, childPos, itemEnd);
        if (!child) break;
        if (child.type === 'data') {
          const valueStart = child.start + Math.max(child.headerSize, 16);
          const valueEnd = child.start + child.size;
          if (valueStart < valueEnd) {
            if (state.scrub) buf.fill(0, valueStart, valueEnd);
            else if (!buf.subarray(valueStart, valueEnd).every(byte => byte === 0)) carriesValue = true;
          }
        }
        childPos = child.start + child.size;
      }
      if (state.scrub) state.patched += 1;
      else if (carriesValue) state.remaining += 1;
    } else if (isLocationBox(buf, item)) {
      scrubBox(buf, item, state);
    }
    pos = item.start + item.size;
  }
}

/** iTunes-style or other non-mdta ilst: only item-level location boxes matter. */
function handlePlainItems(buf: Buffer, ilst: BoxHeader, state: WalkState): void {
  let pos = ilst.start + ilst.headerSize;
  const end = ilst.start + ilst.size;
  while (pos < end) {
    const item = readChildHeader(buf, pos, end);
    if (!item) break;
    if (isLocationBox(buf, item)) scrubBox(buf, item, state);
    pos = item.start + item.size;
  }
}

function walkMeta(buf: Buffer, meta: BoxHeader, depth: number, state: WalkState, track: TrackState | null): void {
  if (depth > MAX_DEPTH) malformed('Boxes are nested too deeply.');
  const payload = meta.start + meta.headerSize;
  const end = meta.start + meta.size;
  // QuickTime-style meta is a plain container (its first child, hdlr, starts
  // right away); the ISO meta is a full box with 4 bytes of version and flags.
  const quickTime = payload + 8 <= end && buf.toString('latin1', payload + 4, payload + 8) === 'hdlr';
  const childrenStart = quickTime ? payload : payload + 4;
  if (childrenStart > end) malformed('meta is truncated.');

  let handler: string | null = null;
  let keys: string[] | null = null;
  const ilsts: BoxHeader[] = [];
  let pos = childrenStart;
  while (pos < end) {
    const child = readChildHeader(buf, pos, end);
    if (!child) break;
    if (isLocationBox(buf, child)) {
      scrubBox(buf, child, state);
    } else if (child.type === 'hdlr') {
      handler = readHandler(buf, child);
    } else if (child.type === 'keys') {
      keys = readKeys(buf, child);
    } else if (child.type === 'ilst') {
      ilsts.push(child);
    } else if (child.type === 'meta') {
      walkMeta(buf, child, depth + 1, state, track);
    } else if (CONTAINERS.has(child.type)) {
      walkContainer(buf, child, depth + 1, state, track);
    }
    pos = child.start + child.size;
  }
  for (const ilst of ilsts) {
    if (handler === 'mdta' && keys) handleMdtaItems(buf, ilst, keys, state);
    else handlePlainItems(buf, ilst, state);
  }
}

function walkContainer(buf: Buffer, box: BoxHeader, depth: number, state: WalkState, track: TrackState | null): void {
  if (depth > MAX_DEPTH) malformed('Boxes are nested too deeply.');
  let pos = box.start + box.headerSize;
  const end = box.start + box.size;
  while (pos < end) {
    const child = readChildHeader(buf, pos, end);
    if (!child) break;
    if (isLocationBox(buf, child)) {
      scrubBox(buf, child, state);
    } else if (child.type === 'mvhd' && box.type === 'moov') {
      readMvhd(buf, child, state);
    } else if (child.type === 'trak' && box.type === 'moov') {
      const next: TrackState = { handler: null, codec: null };
      walkContainer(buf, child, depth + 1, state, next);
      state.tracks.push(next);
    } else if (child.type === 'tkhd' && box.type === 'trak' && track) {
      readTkhd(buf, child, track);
    } else if (child.type === 'hdlr' && box.type === 'mdia' && track) {
      track.handler = readHandler(buf, child);
    } else if (child.type === 'stsd' && box.type === 'stbl' && track) {
      track.codec = readFirstSampleEntry(buf, child);
    } else if (child.type === 'meta') {
      walkMeta(buf, child, depth + 1, state, track);
    } else if (child.type === 'ilst') {
      handlePlainItems(buf, child, state);
    } else if (CONTAINERS.has(child.type)) {
      walkContainer(buf, child, depth + 1, state, track);
    }
    pos = child.start + child.size;
  }
}

interface TopLevelBox extends BoxHeader {}

async function readExactly(handle: FileHandle, length: number, position: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const { bytesRead } = await handle.read(buf, done, length - done, position + done);
    if (bytesRead === 0) malformed('The file ended early.');
    done += bytesRead;
  }
  return buf;
}

async function listTopLevel(handle: FileHandle, fileSize: number): Promise<TopLevelBox[]> {
  const boxes: TopLevelBox[] = [];
  let offset = 0;
  while (offset < fileSize) {
    if (boxes.length >= MAX_TOP_LEVEL_BOXES) malformed('Too many top level boxes.');
    const remaining = fileSize - offset;
    if (remaining < 8) malformed('The file ends inside a box header.');
    const head = await readExactly(handle, Math.min(16, remaining), offset);
    const size32 = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let headerSize = 8;
    let size: number;
    if (size32 === 1) {
      if (head.length < 16) malformed('A 64-bit box header is truncated.');
      const large = head.readBigUInt64BE(8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) malformed('A box is too large.');
      size = Number(large);
      headerSize = 16;
    } else if (size32 === 0) {
      size = remaining;
    } else {
      size = size32;
    }
    if (size < headerSize) malformed('A box is smaller than its header.');
    if (offset + size > fileSize) malformed('A box runs past the end of the file.');
    boxes.push({ type, start: offset, headerSize, size });
    offset += size;
  }
  return boxes;
}

async function zeroFileRange(handle: FileHandle, start: number, end: number): Promise<void> {
  const zeros = Buffer.alloc(Math.min(64 * 1024, Math.max(0, end - start)));
  for (let pos = start; pos < end; pos += zeros.length) {
    await handle.write(zeros, 0, Math.min(zeros.length, end - pos), pos);
  }
}

async function walkFile(handle: FileHandle, fileSize: number, scrub: boolean): Promise<IsoBmffReport> {
  const boxes = await listTopLevel(handle, fileSize);
  const ftyp = boxes[0];
  if (!ftyp || ftyp.type !== 'ftyp') malformed('The file does not start with ftyp.');
  if (ftyp.size > FTYP_MAX_BYTES || ftyp.size < ftyp.headerSize + 4) malformed('ftyp has a bad size.');
  const majorBrand = (await readExactly(handle, 4, ftyp.start + ftyp.headerSize)).toString('latin1');

  const moovs = boxes.filter(box => box.type === 'moov');
  if (moovs.length !== 1) malformed('The file must contain exactly one moov.');

  const state: WalkState = { scrub, patched: 0, remaining: 0, durationMs: null, tracks: [] };
  for (const box of boxes) {
    const inMemory = box.type === 'moov' || box.type === 'meta' || box.type === 'udta';
    if (inMemory) {
      const limit = box.type === 'moov' ? MOOV_MAX_BYTES : TOP_LEVEL_META_MAX_BYTES;
      if (box.size > limit) malformed(`${box.type} is too large.`);
      const buf = await readExactly(handle, box.size, box.start);
      const local: BoxHeader = { ...box, start: 0 };
      const before = state.patched;
      if (box.type === 'meta') walkMeta(buf, local, 1, state, null);
      else walkContainer(buf, local, 1, state, null);
      if (scrub && state.patched > before) await handle.write(buf, 0, buf.length, box.start);
      continue;
    }
    let target = LOCATION_BOX_TYPES.has(box.type);
    if (!target && box.type === 'uuid' && box.size >= box.headerSize + 16) {
      target = (await readExactly(handle, 16, box.start + box.headerSize)).equals(XMP_UUID);
    }
    if (target) {
      if (scrub) {
        await handle.write(Buffer.from('free', 'latin1'), 0, 4, box.start + 4);
        await zeroFileRange(handle, box.start + box.headerSize, box.start + box.size);
        state.patched += 1;
      } else {
        state.remaining += 1;
      }
    }
  }

  return {
    majorBrand,
    durationMs: state.durationMs,
    tracks: state.tracks.map(track => ({ ...track })),
    patched: state.patched,
    locationRemaining: state.remaining,
  };
}

/**
 * Walk the file, remove every location box or item in place, then walk it
 * again. The returned report describes the file as it now is on disk;
 * `locationRemaining` must be 0 before the file may be stored.
 */
export async function inspectAndScrubIsoBmff(handle: FileHandle, fileSize: number): Promise<IsoBmffReport> {
  const first = await walkFile(handle, fileSize, true);
  if (first.patched > 0) await handle.datasync();
  const check = await walkFile(handle, fileSize, false);
  return { ...check, patched: first.patched };
}

/** Read-only walk (tests and diagnostics): counts location boxes or items without changing the file. */
export async function inspectIsoBmff(handle: FileHandle, fileSize: number): Promise<IsoBmffReport> {
  return walkFile(handle, fileSize, false);
}
