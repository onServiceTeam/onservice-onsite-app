/**
 * D38 request media on Booking 360 (Milestone 2, package P6-M2).
 *
 * Plan: qa-frameworks/human-audit-2026-10-13/design-media.md section 9 and
 * merged.md P6. Contract: GET /api/v1/job-media/booking/:bookingId
 * (packages/api/src/routes/job-media.routes.ts, listBookingMedia in
 * job-media.service.ts) answers
 *   { items: (JobMediaDto & { url, expiresAt })[], legacyPhotos: string[] }.
 * For an admin, `items` is every ATTACHED item on the booking: the customer's
 * request media (purpose 'job_request') and the photos and voice notes sent
 * in its message threads (purpose 'chat'). Each `url` is a signed,
 * root-relative link that stops working at `expiresAt`. `legacyPhotos` are the
 * public photo URLs older app versions stored on the booking.
 *
 * Every load writes a job_media_viewed audit row per booking (and per thread
 * for thread media). So this panel:
 *   - loads only while the Evidence tab is open (Radix unmounts other tabs);
 *   - does not reload on window focus or on reconnect, and treats the data as
 *     fresh until just before the links expire (measured from the fetch), so
 *     switching tabs does not log a second view;
 *   - while the browser is offline the query is paused, and the panel says so
 *     rather than claiming nothing was attached;
 *   - after the links expire, says so and loads fresh links only when the
 *     admin asks, or when a player fails because its link had expired.
 * The server sends no codec, so a video or recording this browser cannot
 * play shows a plain note with a link to open the file in a new tab.
 * `legacyPhotos` are absolute links on the upload host (UPLOAD_BASE_URL),
 * which the admin page's image policy (nginx.conf img-src) may block; a photo
 * that fails to load shows a note and an "Open in a new tab" link.
 */
import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ImageIcon, Lock, RefreshCw } from '@/components/icons';
import {
  apiErrorCode,
  apiErrorStatus,
  earliestExpiry,
  expiredSinceFetch,
  formatMediaBytes,
  formatMediaDuration,
  MAX_AUTOMATIC_LINK_RELOADS,
  useHasExpired,
  watchableExpiry,
} from '@/lib/private-media';

export type JobMediaKind = 'photo' | 'video' | 'voice';

export interface JobMediaItem {
  id: string;
  purpose: 'job_request' | 'chat';
  kind: JobMediaKind;
  status: string;
  mime: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  url: string;
  expiresAt: string;
}

export interface BookingMediaList {
  items: JobMediaItem[];
  legacyPhotos: string[];
}

const KINDS = new Set<JobMediaKind>(['photo', 'video', 'voice']);

/** Read the API payload; anything that is not the documented shape is an error, never "no media". */
export function readBookingMediaList(raw: unknown): BookingMediaList {
  const value = raw as { items?: unknown; legacyPhotos?: unknown } | null | undefined;
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) {
    throw new Error('The request media response could not be read.');
  }
  const items = value.items.filter((item): item is JobMediaItem => {
    const row = item as Partial<JobMediaItem> | null;
    return !!row
      && typeof row.id === 'string'
      && typeof row.url === 'string'
      && row.url.length > 0
      && KINDS.has(row.kind as JobMediaKind);
  });
  const legacyPhotos = Array.isArray(value.legacyPhotos)
    ? value.legacyPhotos.filter((url): url is string => typeof url === 'string' && url.length > 0)
    : [];
  return { items, legacyPhotos };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function mediaSummary(items: JobMediaItem[]): string {
  const photos = items.filter((item) => item.kind === 'photo').length;
  const videos = items.filter((item) => item.kind === 'video').length;
  const voices = items.filter((item) => item.kind === 'voice').length;
  return [
    plural(photos, 'photo', 'photos'),
    plural(videos, 'video', 'videos'),
    plural(voices, 'voice note', 'voice notes'),
  ].join(' · ');
}

function loadErrorText(error: unknown): string {
  const code = apiErrorCode(error);
  if (code === 'media_links_unavailable') {
    return 'The server cannot create private viewing links right now because its link-signing key is not set. The files are still stored; they cannot be shown until an engineer sets the key.';
  }
  if (apiErrorStatus(error) === 404 || code === 'not_found') {
    return 'This booking was not found, so no request media can be shown.';
  }
  return getErrorMessage(error);
}

