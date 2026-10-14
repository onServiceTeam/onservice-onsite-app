/**
 * D38 Milestone 2: photos, one short video and one voice note for a job
 * request ("Help pros quote accurately", optional).
 *
 * Limits come from the admin settings (/api/v1/config jobMedia; 6 photos,
 * 1 video up to 30 s, 1 voice note up to 60 s by default). Each file uploads
 * privately in chunks as soon as it is added, with progress, retry and
 * remove. The form that owns `uploads` (useJobMediaUploads) sends only the
 * stored ids and waits while anything is still uploading.
 *
 * A video over the limit is refused before uploading: library picks ignore
 * videoMaxDuration on Android, and the web ignores it entirely.
 */
import React, { useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import type { JobMediaUploads, MediaItem } from '@/hooks/useJobMediaUploads';
import type { JobMediaLimits } from '@/hooks/useRequestConfig';
import type { VoiceRecording } from '@/hooks/useVoiceNoteRecorder';
import { loadImagePicker } from '@/utils/image-picker';
import { pickedFromAsset } from '@/utils/picked-media';
import { formatClock } from '@/utils/duration';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Camera, CheckCircle2, Mic, Plus, RefreshCw, Video, X } from '@/components/icons';

export interface JobMediaPickerProps {
  uploads: JobMediaUploads;
  limits: JobMediaLimits;
  disabled?: boolean;
}

function statusText(item: MediaItem): string {
  switch (item.status) {
    case 'queued': return 'Waiting to upload';
    case 'uploading': return `Uploading ${Math.round(item.progress * 100)}%`;
    case 'processing': return 'Checking the file';
    case 'stored': return 'Ready';
    case 'failed': return item.error ?? 'Not uploaded. Tap to try again.';
    default: return '';
  }
}

function ItemStatus({ item }: { item: MediaItem }): React.ReactElement | null {
  if (item.status === 'stored') return <CheckCircle2 size={16} color={colors.success} />;
  if (item.status === 'failed') return null;
  return <ActivityIndicator size="small" color={colors.info} />;
}

