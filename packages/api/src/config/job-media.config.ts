/**
 * D38 private job media (Milestone 2, package P3): fixed numbers for uploads,
 * signed links, quotas and cleanup. The admin-editable limits (photo count,
 * per-kind size and length) live in platform_settings and are read through
 * settingsService.getJobMediaLimits(); these are code constants (Ken open
 * question 5 asks whether any of them should become admin settings too).
 *
 * Plan: qa-frameworks/human-audit-2026-10-13/design-media.md sections 4-6,
 * merged.md section 2.3 and the critique.md corrections (no file extension in
 * the URL, link lifetime of at most 10 minutes, file-read limiter keyed on the
 * token).
 */

export const JOB_MEDIA_CONFIG = Object.freeze({
  /** Every chunk except the last is exactly this size (migration 184 allows 256 KiB to 8 MiB). */
  chunkBytes: 2 * 1024 * 1024,
  /** express.raw accepts a little more than one chunk so the length check gives a clear 400. */
  chunkBodyLimitBytes: 2 * 1024 * 1024 + 1024,

  /** Signed file links live 10 minutes. */
  urlTtlSeconds: 600,
  /** A token claiming an expiry further out than this was not minted here. */
  urlMaxFutureSeconds: 630,

  /** Viewer decisions for the file route are cached this long, so a provider who loses the request is cut off within a minute. */
  viewerCacheTtlMs: 60_000,
  viewerCacheMaxEntries: 5_000,

  /** Per-owner quota, checked under an advisory lock when an upload starts. */
  maxOpenItemsPerOwner: 12,
  maxDeclaredBytesPer24h: 400 * 1024 * 1024,

  /** Below this much free space on the uploads volume new uploads get 507. */
  minFreeDiskBytes: 5 * 1024 * 1024 * 1024,

  /** A declared or measured length may run this far over the limit (players round). */
  durationToleranceMs: 1_000,

  /** Photos are read into memory to strip metadata; 15 MiB is the admin ceiling. */
  maxPhotoReadBytes: 15 * 1024 * 1024,

  /** Chunk uploads: per signed-in user. */
  chunkLimiter: Object.freeze({ windowMs: 10 * 60_000, max: 240 }),
  /** Signed file reads (video players send many Range requests): per token. */
  fileLimiter: Object.freeze({ windowMs: 5 * 60_000, max: 600 }),

  /** Cleanup worker windows. */
  staleUploadingHours: 24,
  staleProcessingMinutes: 15,
  unattachedStoredHours: 24,
  orphanTempHours: 48,
  orphanTempMaxPerRun: 500,
});

export type JobMediaKind = 'photo' | 'video' | 'voice';
export type JobMediaPurpose = 'job_request' | 'chat';

/** The mime types an upload may declare, per kind (after normalisation). */
export const DECLARABLE_MIME_BY_KIND: Readonly<Record<JobMediaKind, ReadonlySet<string>>> = Object.freeze({
  photo: new Set(['image/jpeg', 'image/png', 'image/webp']),
  video: new Set(['video/mp4', 'video/quicktime', 'video/3gpp']),
  voice: new Set(['audio/mp4', 'audio/3gpp', 'audio/webm', 'audio/ogg']),
});

/** Stored mime type to the extension used on disk and in the download filename. */
export const EXTENSION_BY_MIME: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'audio/mp4': 'm4a',
  'audio/3gpp': '3gp',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
});

/** Video codecs (first sample entry of the video track) browsers and phones can play. */
export const VIDEO_CODECS: ReadonlySet<string> = new Set(['avc1', 'avc3', 'hvc1', 'hev1', 'mp4v']);
/** Voice notes in an MP4 container must be AAC. AMR (samr, sawb) is refused: browsers cannot play it. */
export const VOICE_MP4_CODECS: ReadonlySet<string> = new Set(['mp4a']);
/** Voice notes in WebM (Chrome's recorder). */
export const VOICE_WEBM_CODECS: ReadonlySet<string> = new Set(['A_OPUS', 'A_VORBIS']);