export function JobMediaPanel({ bookingId }: { bookingId: string }): React.ReactElement {
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(() => new Set());
  // Older public photo links never expire, so a failure (often the page's
  // image policy blocking the upload host) gets a note, never a reload.
  const [failedLegacyUrls, setFailedLegacyUrls] = useState<ReadonlySet<string>>(() => new Set());
  const autoRefreshedFor = useRef<number | null>(null);
  const automaticReloads = useRef(0);

  const q = useQuery({
    queryKey: ['admin-booking-job-media', bookingId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: unknown }>(
        `/api/v1/job-media/booking/${encodeURIComponent(bookingId)}`,
      );
      return readBookingMediaList(res.data?.data);
    },
    // Each load is an audited view: keep the links until just before they
    // expire (capped, since links never live longer than a few minutes).
    // TanStack adds staleTime to the fetch time (dataUpdatedAt), so the
    // freshness window is measured from the fetch, not from now.
    staleTime: (query) => {
      const expiry = earliestExpiry((query.state.data?.items ?? []).map((item) => item.expiresAt));
      if (expiry === null) return 30_000;
      return Math.min(15 * 60_000, Math.max(0, expiry - query.state.dataUpdatedAt - 30_000));
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  // TanStack pauses a query while the browser is offline: no data, no error.
  const offline = q.isPending && q.fetchStatus === 'paused';

  const items = q.data?.items ?? [];
  const legacyPhotos = q.data?.legacyPhotos ?? [];
  const expired = useHasExpired(
    watchableExpiry(earliestExpiry(items.map((item) => item.expiresAt)), q.dataUpdatedAt),
  );

  function loadFreshLinks(): void {
    setFailedUrls(new Set());
    void q.refetch();
  }

  function handleMediaError(item: JobMediaItem): void {
    if (
      expiredSinceFetch(item.expiresAt, q.dataUpdatedAt)
      && autoRefreshedFor.current !== q.dataUpdatedAt
      && automaticReloads.current < MAX_AUTOMATIC_LINK_RELOADS
      && !q.isFetching
    ) {
      // The link ran out while on screen: fetch fresh links once for this set.
      autoRefreshedFor.current = q.dataUpdatedAt;
      automaticReloads.current += 1;
      void q.refetch();
      return;
    }
    setFailedUrls((current) => new Set(current).add(item.url));
  }

  const requestItems = items.filter((item) => item.purpose !== 'chat');
  const threadItems = items.filter((item) => item.purpose === 'chat');

  return (
    <Card className="p-5" role="region" aria-labelledby={`request-media-${bookingId}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3
            id={`request-media-${bookingId}`}
            className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-2"
          >
            <Lock size={14} aria-hidden="true" /> Request photos, video and voice note
          </h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Private files the customer attached to this request, and files sent in its message threads.
            Viewing links expire after a few minutes. Each time this panel loads links, it is recorded in the audit log.
          </p>
        </div>
        {q.data && items.length > 0 && <Badge label={mediaSummary(items)} variant="info" />}
      </div>

      {offline ? (
        <p role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          This browser is offline, so the request media has not been loaded yet. It loads when the connection
          comes back. Until then this panel cannot say whether the customer attached anything.
        </p>
      ) : q.isPending ? (
        <div className="mt-3"><LoadingState /></div>
      ) : q.isError ? (
        <div role="alert" className="mt-3 flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
          <span><strong>Request media unavailable.</strong> {loadErrorText(q.error)}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void q.refetch()}>
            <RefreshCw size={14} /> Retry media
          </Button>
        </div>
      ) : items.length === 0 && legacyPhotos.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            icon={<ImageIcon size={28} />}
            title="No request media attached"
            description="No photo, video or voice note was sent with this request. Only files that finished uploading and were sent with the request appear here."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {expired && items.length > 0 && (
            <div role="status" className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
              <span>
                These viewing links have expired. Photos already on screen stay visible, but videos and voice notes
                cannot play until you load fresh links. Loading them is recorded in the audit log again.
              </span>
              <Button type="button" size="sm" variant="outline" disabled={q.isFetching} onClick={loadFreshLinks}>
                <RefreshCw size={14} /> {q.isFetching ? 'Loading links...' : 'Load fresh links'}
              </Button>
            </div>
          )}

          {requestItems.length > 0 && (
            <MediaGroup
              title="Sent with the request"
              items={requestItems}
              failedUrls={failedUrls}
              onMediaError={handleMediaError}
              onReload={loadFreshLinks}
            />
          )}
          {requestItems.length === 0 && legacyPhotos.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No photo, video or voice note was sent with the request itself.
            </p>
          )}

          {threadItems.length > 0 && (
            <MediaGroup
              title="Sent in message threads"
              items={threadItems}
              failedUrls={failedUrls}
              onMediaError={handleMediaError}
              onReload={loadFreshLinks}
            />
          )}

          {legacyPhotos.length > 0 && (
            <section aria-label="Photos from an older app version">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                Photos from an older app version
              </h4>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Saved before private request media existed, as ordinary photo links on the upload server. This page
                may not be allowed to show images from that server; if a photo does not appear, open it in a new tab.
              </p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {legacyPhotos.map((url, index) => (
                  failedLegacyUrls.has(url) ? (
                    <div
                      key={`${index}-${url}`}
                      role="alert"
                      className="rounded border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-text-secondary)] space-y-2"
                    >
                      <p>Older request photo {index + 1} could not be shown on this page.</p>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-semibold text-[var(--color-secondary)] hover:underline"
                      >
                        Open in a new tab
                      </a>
                    </div>
                  ) : (
                    <a key={`${index}-${url}`} href={url} target="_blank" rel="noreferrer noopener" className="block">
                      <img
                        src={url}
                        alt={`Older request photo ${index + 1} of ${legacyPhotos.length}`}
                        onError={() => setFailedLegacyUrls((current) => new Set(current).add(url))}
                        className="w-full h-32 object-cover rounded border border-[var(--color-border)]"
                      />
                    </a>
                  )
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}

function MediaGroup({
  title,
  items,
  failedUrls,
  onMediaError,
  onReload,
}: {
  title: string;
  items: JobMediaItem[];
  failedUrls: ReadonlySet<string>;
  onMediaError: (item: JobMediaItem) => void;
  onReload: () => void;
}): React.ReactElement {
  const photos = items.filter((item) => item.kind === 'photo');
  const videos = items.filter((item) => item.kind === 'video');
  const voices = items.filter((item) => item.kind === 'voice');

  return (
    <section aria-label={title} className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{title}</h4>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((item, index) => (
            <figure key={item.id} className="space-y-1">
              {failedUrls.has(item.url) ? (
                <MediaFallback item={item} noun="photo" onReload={onReload} />
              ) : (
                <a href={item.url} target="_blank" rel="noreferrer noopener" className="block">
                  <img
                    src={item.url}
                    alt={`${title}: photo ${index + 1} of ${photos.length}`}
                    onError={() => onMediaError(item)}
                    className="w-full h-32 object-cover rounded border border-[var(--color-border)]"
                  />
                </a>
              )}
              <figcaption className="text-[11px] text-[var(--color-text-secondary)]">
                {[formatMediaBytes(item.sizeBytes), item.width && item.height ? `${item.width} x ${item.height}` : null]
                  .filter(Boolean)
                  .join(' · ') || 'Photo'}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {videos.map((item) => (
        <figure key={item.id} className="space-y-1">
          {failedUrls.has(item.url) ? (
            <MediaFallback item={item} noun="video" onReload={onReload} />
          ) : (
            <video
              controls
              preload="metadata"
              src={item.url}
              aria-label={`${title}: video`}
              onError={() => onMediaError(item)}
              className="w-full max-w-xl rounded border border-[var(--color-border)] bg-black"
            />
          )}
          <figcaption className="text-[11px] text-[var(--color-text-secondary)]">
            {['Video', formatMediaDuration(item.durationMs), formatMediaBytes(item.sizeBytes)].filter(Boolean).join(' · ')}
          </figcaption>
        </figure>
      ))}

      {voices.map((item) => (
        <figure key={item.id} className="space-y-1">
          {failedUrls.has(item.url) ? (
            <MediaFallback item={item} noun="voice note" onReload={onReload} />
          ) : (
            <audio
              controls
              preload="none"
              src={item.url}
              aria-label={`${title}: voice note`}
              onError={() => onMediaError(item)}
              className="w-full max-w-md"
            />
          )}
          <figcaption className="text-[11px] text-[var(--color-text-secondary)]">
            {['Voice note', formatMediaDuration(item.durationMs)].filter(Boolean).join(' · ')}
          </figcaption>
        </figure>
      ))}
    </section>
  );
}

function MediaFallback({
  item,
  noun,
  onReload,
}: {
  item: JobMediaItem;
  noun: string;
  onReload: () => void;
}): React.ReactElement {
  return (
    <div role="alert" className="rounded border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-text-secondary)] space-y-2">
      <p>
        This {noun} could not be {noun === 'photo' ? 'shown' : 'played'} in this browser. Open it in a new tab to
        download it, or load fresh links.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold text-[var(--color-secondary)] hover:underline"
        >
          Open in a new tab
        </a>
        <Button type="button" size="sm" variant="ghost" onClick={onReload}>
          <RefreshCw size={13} /> Load fresh links
        </Button>
      </div>
    </div>
  );
}

export default JobMediaPanel;
