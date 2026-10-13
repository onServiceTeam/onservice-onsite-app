// HA-M2-85 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 6): a 3GPP loci (location information) box, as some
// Android cameras write it in moov/udta, is removed: renamed to 'free' with a
// zeroed payload, and the place name it carried is gone. Synthetic 3GP file
// through the real box walker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectAndScrubIsoBmff, inspectIsoBmff } from '../src/utils/isobmff';
import { box, buildMp4, findAll, loci } from './helpers/mp4-builder';

it('HA-M2-85: a 3GPP loci box is removed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-85-'));
  try {
    const original = buildMp4({ brand: '3gp5', moovExtra: [box('udta', loci('Synthetic house'))] });
    const file = path.join(dir, 'camera.3gp');
    fs.writeFileSync(file, original);
    const handle = await fs.promises.open(file, 'r+');
    try {
      expect((await inspectIsoBmff(handle, original.length)).locationRemaining).toBe(1);
      const report = await inspectAndScrubIsoBmff(handle, original.length);
      expect(report).toMatchObject({ patched: 1, locationRemaining: 0, majorBrand: '3gp5' });
    } finally {
      await handle.close();
    }
    const scrubbed = fs.readFileSync(file);
    expect(findAll(scrubbed, 'loci')).toHaveLength(0);
    expect(scrubbed.includes(Buffer.from('Synthetic house'))).toBe(false);
    expect(scrubbed.includes(Buffer.from('home notes'))).toBe(false);
    expect(scrubbed.length).toBe(original.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
