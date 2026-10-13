// HA-M2-84 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 5, critique M14): in an iPhone-style mdta meta box the
// value of com.apple.quicktime.location.ISO6709 (and the other
// com.apple.quicktime.location.* keys) is zeroed in both meta shapes, the
// QuickTime one (no version) and the ISO full box. The make and model values
// are left exactly as they were, and the file length does not change.
// Synthetic MOV files through the real box walker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectAndScrubIsoBmff } from '../src/utils/isobmff';
import { IPHONE_LOCATION, IPHONE_MAKE, IPHONE_MODEL, buildMp4, iphoneMetadataEntries, mdtaMeta } from './helpers/mp4-builder';

it('HA-M2-84: the ISO6709 location value is zeroed in both meta shapes while make and model are untouched', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-84-'));
  try {
    for (const shape of ['quicktime', 'iso'] as const) {
      const original = buildMp4({ brand: 'qt  ', moovExtra: [mdtaMeta(iphoneMetadataEntries(), shape)] });
      expect(original.includes(Buffer.from(IPHONE_LOCATION))).toBe(true);
      const file = path.join(dir, `${shape}.mov`);
      fs.writeFileSync(file, original);
      const handle = await fs.promises.open(file, 'r+');
      let report;
      try {
        report = await inspectAndScrubIsoBmff(handle, original.length);
      } finally {
        await handle.close();
      }
      const scrubbed = fs.readFileSync(file);
      expect(report.locationRemaining).toBe(0);
      expect(report.patched).toBe(2); // ISO6709 and accuracy.horizontal
      expect(scrubbed.length).toBe(original.length);
      expect(scrubbed.includes(Buffer.from(IPHONE_LOCATION))).toBe(false);
      expect(scrubbed.includes(Buffer.from('4.766546'))).toBe(false);
      // The value bytes sit where they were, now zero; the key names stay.
      const at = original.indexOf(Buffer.from(IPHONE_LOCATION));
      expect(scrubbed.subarray(at, at + IPHONE_LOCATION.length).every(byte => byte === 0)).toBe(true);
      expect(scrubbed.includes(Buffer.from('com.apple.quicktime.location.ISO6709'))).toBe(true);
      for (const kept of [IPHONE_MAKE, IPHONE_MODEL, '17.6.1', '2026-10-13T09:41:00+0800']) {
        expect(scrubbed.indexOf(Buffer.from(kept))).toBe(original.indexOf(Buffer.from(kept)));
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
