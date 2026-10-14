/**
 * The message box under a chat thread: text, a photo (the typed text goes
 * with it as its caption, for customers and pros alike), and a voice note.
 */
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { loadImagePicker } from '@/utils/image-picker';
import { pickedFromAsset } from '@/utils/picked-media';
import type { PickedMedia } from '@/hooks/useJobMediaUploads';
import type { VoiceRecording } from '@/hooks/useVoiceNoteRecorder';
import { VoiceNoteRecorder } from '@/components/job-media/VoiceNoteRecorder';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Camera, Mic, Send, X } from '@/components/icons';

export interface ChatComposerProps {
  accent: string;
  inputLabel: string;
  sendLabel: string;
  photoLabel: string;
  voiceMaxSeconds: number;
  photoMaxBytes: number;
  bottomInset?: number;
  onSendText: (text: string) => void;
  onSendPhoto: (picked: PickedMedia, caption: string) => void;
  onSendVoice: (recording: VoiceRecording, caption: string) => void;
  onTyping?: (text: string) => void;
}

export function ChatComposer({
  accent,
  inputLabel,
  sendLabel,
  photoLabel,
  voiceMaxSeconds,
  photoMaxBytes,
  bottomInset = 0,
  onSendText,
  onSendPhoto,
  onSendVoice,
  onTyping,
}: ChatComposerProps): React.ReactElement {
  const [text, setText] = useState('');
  const [showVoice, setShowVoice] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const trimmed = text.trim();

  const changeText = (value: string): void => {
    setText(value);
    onTyping?.(value);
  };

  const sendText = (): void => {
    if (!trimmed) return;
    onSendText(trimmed);
    setText('');
    onTyping?.('');
  };

  const pickPhoto = async (): Promise<void> => {
    setNotice(null);
    setPicking(true);
    try {
      const picker = loadImagePicker();
      if (Platform.OS !== 'web') {
        const { status } = await picker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          setNotice('Allow photo access for onService in your phone settings to send photos.');
          return;
        }
      }
      const result = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: false });
      if (result.canceled || !result.assets?.[0]) return;
      const picked = pickedFromAsset(result.assets[0], 'photo', { photoMaxBytes, videoMaxSeconds: 0, videoMaxBytes: 0 });
      if (!picked.ok) {
        setNotice(picked.message);
        return;
      }
      onSendPhoto(picked.picked, trimmed);
      setText('');
      onTyping?.('');
    } catch {
      setNotice('The photo could not be added. Try again.');
    } finally {
      setPicking(false);
    }
  };

  const onRecorded = (recording: VoiceRecording): void => {
    setShowVoice(false);
    onSendVoice(recording, trimmed);
    setText('');
    onTyping?.('');
  };

  return (
    <View style={[styles.container, { paddingBottom: bottomInset + spacing.sm }]}>
      {showVoice ? (
        <View style={styles.voicePanel}>
          <View style={styles.voiceRecorder}>
            <VoiceNoteRecorder maxSeconds={voiceMaxSeconds} onRecorded={onRecorded} accent={accent} startLabel="Record a voice note" />
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowVoice(false)}
            accessibilityRole="button"
            accessibilityLabel="Close voice note recorder"
          >
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : null}
      {notice ? <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
      <View style={styles.inputBar}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => { void pickPhoto(); }}
          disabled={picking}
          accessibilityRole="button"
          accessibilityLabel={photoLabel}
          accessibilityHint="The text you typed is sent as the photo's caption"
          accessibilityState={{ disabled: picking, busy: picking }}
        >
          <Camera size={22} color={accent} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowVoice((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel="Record a voice message"
          accessibilityState={{ expanded: showVoice }}
        >
          <Mic size={22} color={accent} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={changeText}
          placeholder="Type a message..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={2000}
          accessibilityLabel={inputLabel}
        />
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: accent }, !trimmed && styles.sendDisabled]}
          onPress={sendText}
          disabled={!trimmed}
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          accessibilityState={{ disabled: !trimmed }}
        >
          <Send size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  voicePanel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  voiceRecorder: { flex: 1 },
  notice: { ...typography.caption, color: colors.error, lineHeight: 18 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: {
    ...typography.body,
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    maxHeight: 100,
    color: colors.text,
    marginHorizontal: spacing.xs,
  },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
});

export default ChatComposer;
