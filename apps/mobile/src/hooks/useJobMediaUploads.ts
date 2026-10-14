/**
 * D38 Milestone 2: chunked, resumable uploads of private job media.
 *
 * uploadPickedMedia() runs one file through the server's upload steps
 * (packages/api job-media.routes.ts):
 *   1. POST /job-media starts or resumes the upload (same clientUploadId);
 *   2. PUT /:id/chunks/:index sends each 2 MiB chunk in order, read with
 *      utils/media-chunk-reader (never the whole file in memory);
 *   3. POST /:id/complete has the server check the real file type and
 *      length and strip location data.
 * The declared size is the size of the file actually read (never the
 * picker's number, which on Android belongs to the original gallery photo).
 * No answer, a timeout, 408, 429 and 5xx retry the same step after 1, 2, 4,
 * 8 and 16 s, then the item fails with "Tap to try again". The account's
 * upload quota (429 job_media_quota) fails at once: it does not clear within
 * those retries. A 409 chunk_out_of_order jumps to the server's nextIndex. A
 * 400 or 410 fails at once (the file itself was refused).
 *
 * useJobMediaUploads() keeps a list of items for a form: one item uploads at
 * a time, each with progress (chunks done over total). Only items the server
 * stored count towards storedIds; anything still uploading blocks sending.
 * Leaving the form stops the running upload and removes unsent server copies.
 *
 * Not built: resuming a queue after the app restarts (design-media.md
 * section 8 suggests saving it in MMKV). An interrupted upload resumes while
 * the screen stays open; after a restart the person adds the file again.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  completeUpload,
  getUploadState,
  putChunk,
  removeUpload,
  startUpload,
  type JobMediaKind,
  type JobMediaPurpose,
  type UploadState,
} from '@/services/job-media.service';
import { chunkCount, openChunkReader, type ChunkReader, type MediaSource } from '@/utils/media-chunk-reader';
import { apiErrorInfo, describeMediaError, isRetryableStatus, mediaErrorCopy } from '@/utils/media-errors';
import { uuidV4 } from '@/utils/uuid';

/** Waits before each retry of the same step (milliseconds). */
export const DEFAULT_BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 16000];
/** How long to wait for the server to finish checking a file before asking again. */
const PROCESSING_WAIT_MS = 2000;
const MAX_PROCESSING_WAITS = 60;

export interface PickedMedia {
  kind: JobMediaKind;
  source: MediaSource;
  mime: string;
  /** Bytes. */
  size: number;
  /** Video and voice length in milliseconds. */
  durationMs?: number;
  width?: number;
  height?: number;
  /** What to show while it uploads (a file or blob address). */
  previewUri?: string;
  name?: string;
}

export type MediaItemStatus = 'queued' | 'uploading' | 'processing' | 'stored' | 'failed';

export interface MediaItem extends PickedMedia {
  localId: string;
  clientUploadId: string;
  status: MediaItemStatus;
  /** The server's media id once the upload has started. */
  mediaId: string | null;
  chunksDone: number;
  totalChunks: number;
  /** 0 to 1. */
  progress: number;
  error: string | null;
}

export interface UploadOptions {
  purpose: JobMediaPurpose;
  conversationId?: string;
  backoffMs?: readonly number[];
  /** For error copy only (the server enforces the real limits). */
  limits?: { videoMaxSeconds?: number; voiceMaxSeconds?: number };
  onProgress?: (chunksDone: number, totalChunks: number) => void;
  onStatus?: (status: 'uploading' | 'processing') => void;
  onMediaId?: (mediaId: string) => void;
  /** Stop between steps (the item was removed). */
  isCancelled?: () => boolean;
}

export class MediaUploadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'MediaUploadError';
  }
}

class CancelledUpload extends Error {}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** "This photo could not be read. Remove it and add it again." */
function unreadableCopy(kind: JobMediaKind): string {
  const noun = kind === 'voice' ? 'voice note' : kind;
  return `This ${noun} could not be read. Remove it and add it again.`;
}

