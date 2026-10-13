// HA-M2-87 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 8): a box that runs past the end of the file (or past its
// parent), or whose size is below its 8-byte header, is refused as malformed
// instead of being walked. Covers the top level (mdat, a trailing box), boxes
// inside moov and a file cut short. Synthetic files through the real
// inspection code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectUploadedFile } from '../src/services/job-media.service';
import { box, buildMp4, findAll } from './helpers/mp4-builder';

it('HA-M2-87: a box running past the end of the file or smaller than its header is malformed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-m2-87-'));
  const target = { id: '87000000-0000-4000-8000-0000000000aa', kind: 'video' as const, declaredDurationMs: 10_000, limitDurationMs: 30_000 };
  try {
    const good = buildMp4();
    const goodFile = path.join(dir, 'good.mp4');
    fs.writeFileSync(goodFile, good);
    await expect(inspectUploadedFile(goodFile, target)).resolves.toMatchObject({ mime: 'video/mp4' });

    const sizeAt = (bytes: Buffer, type: string): number => findAll(bytes, type)[0]! - 4;
    const damaged: Array<[string, Buffer]> = [];
    const pastEnd = Buffer.from(good);
    pastEnd.writeUInt32BE(good.length * 4, sizeAt(pastEnd, 'mdat'));
    damaged.push(['mdat past the end of the file', pastEnd]);
    const tiny = Buffer.from(good);
    tiny.writeUInt32BE(4, sizeAt(tiny, 'mdat'));
    damaged.push(['mdat smaller than its header', tiny]);
    const childPastParent = Buffer.from(good);
    childPastParent.writeUInt32BE(1_000_000, sizeAt(childPastParent, 'tkhd'));
    damaged.push(['tkhd past its parent', childPastParent]);
    const tinyChild = Buffer.from(good);
    tinyChild.writeUInt32BE(3, sizeAt(tinyChild, 'stsd'));
    damaged.push(['stsd smaller than its header', tinyChild]);
    damaged.push(['moov cut short', good.subarray(0, good.length - 40)]);
    // A last top level box claiming 100 bytes when only its 8-byte header is there.
    const trailer = Buffer.alloc(8);
    trailer.writeUInt32BE(100, 0);
    trailer.write('free', 4, 'latin1');
    damaged.push(['trailing box past the end of the file', Buffer.concat([good, trailer])]);
    // Inside moov/udta: a 4-byte "box" whose next bytes happen to form a valid
    // 8-byte free box. A walker that let a size below 8 through would step 4
    // bytes and accept the file.
    const udtaBody = Buffer.from([0, 0, 0, 4, 0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65]);
    damaged.push(['udta child smaller than its header', buildMp4({ moovExtra: [box('udta', udtaBody)] })]);

    for (const [name, bytes] of damaged) {
      const file = path.join(dir, `${name.replace(/\W+/g, '-')}.mp4`);
      fs.writeFileSync(file, bytes);
      await expect(inspectUploadedFile(file, target)).rejects.toMatchObject({ code: 'malformed' });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
