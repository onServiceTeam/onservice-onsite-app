/**
 * Identify the container of an uploaded job-media file from its first bytes
 * (D38). The declared mime type and file name come from the client and are
 * never trusted; this decides which parser runs. Image signatures reuse the
 * upload service's existing magic-byte check.
 */
import { detectImageType } from '../services/upload.service';

export type MediaContainer = 'jpeg' | 'png' | 'webp' | 'isobmff' | 'webm' | 'ogg';

export function sniffContainer(head: Buffer): MediaContainer | null {
  const image = detectImageType(head);
  if (image === 'image/jpeg') return 'jpeg';
  if (image === 'image/png') return 'png';
  if (image === 'image/webp') return 'webp';
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') return 'isobmff';
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
  if (head.length >= 4 && head.toString('latin1', 0, 4) === 'OggS') return 'ogg';
  return null;
}
