// HA-M2-81 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 2): the server measures a request video's length from the
// file itself (mvhd, version 0) and refuses one that runs past the limit plus
// the one-second tolerance. Against a 30 s limit, 31.5 s is refused as
// too_long and 30.9 s is accepted. Synthetic MP4 files through the real
// inspection code (utils/isobmff.ts via inspectUploadedFile).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectUploadedFile } from '../src/services/job-media.service';
import { buildMp4 } from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-81: a 31.5 s video is refused as too_long against a 30 s limit while 30.9 s is accepted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-81-'));
  try {
    const target = { id: '81000000-0000-4000-8000-0000000000aa', kind: 'video' as const, declaredDurationMs: 29_000, limitDurationMs: 30_000 };
    const tooLong = path.join(dir, 'too-long.mp4');
    fs.writeFileSync(tooLong, buildMp4({ durationMs: 31_500 }));
    await expect(inspectUploadedFile(tooLong, target)).rejects.toMatchObject({ code: 'too_long' });

    const justInside = path.join(dir, 'inside.mp4');
    fs.writeFileSync(justInside, buildMp4({ durationMs: 30_900 }));
    const accepted = await inspectUploadedFile(justInside, target);
    expect(accepted).toMatchObject({
      mime: 'video/mp4', ext: 'mp4', durationMs: 30_900, durationSource: 'container', codec: 'avc1', width: 1280, height: 720,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
