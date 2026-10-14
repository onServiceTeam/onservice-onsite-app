/**
 * D38 Milestone 3: the on/off control for the new-alert sound (lib/alert-tone).
 * Shown in the alert banner and on the Marketplace page, so the sound can be
 * turned on before any alert is open. Off by default. Turning it on happens
 * inside this click, which is what lets the browser play audio later.
 *
 * Review fix: the controls sit inside [data-alert-sound-control], so the
 * page-wide "allow the sound on the next click" listener in lib/alert-tone
 * leaves their clicks alone and each click acts on the state the admin saw:
 *   - off: the click turns the sound on;
 *   - on but not yet allowed by the browser ("click to allow it"): the click
 *     allows it, and the sound stays on;
 *   - on and allowed: the click turns it off.
 * While the sound is on but not allowed (for example a browser where audio
 * cannot start at all), a separate "Turn sound off" button is always there,
 * so the sound can never get stuck on.
 */
import React from 'react';
import { Volume2, VolumeX } from '@/components/icons';
import {
  ALERT_SOUND_CONTROL_ATTRIBUTE, disableAlertSound, enableAlertSound, useAlertSound,
} from '@/lib/alert-tone';

const controlAttribute = { [ALERT_SOUND_CONTROL_ATTRIBUTE]: '' };

export function AlertSoundToggle({ compact = false }: { compact?: boolean }): React.ReactElement {
  const sound = useAlertSound();

  if (sound.unsupported) {
    return <span className="text-xs text-[var(--color-text-tertiary)]">Alert sound is not available in this browser</span>;
  }

  const waitingForClick = sound.enabled && !sound.ready;
  const label = !sound.enabled
    ? 'Alert sound off'
    : waitingForClick
      ? 'Alert sound on: click to allow it in this browser'
      : 'Alert sound on';

  return (
    <span {...controlAttribute} className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={sound.enabled}
        onClick={() => {
          if (sound.enabled && sound.ready) disableAlertSound();
          else void enableAlertSound();
        }}
        title={
          !sound.enabled
            ? 'Turn the alert sound on'
            : waitingForClick
              ? 'Allow the alert sound in this browser'
              : 'Turn the alert sound off'
        }
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${
          sound.enabled
            ? 'border-[var(--color-primary)] bg-white text-[var(--color-primary)]'
            : 'border-[var(--color-border)] bg-white text-[var(--color-text-secondary)]'
        }`}
      >
        {sound.enabled ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
        {compact && !waitingForClick ? (sound.enabled ? 'Sound on' : 'Sound off') : label}
      </button>
      {waitingForClick ? (
        <button
          type="button"
          onClick={() => disableAlertSound()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text-secondary)]"
        >
          <VolumeX size={14} aria-hidden="true" />
          Turn sound off
        </button>
      ) : null}
    </span>
  );
}
