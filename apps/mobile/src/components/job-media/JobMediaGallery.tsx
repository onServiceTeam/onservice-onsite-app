/**
 * D38 Milestone 2: the photos, video and voice note attached to a job
 * request (GET /api/v1/job-media/booking/:bookingId), for the customer, the
 * pros who may quote, and the booked pro.
 *
 * Links are signed and live 10 minutes. When a photo, the video or the
 * voice note fails to load (usually an expired link on a screen left open),
 * the list is fetched again once for fresh links. Photos from requests sent
 * by apps older than 1.0.4 (public links) still show.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useQuery } from '@tanstack/react-query';
import { listBookingMedia, mediaUrl, type BookingMediaItem } from '@/services/job-media.service';
import { VoiceNoteBubble } from '@/components/chat/VoiceNoteBubble';
import { LazyImage } from '@/components/ui';
import { formatClock } from '@/utils/duration';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const LINK_REFRESH_MIN_GAP_MS = 5 * 60_000;

export interface JobMediaGalleryProps {
  bookingId: string;
  /** Heading shown above the media; pass null to hide it. */
  title?: string | null;
}

function GalleryVideo({ item, onLoadError }: { item: BookingMediaItem; onLoadError: () => void }): React.ReactElement {
  const player = useVideoPlayer({ uri: mediaUrl(item.url) });
  const errorRef = useRef(onLoadError);
  errorRef.current = onLoadError;
  useEffect(() => {
    const subscription = player.addListener('statusChange', (payload: { status: string; error?: unknown }) => {
      if (payload?.status === 'error') errorRef.current();
    });
    return () => subscription.remove();
  }, [player]);
  return (
    <View style={styles.videoWrap}>
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        style={styles.video}
        accessibilityLabel={`Job video, ${formatClock(item.durationMs)}`}
      />
    </View>
  );
}

export function JobMediaGallery({ bookingId, title = 'Photos, video and voice note' }: JobMediaGalleryProps): React.ReactElement | null {
  const query = useQuery({
    queryKey: ['job-media', bookingId],
    queryFn: () => listBookingMedia(bookingId),
    enabled: !!bookingId,
    staleTime: 5 * 60_000,
  });
  // Fetch fresh links after a load failure, at most once every 5 minutes
  // (links live 10), so a file that keeps failing cannot loop the request.
  const lastRefreshRef = useRef(0);
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;
  const onLoadError = useCallback((): void => {
    const now = Date.now();
    if (lastRefreshRef.current && now - lastRefreshRef.current < LINK_REFRESH_MIN_GAP_MS) return;
    lastRefreshRef.current = now;
    void refetchRef.current();
  }, []);

  if (query.isLoading) {
    return (
      <View style={styles.loading} accessibilityLabel="Loading job photos and media">
        <ActivityIndicator size="small" color={colors.info} />
      </View>
    );
  }
  if (query.isError) {
    return <Text style={styles.empty}>The photos and media for this request could not be loaded.</Text>;
  }

  const items = query.data?.items ?? [];
  const legacy = query.data?.legacyPhotos ?? [];
  const photos = items.filter((item) => item.kind === 'photo');
  const video = items.find((item) => item.kind === 'video');
  const voice = items.find((item) => item.kind === 'voice');
  if (photos.length === 0 && legacy.length === 0 && !video && !voice) return null;

  return (
    <View style={styles.container} accessibilityLabel="Job request media">
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {photos.length > 0 || legacy.length > 0 ? (
        <View style={styles.grid}>
          {photos.map((item, index) => (
            <Image
              key={item.id}
              source={mediaUrl(item.url)}
              style={styles.photo}
              contentFit="cover"
              accessibilityLabel={`Job photo ${index + 1}`}
              onError={onLoadError}
            />
          ))}
          {legacy.map((uri, index) => (
            <LazyImage
              key={uri}
              source={uri}
              style={styles.photo}
              accessibilityLabel={`Job photo ${photos.length + index + 1}`}
            />
          ))}
        </View>
      ) : null}
      {video ? <GalleryVideo key={video.url} item={video} onLoadError={onLoadError} /> : null}
      {voice ? (
        <View style={styles.voice}>
          <VoiceNoteBubble
            mediaId={voice.id}
            url={voice.url}
            expiresAt={voice.expiresAt}
            durationMs={voice.durationMs}
            label="Customer voice note"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 96, height: 96, borderRadius: borderRadius.md, backgroundColor: colors.backgroundSecondary },
  videoWrap: { width: '100%', maxWidth: 420, aspectRatio: 16 / 9, borderRadius: borderRadius.md, overflow: 'hidden', backgroundColor: colors.text },
  video: { width: '100%', height: '100%' },
  voice: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.sm, backgroundColor: colors.surface },
  loading: { paddingVertical: spacing.md },
  empty: { ...typography.caption, color: colors.textSecondary },
});

export default JobMediaGallery;
