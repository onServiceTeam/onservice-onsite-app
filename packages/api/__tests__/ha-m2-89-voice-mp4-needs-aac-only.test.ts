// HA-M2-89 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 10): a voice note in an MP4 container is accepted only when
// it is AAC sound with no picture: an mp4a-only sound track passes (as an
// .m4a), a file that also has a video track is refused as kind_mismatch, and
// AMR sound (samr), which browsers cannot play, is refused as
// codec_not_supported. Synthetic files through the real inspection code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectUploadedFile } from '../src/services/job-media.service';
import { buildMp4 } from './helpers/mp4-builder';

it('HA-M2-89: voice accepts an mp4a-only sound track and refuses a video track and AMR', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-89-'));
  const target = { id: '89000000-0000-4000-8000-0000000000aa', kind: 'voice' as const, declaredDurationMs: 20_000, limitDurationMs: 60_000 };
  const write = (name: string, bytes: Buffer): string => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, bytes);
    return file;
  };
  try {
    const aac = write('voice.m4a', buildMp4({ brand: 'M4A ', durationMs: 20_000, tracks: [{ handler: 'soun', codec: 'mp4a' }] }));
    await expect(inspectUploadedFile(aac, target)).resolves.toMatchObject({
      mime: 'audio/mp4', ext: 'm4a', durationMs: 20_000, codec: 'mp4a', width: null, height: null,
    });

    const withVideo = write('with-video.mp4', buildMp4({
      durationMs: 20_000,
      tracks: [{ handler: 'soun', codec: 'mp4a' }, { handler: 'vide', codec: 'avc1', width: 640, height: 480 }],
    }));
    await expect(inspectUploadedFile(withVideo, target)).rejects.toMatchObject({ code: 'kind_mismatch' });

    const amr = write('voice.3gp', buildMp4({ brand: '3gp4', durationMs: 20_000, tracks: [{ handler: 'soun', codec: 'samr' }] }));
    await expect(inspectUploadedFile(amr, target)).rejects.toMatchObject({ code: 'codec_not_supported' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
