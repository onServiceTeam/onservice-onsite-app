/**
 * D38 Milestone 2: private job media (photos, a video and a voice note on a
 * job request; photos and voice notes in request threads).
 *
 * Server: packages/api/src/routes/job-media.routes.ts, mounted at
 * /api/v1/job-media. Uploads go in 2 MiB chunks so they resume on weak mobile
 * data and stay under the server's body limit. The server checks the real
 * file type and length itself and strips location data; these limits on the
 * phone only save a wasted upload.
 *
 * Signed `url` values are root-relative (/api/v1/job-media/file/<token>) and
 * live 10 minutes. Native apps put the API address in front (mediaUrl); the
 * web app calls the API on the same origin.
 */
import { Platform } from 'react-native';
import api from './api';
import { platformConfig } from '@/config/platform.config';

export type JobMediaKind = 'photo' | 'video' | 'voice';
export type JobMediaPurpose = 'job_request' | 'chat';
export type JobMediaStatus = 'uploading' | 'processing' | 'stored' | 'attached' | 'rejected' | 'deleted';

export interface UploadState {
  id: string;
  status: JobMediaStatus;
  kind: JobMediaKind;
  purpose: JobMediaPurpose;
  chunkBytes: number;
  totalChunks: number;
  bytesReceived: number;
  nextIndex: number;
  rejectionCode: string | null;
  limits: { bytes: number; durationMs: number | null };
}

export interface ChunkProgress {
  bytesReceived: number;
  nextIndex: number;
  complete: boolean;
}

export interface JobMediaDto {
  id: string;
  purpose: JobMediaPurpose;
  kind: JobMediaKind;
  status: JobMediaStatus;
  mime: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface MediaViewUrl {
  url: string;
  expiresAt: string;
  kind: JobMediaKind;
  mime: string;
  durationMs: number | null;
}

export interface BookingMediaItem extends JobMediaDto {
  url: string;
  expiresAt: string;
}

export interface BookingMedia {
  items: BookingMediaItem[];
  /** Public photo links from requests sent by apps older than 1.0.4. */
  legacyPhotos: string[];
}

export interface StartUploadInput {
  purpose: JobMediaPurpose;
  conversationId?: string;
  kind: JobMediaKind;
  mime: string;
  totalBytes: number;
  clientUploadId: string;
  durationMs?: number;
  width?: number;
  height?: number;
}

/** A chunk upload may take a while on weak mobile data. */
export const CHUNK_TIMEOUT_MS = 120_000;

interface Envelope<T> { success: boolean; data: T }

export async function startUpload(input: StartUploadInput): Promise<UploadState> {
  const body: Record<string, unknown> = {
    purpose: input.purpose,
    kind: input.kind,
    mime: input.mime,
    totalBytes: input.totalBytes,
    clientUploadId: input.clientUploadId,
  };
  if (input.conversationId) body.conversationId = input.conversationId;
  if (input.kind !== 'photo' && input.durationMs !== undefined) body.durationMs = input.durationMs;
  if (input.width) body.width = input.width;
  if (input.height) body.height = input.height;
  const res = await api.post<Envelope<UploadState>>('/api/v1/job-media', body);
  return res.data.data;
}

export async function putChunk(mediaId: string, index: number, bytes: Uint8Array | Blob): Promise<ChunkProgress> {
  const res = await api.put<Envelope<ChunkProgress>>(
    `/api/v1/job-media/${encodeURIComponent(mediaId)}/chunks/${index}`,
    undefined,
    { binaryBody: bytes, timeoutMs: CHUNK_TIMEOUT_MS },
  );
  return res.data.data;
}

export async function completeUpload(mediaId: string): Promise<JobMediaDto> {
  const res = await api.post<Envelope<JobMediaDto>>(
    `/api/v1/job-media/${encodeURIComponent(mediaId)}/complete`,
    undefined,
    { timeoutMs: 60_000 },
  );
  return res.data.data;
}

export async function getUploadState(mediaId: string): Promise<UploadState> {
  const res = await api.get<Envelope<UploadState>>(`/api/v1/job-media/${encodeURIComponent(mediaId)}`);
  return res.data.data;
}

export async function removeUpload(mediaId: string): Promise<void> {
  await api.delete(`/api/v1/job-media/${encodeURIComponent(mediaId)}`);
}

export async function listBookingMedia(bookingId: string): Promise<BookingMedia> {
  const res = await api.get<Envelope<BookingMedia>>(`/api/v1/job-media/booking/${encodeURIComponent(bookingId)}`);
  const data = res.data?.data;
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    legacyPhotos: Array.isArray(data?.legacyPhotos) ? data.legacyPhotos : [],
  };
}

export async function getMediaUrl(mediaId: string): Promise<MediaViewUrl> {
  const res = await api.get<Envelope<MediaViewUrl>>(`/api/v1/job-media/${encodeURIComponent(mediaId)}/url`);
  return res.data.data;
}

/**
 * A signed link the player can open. Native apps need the API address in
 * front of the root-relative link; the web app is served from the same
 * origin as the API, so the link stays relative there. A missing link (the
 * server could not sign one) gives null, never a crash.
 */
export function mediaUrl(url: string): string;
export function mediaUrl(url: string | null | undefined): string | null;
export function mediaUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (Platform.OS === 'web') return url;
  return `${platformConfig.apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Mime types the server accepts per kind (job-media.config.ts DECLARABLE_MIME_BY_KIND). */
export const ACCEPTED_MIME: Record<JobMediaKind, readonly string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/quicktime', 'video/3gpp'],
  voice: ['audio/mp4', 'audio/3gpp', 'audio/webm', 'audio/ogg'],
};

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp',
  m4a: 'audio/mp4', aac: 'audio/mp4', webm: 'audio/webm', ogg: 'audio/ogg', opus: 'audio/ogg',
};

/**
 * The mime type to declare for a picked or recorded file: the picker's own
 * type when it gave one, otherwise read from the file name. Parameters are
 * dropped ("audio/webm;codecs=opus") and m4a/jpg aliases normalised, the same
 * way the server does.
 */
export function resolveMime(kind: JobMediaKind, declared: string | null | undefined, name: string | null | undefined): string | null {
  const normalise = (value: string): string => {
    const base = value.split(';')[0]!.trim().toLowerCase();
    if (base === 'audio/x-m4a' || base === 'audio/m4a' || base === 'audio/aac') return 'audio/mp4';
    if (base === 'image/jpg') return 'image/jpeg';
    if (kind === 'voice' && base === 'video/webm') return 'audio/webm';
    if (kind === 'voice' && base === 'video/mp4') return 'audio/mp4';
    if (kind === 'voice' && base === 'video/3gpp') return 'audio/3gpp';
    return base;
  };
  if (declared) {
    const mime = normalise(declared);
    if (ACCEPTED_MIME[kind].includes(mime)) return mime;
  }
  const ext = (name ?? '').split('?')[0]!.split('.').pop()?.toLowerCase() ?? '';
  let fromName = EXTENSION_MIME[ext];
  if (fromName && kind === 'voice' && ext === '3gp') fromName = 'audio/3gpp';
  if (fromName && ACCEPTED_MIME[kind].includes(fromName)) return fromName;
  return null;
}