export function JobMediaPicker({ uploads, limits, disabled = false }: JobMediaPickerProps): React.ReactElement {
  const [notice, setNotice] = useState<string | null>(null);
  const photos = uploads.items.filter((item) => item.kind === 'photo');
  const video = uploads.items.find((item) => item.kind === 'video') ?? null;
  const voice = uploads.items.find((item) => item.kind === 'voice') ?? null;
  const photoRoom = Math.max(0, limits.maxPhotos - photos.length);
  const isWeb = Platform.OS === 'web';

  const ensureLibraryPermission = async (): Promise<boolean> => {
    if (isWeb) return true;
    const picker = loadImagePicker();
    const { status } = await picker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setNotice('Allow photo and video access for onService in your phone settings, then try again.');
      return false;
    }
    return true;
  };

  const ensureCameraPermission = async (): Promise<boolean> => {
    const picker = loadImagePicker();
    const { status } = await picker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setNotice('Allow camera access for onService in your phone settings, then try again.');
      return false;
    }
    return true;
  };

  const addPhotos = async (fromCamera: boolean): Promise<void> => {
    setNotice(null);
    if (photoRoom <= 0) return;
    try {
      if (fromCamera ? !(await ensureCameraPermission()) : !(await ensureLibraryPermission())) return;
      const picker = loadImagePicker();
      const result = fromCamera
        ? await picker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await picker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: photoRoom > 1,
          selectionLimit: photoRoom,
          quality: 0.8,
        });
      if (result.canceled || !result.assets?.length) return;
      const refused: string[] = [];
      for (const asset of result.assets.slice(0, photoRoom)) {
        const picked = pickedFromAsset(asset, 'photo', limits);
        if (picked.ok) uploads.add(picked.picked);
        else refused.push(picked.message);
      }
      if (result.assets.length > photoRoom) {
        refused.push(`You can add up to ${limits.maxPhotos} photos. The extra photos were left out.`);
      }
      if (refused.length > 0) setNotice(refused[0]!);
    } catch {
      setNotice('The photo could not be added. Try again.');
    }
  };

  const addVideo = async (fromCamera: boolean): Promise<void> => {
    setNotice(null);
    if (video) return;
    try {
      if (fromCamera ? !(await ensureCameraPermission()) : !(await ensureLibraryPermission())) return;
      const picker = loadImagePicker();
      const options = { mediaTypes: ['videos' as const], videoMaxDuration: limits.videoMaxSeconds, quality: 1 };
      const result = fromCamera ? await picker.launchCameraAsync(options) : await picker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const picked = pickedFromAsset(result.assets[0], 'video', limits);
      if (picked.ok) uploads.add(picked.picked);
      else setNotice(picked.message);
    } catch {
      setNotice('The video could not be added. Try again.');
    }
  };

  const onVoiceRecorded = (recording: VoiceRecording): void => {
    if (recording.size > limits.voiceMaxBytes) {
      setNotice('This voice note is larger than allowed. Record a shorter one.');
      return;
    }
    uploads.add({
      kind: 'voice',
      source: recording.source,
      mime: recording.mime,
      size: recording.size,
      durationMs: recording.durationMs,
      previewUri: recording.uri,
    });
  };

  const renderItemActions = (item: MediaItem, label: string): React.ReactElement => (
    <View style={styles.itemActions}>
      {item.status === 'failed' ? (
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => uploads.retry(item.localId)}
          accessibilityRole="button"
          accessibilityLabel={`Retry uploading ${label}`}
        >
          <RefreshCw size={16} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => { void uploads.remove(item.localId); }}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label}`}
      >
        <X size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {limits.maxPhotos > 0 ? (
        <View>
          <Text style={styles.label}>{`Photos (up to ${limits.maxPhotos})`}</Text>
          <View style={styles.photoGrid}>
            {photos.map((item, index) => {
              const label = `job photo ${index + 1}`;
              return (
                <View key={item.localId} style={styles.photoCell}>
                  <View
                    style={[styles.photoThumb, item.status === 'failed' && styles.failedBorder]}
                    accessibilityLabel={`Job photo ${index + 1}, ${statusText(item)}`}
                  >
                    {item.previewUri ? (
                      <Image source={{ uri: item.previewUri }} style={styles.photoImage} accessibilityLabel={`Job photo ${index + 1}`} />
                    ) : null}
                    <View style={styles.photoBadge}><ItemStatus item={item} /></View>
                  </View>
                  {renderItemActions(item, label)}
                  {item.status !== 'stored' ? (
                    <Text style={[styles.itemStatus, item.status === 'failed' && styles.errorText]} numberOfLines={3}>
                      {statusText(item)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {photoRoom > 0 ? (
              <TouchableOpacity
                style={[styles.photoThumb, styles.addTile, disabled && styles.disabled]}
                onPress={() => { void addPhotos(false); }}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Add a job photo"
              >
                <Plus size={22} color={colors.primary} />
                <Text style={styles.addText}>Add photo</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!isWeb && photoRoom > 0 ? (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => { void addPhotos(true); }}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Take a job photo with the camera"
            >
              <Camera size={16} color={colors.primary} />
              <Text style={styles.linkText}>Take a photo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.label}>{`Video (optional, up to ${limits.videoMaxSeconds} seconds)`}</Text>
        {video ? (
          <View style={[styles.itemRow, video.status === 'failed' && styles.failedBorder]} accessibilityLabel={`Job video, ${statusText(video)}`}>
            <Video size={20} color={colors.primary} />
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{`Video, ${formatClock(video.durationMs)}`}</Text>
              <Text style={[styles.itemStatus, video.status === 'failed' && styles.errorText]}>{statusText(video)}</Text>
            </View>
            <ItemStatus item={video} />
            {renderItemActions(video, 'the job video')}
          </View>
        ) : (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.outlineButton, disabled && styles.disabled]}
              onPress={() => { void addVideo(false); }}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Add a job video"
            >
              <Video size={18} color={colors.primary} />
              <Text style={styles.outlineText}>Choose a video</Text>
            </TouchableOpacity>
            {!isWeb ? (
              <TouchableOpacity
                style={[styles.outlineButton, disabled && styles.disabled]}
                onPress={() => { void addVideo(true); }}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Record a job video with the camera"
              >
                <Camera size={18} color={colors.primary} />
                <Text style={styles.outlineText}>Record a video</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>{`Voice note (optional, up to ${limits.voiceMaxSeconds} seconds)`}</Text>
        {voice ? (
          <View style={[styles.itemRow, voice.status === 'failed' && styles.failedBorder]} accessibilityLabel={`Voice note, ${statusText(voice)}`}>
            <Mic size={20} color={colors.primary} />
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{`Voice note, ${formatClock(voice.durationMs)}`}</Text>
              <Text style={[styles.itemStatus, voice.status === 'failed' && styles.errorText]}>{statusText(voice)}</Text>
            </View>
            <ItemStatus item={voice} />
            {renderItemActions(voice, 'the voice note')}
          </View>
        ) : (
          <VoiceNoteRecorder maxSeconds={limits.voiceMaxSeconds} onRecorded={onVoiceRecorded} disabled={disabled} />
        )}
      </View>

      {notice ? <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  block: { gap: spacing.sm },
  label: { ...typography.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoCell: { width: 84 },
  photoThumb: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoBadge: { position: 'absolute', top: 4, left: 4, backgroundColor: colors.surface, borderRadius: borderRadius.full, padding: 2 },
  failedBorder: { borderColor: colors.error },
  addTile: { borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 11, fontWeight: '600', color: colors.primary, marginTop: 4 },
  itemActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xs },
  iconButton: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  itemStatus: { ...typography.caption, color: colors.textSecondary },
  errorText: { color: colors.error },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, alignSelf: 'flex-start' },
  linkText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  outlineButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  outlineText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  itemText: { flex: 1 },
  itemTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  notice: { ...typography.caption, color: colors.error, lineHeight: 18 },
});

export default JobMediaPicker;
