/**
 * D38 Milestone 3 (Ken, 2026-10-13): the optional sound for new marketplace
 * request alerts (MarketplaceAlertBanner plays it on the admin socket's
 * alert:new). Plan: qa-frameworks/human-audit-2026-10-13/design-admin.md
 * section 6, "Sound".
 *
 * Rules:
 *   - Off by default. The choice is remembered in this browser only
 *     (localStorage key below). Every storage read and write is wrapped, so a
 *     private window or blocked storage simply means "off".
 *   - Browsers refuse to play audio until the person has clicked or typed on
 *     the page (autoplay rules). So the Web Audio context is created and
 *     resumed only inside a click: enableAlertSound() must be called from a
 *     click or key handler. After a reload with the sound remembered as on,
 *     nothing plays until the next click or key press anywhere on the page,
 *     which resumes the context; until then the toggle asks for that click.
 *     A click or key press on the sound controls themselves (any element
 *     inside [data-alert-sound-control]) is left to those controls, so the
 *     toggle decides from the state before the gesture: clicking "click to
 *     allow it" allows the sound instead of turning it off.
 *   - The tone is a short generated beep (no audio file, nothing loaded from
 *     the network). Beeps are at least ALERT_TONE_MIN_GAP_MS apart, so a
 *     burst of alerts (the sweep can announce up to 50 at once) plays one.
 */
import { useSyncExternalStore } from 'react';

export const ALERT_SOUND_STORAGE_KEY = 'onservice.admin.marketplaceAlertSound';

/** Put this attribute on the sound controls; the page-wide resume listener leaves their gestures alone. */
export const ALERT_SOUND_CONTROL_ATTRIBUTE = 'data-alert-sound-control';

/** The shortest time between two beeps. */
export const ALERT_TONE_MIN_GAP_MS = 10_000;

export interface AlertSoundState {
  /** The admin turned the sound on in this browser. */
  enabled: boolean;
  /** The browser allows sound right now (the audio context is running). */
  ready: boolean;
  /** This browser has no Web Audio support, so no sound can play. */
  unsupported: boolean;
}

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as Window & {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(ALERT_SOUND_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function storePreference(on: boolean): void {
  try {
    window.localStorage.setItem(ALERT_SOUND_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

let audioContext: AudioContext | null = null;
let soundState: AlertSoundState | null = null;
let resumeArmed = false;
let lastToneAt: number | null = null;
const listeners = new Set<() => void>();

function contextRunning(): boolean {
  return audioContext !== null && audioContext.state === 'running';
}

function setSoundState(change: Partial<AlertSoundState>): void {
  soundState = { ...getAlertSoundState(), ...change };
  listeners.forEach((listener) => listener());
}

function isOnSoundControl(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined'
    && target instanceof Element
    && target.closest(`[${ALERT_SOUND_CONTROL_ATTRIBUTE}]`) !== null;
}

/**
 * With the sound remembered as on, the first click or key press anywhere on
 * the page (a user gesture, so the browser allows it) resumes the audio. A
 * gesture on the sound controls is left to them (they stay armed for the
 * next gesture elsewhere).
 */
function armResumeOnNextInteraction(): void {
  if (resumeArmed || typeof document === 'undefined') return;
  resumeArmed = true;
  const resume = (event: Event): void => {
    if (isOnSoundControl(event.target)) return;
    document.removeEventListener('pointerdown', resume, true);
    document.removeEventListener('keydown', resume, true);
    resumeArmed = false;
    if (getAlertSoundState().enabled && !contextRunning()) void enableAlertSound();
  };
  document.addEventListener('pointerdown', resume, true);
  document.addEventListener('keydown', resume, true);
}

export function getAlertSoundState(): AlertSoundState {
  if (!soundState) {
    const unsupported = audioContextConstructor() === null;
    soundState = { enabled: readStoredPreference(), ready: false, unsupported };
    if (soundState.enabled && !unsupported) armResumeOnNextInteraction();
  }
  return soundState;
}

export function subscribeAlertSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Turn the sound on. Call it only from a click or key handler: the audio
 * context is created and resumed here, inside the user's gesture.
 */
export async function enableAlertSound(): Promise<void> {
  storePreference(true);
  const Constructor = audioContextConstructor();
  if (!Constructor) {
    setSoundState({ enabled: true, ready: false, unsupported: true });
    return;
  }
  try {
    if (!audioContext) {
      audioContext = new Constructor();
      audioContext.onstatechange = () => setSoundState({ ready: contextRunning() });
    }
    // resume() is started synchronously, inside the gesture.
    const resuming = audioContext.state === 'running' ? null : audioContext.resume();
    setSoundState({ enabled: true, ready: contextRunning(), unsupported: false });
    if (resuming) {
      await resuming;
      setSoundState({ ready: contextRunning() });
    }
  } catch {
    setSoundState({ enabled: true, ready: false });
  }
}

export function disableAlertSound(): void {
  storePreference(false);
  setSoundState({ enabled: false });
}

/**
 * Play the alert beep. Plays nothing (and returns false) unless the sound is
 * on and the browser already allows audio, or while the last beep is less
 * than ALERT_TONE_MIN_GAP_MS old.
 */
export function playAlertTone(): boolean {
  const { enabled } = getAlertSoundState();
  if (!enabled || !audioContext || !contextRunning()) return false;
  if (lastToneAt !== null && Date.now() - lastToneAt < ALERT_TONE_MIN_GAP_MS) return false;
  try {
    const startAt = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.35);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.4);
    lastToneAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

/** The current sound state, re-rendering when it changes. */
export function useAlertSound(): AlertSoundState {
  return useSyncExternalStore(subscribeAlertSound, getAlertSoundState, getAlertSoundState);
}
