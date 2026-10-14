/**
 * D38 Milestone 2: turn a picked photo or video into an upload item, and
 * refuse what the server would refuse before any byte is sent (wrong type,
 * too large, a video over the length limit). The server checks again.
 */
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import { resolveMime, type JobMediaKind } from '@/services/job-media.service';
import type { PickedMedia } from '@/hooks/useJobMediaUploads';
import { normaliseVideoDurationMs } from './image-picker';

/** A picked video may report up to this much over the limit (players round). */
export const VIDEO_DURATION_TOLERANCE_MS = 500;

/** The website could not measure a picked video (see pickedFromAsset). */
export const WEB_VIDEO_UNREADABLE_COPY =
  'This website could not read the video. Add videos in the onService app for now. Here, you can add photos or describe the job.';

export interface MediaPickLimits {
  photoMaxBytes: number;
  videoMaxSeconds: number;
  videoMaxBytes: number;
}

export type PickResult = { ok: true; picked: PickedMedia } | { ok: false; message: string };

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * The size of the file that will actually be uploaded.
 *
 * On a phone that is the file at asset.uri, read from disk. The picker's own
 * fileSize is only a fallback: on Android, expo-image-picker 55 re-compresses
 * a photo picked with quality below 1 into a new cache file (asset.uri) but
 * reports fileSize from the ORIGINAL gallery or camera file, so declaring it
 * made the server refuse every chunk (chunk_length_mismatch). On the web it is
 * the picked File itself.
 */
function sizeOf(asset: ImagePickerAsset): number {
  const reported = typeof asset.fileSize === 'number' && asset.fileSize > 0 ? asset.fileSize : 0;
  if (Platform.OS === 'web') {
    const fileSize = asset.file?.size ?? 0;
    return fileSize > 0 ? fileSize : reported;
  }
  try {
    const onDisk = new File(asset.uri).size;
    if (typeof onDisk === 'number' && onDisk > 0) return onDisk;
  } catch {
    /* fall back to what the picker reported; the upload reads the real size again */
  }
  return reported;
}

/** Seconds as "31 seconds" / "1 second". */
function seconds(ms: number): string {
  const value = Math.round(ms / 1000);
  return `${value} second${value === 1 ? '' : 's'}`;
}

export function pickedFromAsset(asset: ImagePickerAsset, kind: Extract<JobMediaKind, 'photo' | 'video'>, limits: MediaPickLimits): PickResult {
  const noun = kind === 'photo' ? 'photo' : 'video';
  const mime = resolveMime(kind, asset.mimeType, asset.fileName ?? asset.uri);
  if (!mime) {
    return {
      ok: false,
      message: kind === 'photo'
        ? 'This photo type is not supported. Choose a JPG, PNG or WebP photo.'
        : 'This video type is not supported. Choose an MP4 or MOV video from your phone.',
    };
  }

  const source = Platform.OS === 'web'
    ? (asset.file ? { platform: 'web' as const, blob: asset.file as Blob } : null)
    : { platform: 'native' as const, uri: asset.uri };
  if (!source) return { ok: false, message: `This ${noun} could not be read. Choose it again.` };

  const size = sizeOf(asset);
  if (size <= 0) return { ok: false, message: `This ${noun} could not be read. Choose another one.` };
  const maxBytes = kind === 'photo' ? limits.photoMaxBytes : limits.videoMaxBytes;
  if (size > maxBytes) {
    return { ok: false, message: `This ${noun} is ${megabytes(size)}. The limit is ${megabytes(maxBytes)}. Choose a smaller one.` };
  }

  let durationMs: number | undefined;
  if (kind === 'video') {
    const normalised = normaliseVideoDurationMs(asset.duration, Platform.OS);
    if (normalised === null) {
      // On the website the browser measures the video by loading it from a
      // blob: address, which the live site's security policy still blocks
      // (a separate server step). Every video then reads as length 0, so the
      // copy says what works instead of blaming the customer's video.
      return {
        ok: false,
        message: Platform.OS === 'web' ? WEB_VIDEO_UNREADABLE_COPY : 'We could not read how long this video is. Choose another video.',
      };
    }
    const limitMs = limits.videoMaxSeconds * 1000;
    if (normalised > limitMs + VIDEO_DURATION_TOLERANCE_MS) {
      return {
        ok: false,
        message: `This video is ${seconds(normalised)}. Videos can be up to ${limits.videoMaxSeconds} seconds. Trim it in your gallery, then add it again.`,
      };
    }
    // The server allows a little over the limit; never declare more than it.
    durationMs = Math.min(normalised, limitMs + VIDEO_DURATION_TOLERANCE_MS);
  }

  return {
    ok: true,
    picked: {
      kind,
      source,
      mime,
      size,
      durationMs,
      width: asset.width > 0 ? Math.round(asset.width) : undefined,
      height: asset.height > 0 ? Math.round(asset.height) : undefined,
      previewUri: asset.uri,
      name: asset.fileName ?? undefined,
    },
  };
}
