// HA-M2-91 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 12): a Firefox Ogg Opus voice note is measured from the
// granule position of its last page, (granule - pre-skip) / 48 ms. One whose
// last granule shows 75 s is refused as too_long against the 60 s voice
// limit; the same file at 45 s is accepted with source 'container'.
// Synthetic Ogg pages through the real inspection code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectUploadedFile } from '../src/services/job-media.service';
import { buildOggOpus } from './helpers/webm-builder';

it('HA-M2-91: an Ogg Opus file whose last granule shows 75 s is refused against a 60 s limit', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-91-'));
  // The app claims 50 s; the server trusts the file.
  const target = { id: '91000000-0000-4000-8000-0000000000aa', kind: 'voice' as const, declaredDurationMs: 50_000, limitDurationMs: 60_000 };
  try {
    const long = path.join(dir, 'long.ogg');
    fs.writeFileSync(long, buildOggOpus({ durationMs: 75_000 }));
    await expect(inspectUploadedFile(long, target)).rejects.toMatchObject({ code: 'too_long' });

    const ok = path.join(dir, 'ok.ogg');
    fs.writeFileSync(ok, buildOggOpus({ durationMs: 45_000 }));
    await expect(inspectUploadedFile(ok, target)).resolves.toMatchObject({
      mime: 'audio/ogg', ext: 'ogg', durationMs: 45_000, durationSource: 'container', codec: 'opus',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
