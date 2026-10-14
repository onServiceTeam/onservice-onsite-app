/**
 * The in-app "Report message" dialog, shared by the customer and provider
 * chats. It is a Modal, not Alert.alert, so it works on the website too
 * (react-native-web's Alert does nothing). Reporting works in read-only
 * threads as well; the report reaches the admin moderation queue.
 */
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

export type ReportReason = 'spam' | 'harassment' | 'scam_or_off_platform';

export interface ReportMessageDialogProps {
  visible: boolean;
  onReport: (reason: ReportReason) => void;
  onCancel: () => void;
}

const REASONS: Array<{ reason: ReportReason; text: string; label: string }> = [
  { reason: 'spam', text: 'Spam', label: 'Report reason spam' },
  { reason: 'harassment', text: 'Harassment or abuse', label: 'Report reason harassment or abuse' },
  { reason: 'scam_or_off_platform', text: 'Scam or asking to pay off the app', label: 'Report reason scam or off-app payment request' },
];

export function ReportMessageDialog({ visible, onReport, onCancel }: ReportMessageDialogProps): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog} accessibilityRole="alert" accessibilityLabel="Report message reason">
          <Text style={styles.title}>Report message</Text>
          <Text style={styles.copy}>
            Choose the reason that best describes the message. Our support team receives the exact message you report.
          </Text>
          {REASONS.map((item) => (
            <TouchableOpacity
              key={item.reason}
              style={styles.reason}
              onPress={() => onReport(item.reason)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Text style={styles.reasonText}>{item.text}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancel} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel message report">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(5,26,62,0.48)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialog: { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  copy: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  reason: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.base, marginBottom: spacing.sm },
  reasonText: { ...typography.body, color: colors.text, fontWeight: '600' },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  cancelText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
});

export default ReportMessageDialog;
