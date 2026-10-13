// HA-M2-90 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 11): a browser voice note in WebM with DocType 'webm' and
// no Duration (what Chrome's MediaRecorder writes) is accepted, its length
// taken from the app's declared value with source 'client'. The same file
// with DocType 'matroska' is refused as unsupported_type. Synthetic EBML files
// through the real inspection code (utils/webm-ogg.ts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectUploadedFile } from '../src/services/job-media.service';
import { buildWebm } from './helpers/webm-builder';

it('HA-M2-90: WebM with DocType webm and no Duration is accepted with source client, Matroska is refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-90-'));
  const target = { id: '90000000-0000-4000-8000-0000000000aa', kind: 'voice' as const, declaredDurationMs: 42_000, limitDurationMs: 60_000 };
  try {
    const chrome = path.join(dir, 'chrome.webm');
    fs.writeFileSync(chrome, buildWebm({ docType: 'webm' }));
    await expect(inspectUploadedFile(chrome, target)).resolves.toMatchObject({
      mime: 'audio/webm', ext: 'webm', durationMs: 42_000, durationSource: 'client', codec: 'A_OPUS',
    });

    const matroska = path.join(dir, 'plain.mkv');
    fs.writeFileSync(matroska, buildWebm({ docType: 'matroska' }));
    await expect(inspectUploadedFile(matroska, target)).rejects.toMatchObject({ code: 'unsupported_type' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