/**
 * Temporary failures worth sending again after a short wait. The per-account
 * upload quota (429 job_media_quota) is not one of them: it frees up only
 * when other uploads finish or are removed, never within the 31 s of retries.
 */
function isRetryable(error: unknown): boolean {
  const { status, code } = apiErrorInfo(error);
  if (code === 'job_media_quota') return false;
  return isRetryableStatus(status);
}

/** Run `step`, retrying while the failure is temporary. */
async function withRetry<T>(step: () => Promise<T>, backoffMs: readonly number[], isCancelled?: () => boolean): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    if (isCancelled?.()) throw new CancelledUpload('cancelled');
    try {
      return await step();
    } catch (error) {
      if (!isRetryable(error) || attempt >= backoffMs.length) throw error;
      await sleep(backoffMs[attempt]!);
      if (isCancelled?.()) throw new CancelledUpload('cancelled');
    }
  }
}

/**
 * Upload one picked file. Resolves with the stored media id; rejects with a
 * MediaUploadError carrying plain copy for the person.
 */
export async function uploadPickedMedia(
  picked: PickedMedia,
  clientUploadId: string,
  options: UploadOptions,
): Promise<string> {
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const cancelled = options.isCancelled;
  let reader: ChunkReader | null = null;
  try {
    // Open the file first and declare ITS size. The picker's size can belong
    // to a different file (Android reports the original gallery photo, not
    // the compressed copy it hands over), and the server takes each chunk only
    // when it matches the declared size exactly.
    try {
      reader = openChunkReader(picked.source);
    } catch (error) {
      throw new MediaUploadError(unreadableCopy(picked.kind), error);
    }
    const totalBytes = reader.size;
    if (!(typeof totalBytes === 'number' && totalBytes > 0)) {
      throw new MediaUploadError(unreadableCopy(picked.kind));
    }
    let state: UploadState = await withRetry(() => startUpload({
      purpose: options.purpose,
      conversationId: options.conversationId,
      kind: picked.kind,
      mime: picked.mime,
      totalBytes,
      clientUploadId,
      durationMs: picked.kind === 'photo' ? undefined : picked.durationMs,
      width: picked.width,
      height: picked.height,
    }), backoff, cancelled);
    options.onMediaId?.(state.id);

    if (state.status === 'stored' || state.status === 'attached') return state.id;
    if (state.status === 'rejected') {
      throw new MediaUploadError(mediaErrorCopy(
        { status: 400, code: state.rejectionCode ?? 'malformed', nextIndex: null, message: null },
        picked.kind,
        options.limits,
      ));
    }

    const totalChunks = state.totalChunks || chunkCount(totalBytes, state.chunkBytes);
    let index = state.status === 'processing' ? totalChunks : state.nextIndex;
    const chunkReader: ChunkReader = reader;

    for (let round = 0; round < 3; round += 1) {
      // Send what the server is still missing, in order.
      if (index < totalChunks) {
        options.onStatus?.('uploading');
        while (index < totalChunks) {
          if (cancelled?.()) throw new CancelledUpload('cancelled');
          const chunkIndex = index;
          const bytes = await chunkReader.read(chunkIndex, state.chunkBytes);
          try {
            const progress = await withRetry(() => putChunk(state.id, chunkIndex, bytes), backoff, cancelled);
            index = Math.max(progress.nextIndex, chunkIndex + 1);
          } catch (error) {
            const info = apiErrorInfo(error);
            if (info.status === 409 && info.code === 'chunk_out_of_order' && info.nextIndex !== null) {
              index = info.nextIndex;
              continue;
            }
            if (info.status === 409 && info.code === 'not_uploading') {
              state = await withRetry(() => getUploadState(state.id), backoff, cancelled);
              if (state.status === 'stored' || state.status === 'attached') return state.id;
              if (state.status === 'processing') { index = totalChunks; break; }
            }
            throw error;
          }
          options.onProgress?.(Math.min(index, totalChunks), totalChunks);
        }
      }

      // Have the server check and store the file.
      options.onStatus?.('processing');
      for (let wait = 0; wait <= MAX_PROCESSING_WAITS; wait += 1) {
        if (cancelled?.()) throw new CancelledUpload('cancelled');
        try {
          const stored = await withRetry(() => completeUpload(state.id), backoff, cancelled);
          return stored.id;
        } catch (error) {
          const info = apiErrorInfo(error);
          if (info.status === 409 && info.code === 'processing') {
            await sleep(PROCESSING_WAIT_MS);
            continue;
          }
          if (info.status === 409 && info.code === 'upload_incomplete' && info.nextIndex !== null) {
            index = info.nextIndex;
            break;
          }
          throw error;
        }
      }
      if (index >= totalChunks) break;
    }
    throw new MediaUploadError(mediaErrorCopy(
      { status: 409, code: 'upload_incomplete', nextIndex: null, message: null },
      picked.kind,
      options.limits,
    ));
  } catch (error) {
    if (error instanceof CancelledUpload) throw error;
    if (error instanceof MediaUploadError) throw error;
    throw new MediaUploadError(describeMediaError(error, picked.kind, options.limits), error);
  } finally {
    reader?.close();
  }
}

