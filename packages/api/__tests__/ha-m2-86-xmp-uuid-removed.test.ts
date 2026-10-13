// HA-M2-86 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 7): an XMP packet in a uuid box (BE7ACFCB-97A9-42E8-9C71-
// 999491E3AFAC), which editing apps use to carry GPS, is removed whether it
// sits at the top level of the file or inside moov/udta; an unrelated uuid
// box is left alone. Synthetic MP4 through the real box walker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectAndScrubIsoBmff } from '../src/utils/isobmff';
import { XMP_UUID_HEX, box, buildMp4, findAll, xmpUuid } from './helpers/mp4-builder';

it('HA-M2-86: an XMP uuid box is removed at the top level and inside moov, other uuid boxes stay', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-86-'));
  try {
    const otherUuid = box('uuid', Buffer.from('00112233445566778899aabbccddeeff', 'hex'), Buffer.from('keep-this-vendor-box'));
    const original = buildMp4({
      topLevelExtra: [xmpUuid('<x:xmpmeta>top GPS 10.3157</x:xmpmeta>'), otherUuid],
      moovExtra: [box('udta', xmpUuid('<x:xmpmeta>inner GPS 123.8854</x:xmpmeta>'))],
    });
    expect(findAll(original, Buffer.from(XMP_UUID_HEX, 'hex'))).toHaveLength(2);
    const file = path.join(dir, 'edited.mp4');
    fs.writeFileSync(file, original);
    const handle = await fs.promises.open(file, 'r+');
    let report;
    try {
      report = await inspectAndScrubIsoBmff(handle, original.length);
    } finally {
      await handle.close();
    }
    const scrubbed = fs.readFileSync(file);
    expect(report).toMatchObject({ patched: 2, locationRemaining: 0 });
    expect(findAll(scrubbed, Buffer.from(XMP_UUID_HEX, 'hex'))).toHaveLength(0);
    expect(scrubbed.includes(Buffer.from('GPS 10.3157'))).toBe(false);
    expect(scrubbed.includes(Buffer.from('GPS 123.8854'))).toBe(false);
    expect(scrubbed.includes(Buffer.from('keep-this-vendor-box'))).toBe(true);
    expect(scrubbed.length).toBe(original.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
