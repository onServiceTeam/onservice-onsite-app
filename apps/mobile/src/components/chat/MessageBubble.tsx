/**
 * One chat message: text, a photo with its caption under it, a voice note,
 * or a system line (quote sent, booking confirmed, a moderator removed a
 * message). The other person's real messages carry a visible "Report".
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import type { Message } from '@/services/messaging.service';
import { getMediaUrl, mediaUrl } from '@/services/job-media.service';
import { LazyImage } from '@/components/ui';
import { formatTime } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Check, CheckCheck } from '@/components/icons';
import { VoiceNoteBubble } from './VoiceNoteBubble';

export interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  accent: string;
  onReport?: (messageId: string) => void;
}

/** The caption to show under a photo or voice note, if the sender wrote one. */
export function captionOf(message: Message): string | null {
  if (message.caption !== undefined) return message.caption && message.caption.trim() ? message.caption : null;
  // Servers older than D38: the caption was the content, 'Photo' meant none.
  if (message.messageType === 'image') {
    const text = message.content?.trim();
    return text && text !== 'Photo' ? message.content : null;
  }
  return null;
}

const PHOTO_UNAVAILABLE_COPY = 'Photo unavailable. Tap to try again.';

/**
 * A private chat photo. Its signed link lives 10 minutes, and the server
 * sends no link at all when it could not sign one (url null): the photo then
 * asks for a fresh link (GET /job-media/:id/url) instead of crashing, and
 * says plainly when it still cannot be shown.
 */
function ChatPhoto({ message }: { message: Message }): React.ReactElement | null {
  const media = message.media && message.media.kind === 'photo' ? message.media : null;
  const mediaId = media?.id ?? null;
  const [uri, setUri] = useState<string | null>(() => (media?.url ? mediaUrl(media.url) : null));
  const [linkState, setLinkState] = useState<'ready' | 'loading' | 'failed'>(() => (media && !media.url ? 'loading' : 'ready'));
  const refreshedRef = useRef(false);

  const fetchLink = useCallback((): void => {
    if (!mediaId) return;
    setLinkState('loading');
    void getMediaUrl(mediaId)
      .then((fresh) => {
        const next = fresh?.url ? mediaUrl(fresh.url) : null;
        setUri(next);
        setLinkState(next ? 'ready' : 'failed');
      })
      .catch(() => setLinkState('failed'));
  }, [mediaId]);

  // No link from the server: ask for one once when the bubble first shows.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current || !mediaId || uri) return;
    askedRef.current = true;
    fetchLink();
  }, [mediaId, uri, fetchLink]);

  if (media) {
    if (linkState === 'ready' && uri) {
      const onError = (): void => {
        // Usually an expired link (10 minutes): ask for a fresh one once.
        if (refreshedRef.current) {
          setLinkState('failed');
          return;
        }
        refreshedRef.current = true;
        fetchLink();
      };
      return (
        <Image source={uri} style={styles.photo} contentFit="cover" accessibilityLabel="Chat photo" onError={onError} />
      );
    }
    if (linkState === 'loading') {
      return (
        <View style={[styles.photo, styles.photoState]} accessibilityLabel="Loading photo">
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      );
    }
    return (
      <TouchableOpacity
        style={[styles.photo, styles.photoState]}
        onPress={fetchLink}
        accessibilityRole="button"
        accessibilityLabel={PHOTO_UNAVAILABLE_COPY}
      >
        <Text style={styles.photoStateText}>{PHOTO_UNAVAILABLE_COPY}</Text>
      </TouchableOpacity>
    );
  }
  if (message.imageUrl) {
    return <LazyImage source={message.imageUrl} style={styles.photo} contentFit="cover" accessibilityLabel="Chat photo" />;
  }
  return null;
}

export function MessageBubble({ message, isMine, accent, onReport }: MessageBubbleProps): React.ReactElement {
  if (message.messageType === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
        <Text style={styles.systemTime}>{formatTime(message.createdAt)}</Text>
      </View>
    );
  }

  const isPhoto = message.messageType === 'image';
  const isVoice = message.messageType === 'voice';
  const caption = isPhoto || isVoice ? captionOf(message) : null;
  const canReport = !isMine && !!onReport;
  const bubbleColor = isMine ? { backgroundColor: accent } : styles.theirBubble;

  return (
    <View style={[styles.bubble, isMine ? styles.mine : styles.theirs, bubbleColor]}>
      {isPhoto ? <ChatPhoto message={message} /> : null}
      {isVoice && message.media ? (
        <VoiceNoteBubble
          mediaId={message.media.id}
          url={message.media.url}
          expiresAt={message.media.expiresAt}
          durationMs={message.media.durationMs}
          tone={isMine ? 'mine' : 'theirs'}
        />
      ) : null}
      {isVoice && !message.media ? (
        <Text style={[styles.text, isMine ? styles.mineText : styles.theirText]}>{message.content}</Text>
      ) : null}
      {caption ? (
        <Text style={[styles.text, styles.caption, isMine ? styles.mineText : styles.theirText]}>{caption}</Text>
      ) : null}
      {!isPhoto && !isVoice && message.content ? (
        <Text style={[styles.text, isMine ? styles.mineText : styles.theirText]}>{message.content}</Text>
      ) : null}
      <View style={styles.footer}>
        <Text style={[styles.time, isMine ? styles.mineTime : styles.theirTime]}>{formatTime(message.createdAt)}</Text>
        {isMine && (message.isRead
          ? <CheckCheck size={12} color="rgba(255,255,255,0.7)" accessibilityLabel="Read" />
          : <Check size={12} color="rgba(255,255,255,0.7)" accessibilityLabel="Sent" />)}
      </View>
      {canReport ? (
        <TouchableOpacity
          style={styles.report}
          onPress={() => onReport?.(message.id)}
          accessibilityRole="button"
          accessibilityLabel="Report this message"
        >
          <Text style={styles.reportText}>Report</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '78%', padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.sm },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  theirBubble: { backgroundColor: colors.backgroundSecondary },
  text: { ...typography.body },
  caption: { marginTop: spacing.xs },
  mineText: { color: colors.white },
  theirText: { color: colors.text },
  photo: { width: 220, height: 165, borderRadius: borderRadius.md },
  photoState: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, padding: spacing.md },
  photoStateText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: spacing.xs, gap: 4 },
  time: { ...typography.caption },
  mineTime: { color: 'rgba(255,255,255,0.7)' },
  theirTime: { color: colors.textTertiary },
  report: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  reportText: { ...typography.caption, color: colors.error, fontWeight: '700' },
  systemRow: { alignSelf: 'center', alignItems: 'center', maxWidth: '86%', marginVertical: spacing.sm },
  systemText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  systemTime: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
});

export default MessageBubble;