export interface UseJobMediaUploadsOptions {
  purpose: JobMediaPurpose;
  conversationId?: string;
  backoffMs?: readonly number[];
  limits?: { videoMaxSeconds?: number; voiceMaxSeconds?: number };
}

export interface JobMediaUploads {
  items: MediaItem[];
  add: (picked: PickedMedia) => string;
  remove: (localId: string) => Promise<void>;
  retry: (localId: string) => void;
  /** Drop every failed item (the "send without them" choice). */
  removeFailed: () => void;
  /**
   * The form is sending these media ids: never remove their server copies
   * when the form closes (the request attaches them).
   */
  markSent: (mediaIds: string[]) => void;
  /** The send failed: these ids are the form's own again. */
  markUnsent: (mediaIds: string[]) => void;
  /** Server ids of the items the server stored, in the order they were added. */
  storedIds: string[];
  isUploading: boolean;
  hasFailed: boolean;
  countOf: (kind: JobMediaKind) => number;
}

/**
 * The list of uploads for one form.
 *
 * Leaving the form (unmount) stops the running upload before its next chunk
 * and removes the server copy of every upload that was not sent: unsent
 * uploads count towards the account's upload quota for 24 hours, and a
 * running video would otherwise keep spending mobile data in the background.
 */
export function useJobMediaUploads(options: UseJobMediaUploadsOptions): JobMediaUploads {
  const [items, setItems] = useState<MediaItem[]>([]);
  const itemsRef = useRef<MediaItem[]>([]);
  itemsRef.current = items;
  const runningRef = useRef<string | null>(null);
  const removedRef = useRef<Set<string>>(new Set());
  /** Server media id per item, known as soon as the upload starts. */
  const mediaIdsRef = useRef<Map<string, string>>(new Map());
  /** Media ids handed to a send (never removed here). */
  const sentRef = useRef<Set<string>>(new Set());
  /** Media ids this form already removed from the server. */
  const releasedRef = useRef<Set<string>>(new Set());
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mountedRef = useRef(true);

  /** Best-effort removal of an upload's server copy (never one being sent). */
  const releaseServerCopy = useCallback((mediaId: string | null | undefined): void => {
    if (!mediaId || sentRef.current.has(mediaId) || releasedRef.current.has(mediaId)) return;
    releasedRef.current.add(mediaId);
    void Promise.resolve()
      .then(() => removeUpload(mediaId))
      .catch(() => undefined); // the server removes unattached uploads after 24 h anyway
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const [localId, mediaId] of mediaIdsRef.current) {
        // The running upload removes its own copy once it notices the cancel.
        if (localId === runningRef.current) continue;
        releaseServerCopy(mediaId);
      }
    };
  }, [releaseServerCopy]);

  const patch = useCallback((localId: string, change: Partial<MediaItem>): void => {
    if (!mountedRef.current) return;
    setItems((previous) => previous.map((item) => (item.localId === localId ? { ...item, ...change } : item)));
  }, []);

  const run = useCallback(async (item: MediaItem): Promise<void> => {
    runningRef.current = item.localId;
    patch(item.localId, { status: 'uploading', error: null });
    const opts = optionsRef.current;
    try {
      const mediaId = await uploadPickedMedia(item, item.clientUploadId, {
        purpose: opts.purpose,
        conversationId: opts.conversationId,
        backoffMs: opts.backoffMs,
        limits: opts.limits,
        isCancelled: () => !mountedRef.current || removedRef.current.has(item.localId),
        onMediaId: (id) => {
          mediaIdsRef.current.set(item.localId, id);
          patch(item.localId, { mediaId: id });
        },
        onStatus: (status) => patch(item.localId, { status }),
        onProgress: (done, total) => patch(item.localId, {
          chunksDone: done,
          totalChunks: total,
          progress: total > 0 ? done / total : 0,
        }),
      });
      mediaIdsRef.current.set(item.localId, mediaId);
      if (!mountedRef.current || removedRef.current.has(item.localId)) {
        // Finished after the form closed or the item was removed: not wanted.
        releaseServerCopy(mediaId);
        return;
      }
      patch(item.localId, { status: 'stored', mediaId, progress: 1, error: null });
    } catch (error) {
      if (!mountedRef.current || removedRef.current.has(item.localId)) {
        releaseServerCopy(mediaIdsRef.current.get(item.localId));
        return;
      }
      patch(item.localId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'This file could not be uploaded. Tap to try again.',
      });
    } finally {
      runningRef.current = null;
      if (mountedRef.current) setItems((previous) => previous.slice());
    }
  }, [patch, releaseServerCopy]);

  // One item at a time, in the order added.
  useEffect(() => {
    if (runningRef.current) return;
    const next = items.find((item) => item.status === 'queued');
    if (next) void run(next);
  }, [items, run]);

  const add = useCallback((picked: PickedMedia): string => {
    const localId = uuidV4();
    const item: MediaItem = {
      ...picked,
      localId,
      clientUploadId: uuidV4(),
      status: 'queued',
      mediaId: null,
      chunksDone: 0,
      totalChunks: 0,
      progress: 0,
      error: null,
    };
    setItems((previous) => [...previous, item]);
    return localId;
  }, []);

  const remove = useCallback(async (localId: string): Promise<void> => {
    const item = itemsRef.current.find((candidate) => candidate.localId === localId);
    removedRef.current.add(localId);
    setItems((previous) => previous.filter((candidate) => candidate.localId !== localId));
    // Free the server copy; an attached or already removed file is left alone.
    // A running upload removes its own copy once it notices the removal.
    if (localId !== runningRef.current) {
      releaseServerCopy(mediaIdsRef.current.get(localId) ?? item?.mediaId ?? null);
    }
  }, [releaseServerCopy]);

  const retry = useCallback((localId: string): void => {
    setItems((previous) => previous.map((item) => (
      item.localId === localId && item.status === 'failed'
        ? { ...item, status: 'queued' as const, error: null }
        : item
    )));
  }, []);

  const removeFailed = useCallback((): void => {
    for (const item of itemsRef.current) {
      if (item.status === 'failed') void remove(item.localId);
    }
  }, [remove]);

  const markSent = useCallback((mediaIds: string[]): void => {
    for (const id of mediaIds) sentRef.current.add(id);
  }, []);

  const markUnsent = useCallback((mediaIds: string[]): void => {
    for (const id of mediaIds) sentRef.current.delete(id);
  }, []);

  const storedIds = useMemo(
    () => items.filter((item) => item.status === 'stored' && item.mediaId).map((item) => item.mediaId as string),
    [items],
  );
  const isUploading = items.some((item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'processing');
  const hasFailed = items.some((item) => item.status === 'failed');
  const countOf = useCallback((kind: JobMediaKind) => items.filter((item) => item.kind === kind).length, [items]);

  return { items, add, remove, retry, removeFailed, markSent, markUnsent, storedIds, isUploading, hasFailed, countOf };
}

export default useJobMediaUploads;
