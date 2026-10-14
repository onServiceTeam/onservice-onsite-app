/**
 * D38 Milestone 2: plain words for every error code the media, thread and
 * request endpoints send (packages/api job-media, messaging and booking
 * routes). Codes are mixed case on purpose: the media service uses lowercase
 * codes (too_large), the thread and request services uppercase (THREAD_READ_ONLY).
 */
import { ApiError } from '@/services/api';
import { getErrorMessage } from './errors';

export interface ApiErrorInfo {
  status: number;
  code: string | null;
  nextIndex: number | null;
  message: string | null;
}

/** Status 0 means the request never got an answer (offline, timeout). */
export function apiErrorInfo(error: unknown): ApiErrorInfo {
  if (error instanceof ApiError) {
    const body = (error.body?.error ?? null) as (Record<string, unknown> | null);
    const nextIndex = body?.nextIndex;
    return {
      status: error.status,
      code: typeof body?.code === 'string' ? body.code : null,
      nextIndex: typeof nextIndex === 'number' && Number.isInteger(nextIndex) && nextIndex >= 0 ? nextIndex : null,
      message: typeof body?.message === 'string' ? body.message : null,
    };
  }
  return { status: 0, code: null, nextIndex: null, message: null };
}

/** Worth trying again later: no answer, timeout, rate limit or a server problem. */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

type MediaKindLabel = 'photo' | 'video' | 'voice';

function kindNoun(kind: MediaKindLabel | undefined): string {
  if (kind === 'video') return 'video';
  if (kind === 'voice') return 'voice note';
  if (kind === 'photo') return 'photo';
  return 'file';
}

export interface MediaLimitsForCopy {
  videoMaxSeconds?: number;
  voiceMaxSeconds?: number;
}

/** Plain copy for a failed upload or media send. */
export function describeMediaError(error: unknown, kind?: MediaKindLabel, limits: MediaLimitsForCopy = {}): string {
  return mediaErrorCopy(apiErrorInfo(error), kind, limits, error);
}

/** Plain copy for an error code (for example an upload's stored rejectionCode). */
export function mediaErrorCopy(
  info: ApiErrorInfo,
  kind?: MediaKindLabel,
  limits: MediaLimitsForCopy = {},
  error?: unknown,
): string {
  const noun = kindNoun(kind);
  switch (info.code) {
    case 'type_not_allowed':
    case 'unsupported_type':
      if (kind === 'photo') return 'This photo type is not supported. Choose a JPG, PNG or WebP photo.';
      if (kind === 'video') return 'This video type is not supported. Choose an MP4 or MOV video from your phone.';
      if (kind === 'voice') return 'This recording type is not supported. Record the voice note again in the app.';
      return 'This file type is not supported.';
    case 'too_large':
    case 'chunk_too_large':
      return `This ${noun} is larger than allowed. Choose a smaller one.`;
    case 'too_long':
    case 'VOICE_TOO_LONG':
      if (kind === 'video' || (!kind && info.code === 'too_long')) {
        return `This video is longer than ${limits.videoMaxSeconds ?? 30} seconds. Trim it in your gallery, then add it again.`;
      }
      return `Voice notes can be up to ${limits.voiceMaxSeconds ?? 60} seconds. Record a shorter one.`;
    case 'duration_required':
    case 'duration_unreadable':
      return `We could not read how long this ${noun} is. ${kind === 'video' ? 'Try another video.' : 'Record it again in the app.'}`;
    case 'codec_not_supported':
      return `This ${noun} format cannot be played on other phones. ${kind === 'video' ? 'Choose another video.' : 'Record it again in the app.'}`;
    case 'location_not_removable':
      return 'This video carries location data we could not remove, so it was not added. Choose another video.';
    case 'malformed':
    case 'photo_malformed':
    case 'kind_mismatch':
      return `This ${noun} could not be read. Choose another one.`;
    case 'job_media_quota':
      return 'You have too many uploads in progress. Finish or remove some, then try again.';
    case 'job_media_storage_full':
      return 'Uploads are paused for a moment. Please try again later.';
    case 'upload_removed':
    case 'not_found':
      return `This ${noun} is no longer on our server. Remove it and add it again.`;
    case 'client_upload_id_reused':
      return `Something went wrong with this ${noun}. Remove it and add it again.`;
    case 'chunk_out_of_order':
    case 'chunk_length_mismatch':
    case 'upload_incomplete':
    case 'not_uploading':
      return `The upload of this ${noun} was interrupted. Tap to try again.`;
    case 'THREAD_READ_ONLY':
      return 'This conversation is closed. You can still read it, but not send to it.';
    case 'THREAD_NOT_FOUND':
      return 'This conversation is no longer available.';
    case 'MEDIA_INVALID':
      return `This ${noun} could not be sent here. Try again, or choose another one.`;
    case 'JOB_MEDIA_UNAVAILABLE':
      return 'One of your photos, videos or voice notes is no longer available. Remove it and add it again.';
    case 'JOB_MEDIA_LIMIT':
      return 'This request has more photos, videos or voice notes than allowed. Remove some, then send again.';
    case 'JOB_MEDIA_NOT_READY':
      return 'One of your files is still being checked. Wait a moment, then send again.';
    case 'JOB_MEDIA_ALREADY_USED':
      return 'One of your files was already sent with another request. Remove it and add it again.';
    default:
      break;
  }
  if (info.status === 0 && error !== undefined) return 'Upload paused: check your connection. Tap to try again.';
  if (info.status === 429) return 'Too many uploads at once. Wait a moment, then tap to try again.';
  if (info.status >= 500) return 'Our server could not take this file just now. Tap to try again.';
  if (info.message) return info.message;
  const fallback = `This ${noun} could not be uploaded. Tap to try again.`;
  return error === undefined ? fallback : getErrorMessage(error, fallback);
}
