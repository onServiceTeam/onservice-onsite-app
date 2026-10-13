// HA-M2-82 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 3): an mvhd box in version 1 (64-bit times) is read
// correctly. The duration here, 25,000,000,000 ticks at a 1 GHz timescale,
// does not fit in 32 bits; read as 25,000 ms it passes a 30 s limit, and the
// same box with a 35 s value is refused. Synthetic MP4 files through the real
// box walker (utils/isobmff.ts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectIsoBmff } from '../src/utils/isobmff';
import { inspectUploadedFile } from '../src/services/job-media.service';
import { buildMp4 } from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-82: a version 1 mvhd with a 64-bit duration is read as the right length', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-82-'));
  try {
    const file = path.join(dir, 'v1.mp4');
    const bytes = buildMp4({ mvhdVersion: 1, timescale: 1_000_000_000, rawDuration: 25_000_000_000n });
    fs.writeFileSync(file, bytes);
    const handle = await fs.promises.open(file, 'r');
    try {
      expect((await inspectIsoBmff(handle, bytes.length)).durationMs).toBe(25_000);
    } finally {
      await handle.close();
    }
    const target = { id: '82000000-0000-4000-8000-0000000000aa', kind: 'video' as const, declaredDurationMs: 25_000, limitDurationMs: 30_000 };
    await expect(inspectUploadedFile(file, target)).resolves.toMatchObject({ durationMs: 25_000 });

    const longer = path.join(dir, 'v1-long.mp4');
    fs.writeFileSync(longer, buildMp4({ mvhdVersion: 1, timescale: 1_000_000_000, rawDuration: 35_000_000_000n }));
    await expect(inspectUploadedFile(longer, target)).rejects.toMatchObject({ code: 'too_long' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
