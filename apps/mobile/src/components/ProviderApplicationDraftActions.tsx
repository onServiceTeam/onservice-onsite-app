import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { ConfirmModal } from '@/components/ConfirmModal';
import { colors, spacing, typography } from '@/config/theme';
import type { ApplicationDraftFields } from '@/services/provider-application-draft.service';
import {
  discardApplicationSession, isApplicationLeaseCurrent, loadApplicationSession,
  saveApplicationSession, useApplicationSession,
} from '@/stores/provider-application-session.store';

interface Props {
  fields: ApplicationDraftFields;
  onContinue?: () => void;
  validateContinue?: () => boolean;
  continueDisabled?: boolean;
  disabled?: boolean;
}

function philippineTime(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

/** Explicit actions only. Typing and navigation do not submit an application. */
export function ProviderApplicationDraftActions({
  fields, onContinue, validateContinue, continueDisabled = false, disabled = false,
}: Props): React.ReactElement {
  const session = useApplicationSession();
  const [confirmation, setConfirmation] = useState<'reload' | 'discard' | null>(null);
  const [changedDuringSave, setChangedDuringSave] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const latestFields = useRef(fields);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  latestFields.current = fields;
  const lease = session.ownerId ? { ownerId: session.ownerId, generation: session.generation } : null;
  const unavailable = disabled || session.busy || session.phase !== 'ready' || !lease;
  const unsaved = !session.savedInput || JSON.stringify(fields) !== JSON.stringify(session.savedInput);

  const save = async (continueAfter: boolean): Promise<void> => {
    if (unavailable || !lease || session.conflict) return;
    if (continueAfter && validateContinue && !validateContinue()) return;
    const snapshot = fields;
    setChangedDuringSave(false);
    try {
      await saveApplicationSession(lease, snapshot);
      if (!mounted.current || !isApplicationLeaseCurrent(lease)
        || useApplicationSession.getState().routeEpoch !== session.routeEpoch) return;
      // Do not leave a step if someone typed more while the save was in flight.
      if (JSON.stringify(latestFields.current) !== JSON.stringify(snapshot)) {
        setChangedDuringSave(true);
        return;
      }
      if (continueAfter) onContinue?.();
    } catch { /* The owner-bound session exposes the error without logging PII. */ }
  };

  const confirm = async (): Promise<void> => {
    if (!lease || !isApplicationLeaseCurrent(lease) || unavailable) return;
    const action = confirmation;
    setConfirmation(null);
    if (action === 'reload') await loadApplicationSession(lease.ownerId);
    if (action === 'discard') {
      try { await discardApplicationSession(lease); }
      catch { /* Keep the fields and display the session error. */ }
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.body} accessibilityLiveRegion="polite">
        {session.busy ? 'Saving your draft…' : unsaved ? 'You have unsaved application details.' : 'All displayed details are saved as a draft.'}
      </Text>
      {session.error && <Text style={styles.error} accessibilityRole="alert">{session.error}</Text>}
      {changedDuringSave && <Text style={styles.body} accessibilityLiveRegion="polite">Your earlier details were saved. Save your newest edits before continuing.</Text>}
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button title={session.error && !session.conflict ? 'Retry save' : 'Save draft'} variant="outline"
            disabled={unavailable || session.conflict} onPress={() => { void save(false); }} />
        </View>
        {onContinue && <View style={styles.action}>
          <Button title="Save & continue" disabled={unavailable || session.conflict || continueDisabled}
            onPress={() => { void save(true); }} />
        </View>}
      </View>
      <Text style={styles.meta}>Saving does not submit your application or accept the agreement.</Text>
      <Button title={detailsOpen ? 'Hide draft details' : 'Draft details & recovery'} variant="ghost"
        onPress={() => setDetailsOpen(value => !value)} />
      {(detailsOpen || session.conflict) && <View style={styles.section}>
        {session.draft && <Text style={styles.meta}>
          Last saved {philippineTime(session.draft.savedAt)}. Available until {philippineTime(session.draft.expiresAt)} (Philippine time).
        </Text>}
        <Text style={styles.meta}>Uploaded documents have separate retention rules. Discarding a draft does not delete those files.</Text>
        <View style={styles.actions}>
          <View style={styles.action}><Button title="Reload saved draft" variant="ghost" disabled={unavailable}
            onPress={() => setConfirmation('reload')} /></View>
          <View style={styles.action}><Button title="Discard draft" variant="ghost" disabled={unavailable || session.conflict}
            onPress={() => setConfirmation('discard')} /></View>
        </View>
      </View>}
      <ConfirmModal visible={confirmation !== null}
        title={confirmation === 'reload' ? 'Reload saved application?' : 'Discard this draft?'}
        message={confirmation === 'reload'
          ? 'This replaces your unsaved edits with the latest server draft. If that draft expired or was removed, the form will start empty.'
          : session.draft
            ? 'This removes your unsubmitted draft and clears these form details. It does not delete uploaded files, a submitted application, or other account records.'
            : 'This clears your unsaved form details on this device. No saved draft, uploaded file, submitted application, or other account record will be deleted.'}
        confirmLabel={confirmation === 'reload' ? 'Replace with saved draft' : 'Discard unsubmitted draft'}
        destructive loading={session.busy} onCancel={() => setConfirmation(null)}
        onConfirm={() => { void confirm(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  body: { ...typography.bodySmall, color: colors.text },
  meta: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.error },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 140, minWidth: 0 },
});
