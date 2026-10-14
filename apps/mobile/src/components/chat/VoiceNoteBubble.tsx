/**
 * D38 Milestone 2: play a voice note (chat bubbles and the request gallery).
 *
 * Play/pause with the length as m:ss. Signed media links live 10 minutes, so
 * a link that has expired (or is about to) is swapped for a fresh one
 * (GET /job-media/:id/url) before playing. When the server sent no link at
 * all (it could not sign one), the first tap asks for one the same way.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getMediaUrl, mediaUrl } from '@/services/job-media.service';
import { formatClock, spokenDuration } from '@/utils/duration';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { PlayCircle, PauseCircle } from '@/components/icons';

/** Refresh a link that expires within this window before playing it. */
const LINK_REFRESH_MARGIN_MS = 15_000;

export interface VoiceNoteBubbleProps {
  mediaId?: string | null;
  /** null when the server could not sign a link; one is fetched on play. */
  url: string | null;
  expiresAt?: string | null;
  durationMs: number | null;
  /** 'mine' draws light text on the accent colour. */
  tone?: 'mine' | 'theirs' | 'plain';
  label?: string;
}

export function VoiceNoteBubble({
  mediaId,
  url,
  expiresAt,
  durationMs,
  tone = 'plain',
  label = 'Voice message',
}: VoiceNoteBubbleProps): React.ReactElement {
  const [initialUri] = useState(() => (url ? mediaUrl(url) : null));
  const [link, setLink] = useState<{ url: string | null; expiresAt: string | null }>({ url: url || null, expiresAt: expiresAt ?? null });
  const [failed, setFailed] = useState(false);
  const player = useAudioPlayer(initialUri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const lengthMs = durationMs ?? (status.duration > 0 ? status.duration * 1000 : null);
  const positionMs = Math.max(0, (status.currentTime ?? 0) * 1000);

  const toggle = async (): Promise<void> => {
    if (playing) {
      player.pause();
      return;
    }
    setFailed(false);
    try {
      const expiry = link.expiresAt ? Date.parse(link.expiresAt) : NaN;
      const expiring = Number.isFinite(expiry) && expiry - Date.now() < LINK_REFRESH_MARGIN_MS;
      if (!link.url || expiring) {
        if (!mediaId) {
          setFailed(true);
          return;
        }
        const fresh = await getMediaUrl(mediaId);
        const freshUri = fresh?.url ? mediaUrl(fresh.url) : null;
        if (!freshUri) {
          setFailed(true);
          return;
        }
        setLink({ url: fresh.url, expiresAt: fresh.expiresAt ?? null });
        player.replace(freshUri);
      }
      if (lengthMs && positionMs >= lengthMs - 250) await player.seekTo(0);
      player.play();
    } catch {
      setFailed(true);
    }
  };

  const textStyle = tone === 'mine' ? styles.mineText : styles.text;
  const iconColor = tone === 'mine' ? colors.white : colors.primary;
  const clock = playing && lengthMs
    ? `${formatClock(positionMs)} / ${formatClock(lengthMs)}`
    : formatClock(lengthMs);

  return (
    <View style={styles.row} accessibilityLabel={`${label}, ${spokenDuration(lengthMs)}`}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => { void toggle(); }}
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${label.toLowerCase()}` : `Play ${label.toLowerCase()}`}
      >
        {playing ? <PauseCircle size={30} color={iconColor} /> : <PlayCircle size={30} color={iconColor} />}
      </TouchableOpacity>
      <View style={styles.track}>
        <Text style={[styles.title, textStyle]}>{label}</Text>
        <Text style={[styles.clock, textStyle]}>{clock}</Text>
        {failed ? <Text style={[styles.clock, styles.error]}>Could not play. Tap to try again.</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 180 },
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.full },
  track: { flex: 1 },
  title: { ...typography.caption, fontWeight: '700' },
  clock: { ...typography.caption },
  text: { color: colors.text },
  mineText: { color: colors.white },
  error: { color: colors.error },
});

export default VoiceNoteBubble;
