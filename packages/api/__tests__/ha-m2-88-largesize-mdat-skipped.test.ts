// HA-M2-88 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 9): an mdat written with a 64-bit largesize header (size
// field 1) is skipped by its real length and the moov after it is still
// found, read and scrubbed. Synthetic MP4 through the real box walker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectUploadedFile } from '../src/services/job-media.service';
import { box, buildMp4, copyrightXyz, findAll } from './helpers/mp4-builder';

it('HA-M2-88: a 64-bit largesize mdat is skipped and the moov after it is still found', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-88-'));
  try {
    const bytes = buildMp4({
      largeMdat: true,
      durationMs: 12_345,
      mdatBytes: Buffer.alloc(70_000, 0x33),
      tracks: [{ handler: 'vide', codec: 'hvc1', width: 1080, height: 1920 }],
      moovExtra: [box('udta', copyrightXyz())],
    });
    const mdatAt = findAll(bytes, 'mdat')[0]! - 4;
    expect(bytes.readUInt32BE(mdatAt)).toBe(1);
    expect(Number(bytes.readBigUInt64BE(mdatAt + 8))).toBe(16 + 70_000);
    const file = path.join(dir, 'large.mp4');
    fs.writeFileSync(file, bytes);
    const result = await inspectUploadedFile(file, {
      id: '88000000-0000-4000-8000-0000000000aa', kind: 'video', declaredDurationMs: 12_000, limitDurationMs: 30_000,
    });
    expect(result).toMatchObject({ durationMs: 12_345, codec: 'hvc1', width: 1080, height: 1920, mime: 'video/mp4' });
    expect(findAll(fs.readFileSync(file), '©xyz')).toHaveLength(0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
