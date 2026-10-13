// HA-M2-83 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 4, critique M14): a QuickTime/Android (c)xyz location box
// in moov/udta becomes a zeroed 'free' box of the same length. The file
// length, the mdat sample bytes and every stco chunk offset are unchanged, so
// the video still plays. Synthetic MP4 through the real box walker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectAndScrubIsoBmff } from '../src/utils/isobmff';
import { box, buildMp4, copyrightXyz, findAll, readChunkOffsets } from './helpers/mp4-builder';

const LOCATION = '+10.3157+123.8854/';

it('HA-M2-83: a (c)xyz box becomes a zeroed free box and the length, mdat bytes and stco offsets are unchanged', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-83-'));
  try {
    const samples = Buffer.from('sample-bytes-that-must-not-change-'.repeat(20), 'latin1');
    const original = buildMp4({ mdatBytes: samples, moovExtra: [box('udta', copyrightXyz(LOCATION))] });
    const xyzAt = findAll(original, '©xyz');
    expect(xyzAt).toHaveLength(1);
    const boxStart = xyzAt[0]! - 4;
    const xyzSize = original.readUInt32BE(boxStart);
    const file = path.join(dir, 'android.mp4');
    fs.writeFileSync(file, original);

    const handle = await fs.promises.open(file, 'r+');
    let report;
    try {
      report = await inspectAndScrubIsoBmff(handle, original.length);
    } finally {
      await handle.close();
    }
    const scrubbed = fs.readFileSync(file);

    expect(report).toMatchObject({ patched: 1, locationRemaining: 0 });
    expect(scrubbed.length).toBe(original.length);
    expect(scrubbed.includes(Buffer.from(LOCATION, 'latin1'))).toBe(false);
    expect(findAll(scrubbed, '©xyz')).toHaveLength(0);
    // Same place, same size, now 'free' with an all-zero payload.
    expect(scrubbed.toString('latin1', boxStart + 4, boxStart + 8)).toBe('free');
    expect(scrubbed.readUInt32BE(boxStart)).toBe(xyzSize);
    expect(scrubbed.subarray(boxStart + 8, boxStart + xyzSize).every(byte => byte === 0)).toBe(true);
    // The media data and the offsets into it are untouched.
    const mdatType = findAll(original, 'mdat')[0]!;
    expect(scrubbed.subarray(mdatType + 4, mdatType + 4 + samples.length)).toEqual(samples);
    expect(readChunkOffsets(scrubbed)).toEqual(readChunkOffsets(original));
    expect(readChunkOffsets(scrubbed)).toEqual([mdatType + 4]);
    // Everything outside the patched box is byte-for-byte the same.
    const outside = (bytes: Buffer): Buffer => Buffer.concat([bytes.subarray(0, boxStart + 4), bytes.subarray(boxStart + xyzSize)]);
    expect(outside(scrubbed)).toEqual(outside(original));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
