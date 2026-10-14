/**
 * D38 Milestone 2: record one voice note (job requests and request threads).
 *
 * - expo-audio HIGH_QUALITY preset in mono at 64 kbps (AAC in .m4a on
 *   phones, WebM/Opus in the browser). Never LOW_QUALITY: on Android it
 *   records AMR in .3gp, which browsers and the server refuse.
 * - Permission comes first; a refusal shows how to allow it.
 * - Recording is switched on for the take and off again afterwards, or iOS
 *   would play everything through the earpiece.
 * - prepareToRecordAsync() runs before EVERY take: the web recorder throws
 *   its MediaRecorder away when it stops.
 * - record({ forDuration }) stops by itself at the limit (60 s by default).
 *
 * On the website the microphone is blocked by the server's
 * Permissions-Policy until a separate nginx step ships, so a blocked or
 * missing microphone is detected and explained instead of failing silently.
 *
 * Web capture: the recorder only exposes a blob: address, and the web app's
 * connect-src policy is 'self', so fetch(blob:) is refused. The recording's
 * Blob is taken from the recorder's own MediaRecorder `dataavailable` event
 * instead (fetch stays as a last resort).
 *
 * Leaving mid-take (the chat's close button, Back, another screen) stops the
 * recording and throws the take away. On the web, expo-audio's own cleanup
 * only clears its 60 s auto-stop, so the microphone would otherwise keep
 * recording with no way to stop it. The microphone tracks are stopped too,
 * and recording mode is switched off again (iOS plays through the earpiece
 * while it is on).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { resolveMime } from '@/services/job-media.service';
import type { MediaSource } from '@/utils/media-chunk-reader';

export type VoiceRecorderState = 'idle' | 'starting' | 'recording' | 'stopping' | 'unavailable' | 'denied' | 'error';

export interface VoiceRecording {
  source: MediaSource;
  /** A playable address (file:// on phones, blob: on the web). */
  uri: string;
  mime: string;
  size: number;
  durationMs: number;
}

export const VOICE_UNAVAILABLE_COPY =
  'Voice notes can be recorded in the onService app. On this website, write the details or add photos instead.';
export const VOICE_DENIED_COPY_NATIVE =
  'Voice notes need microphone access. Allow the microphone for onService in your phone settings, then try again.';
export const VOICE_DENIED_COPY_WEB =
  'Your browser blocked the microphone. Allow it for this site, or record the voice note in the onService app.';
export const VOICE_ERROR_COPY = 'The voice note could not be recorded. Try again.';

export const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

interface WebMediaRecorderLike {
  addEventListener: (type: 'dataavailable', listener: (event: { data: Blob }) => void) => void;
  stream?: { getTracks?: () => Array<{ stop?: () => void }> } | null;
}

/** Stop the microphone tracks behind a web MediaRecorder (best effort). */
function stopWebTracks(mediaRecorder: WebMediaRecorderLike | null): void {
  if (Platform.OS !== 'web' || !mediaRecorder) return;
  try {
    for (const track of mediaRecorder.stream?.getTracks?.() ?? []) track.stop?.();
  } catch { /* the recorder already released the microphone */ }
}

/** True when the browser will refuse the microphone before asking. */
export function isWebMicrophoneBlocked(): boolean {
  if (Platform.OS !== 'web') return false;
  const doc = (globalThis as unknown as { document?: Record<string, unknown> }).document;
  const policy = (doc?.permissionsPolicy ?? doc?.featurePolicy) as { allowsFeature?: (name: string) => boolean } | undefined;
  if (policy && typeof policy.allowsFeature === 'function') {
    try {
      if (!policy.allowsFeature('microphone')) return true;
    } catch { /* fall through to the device check */ }
  }
  const nav = (globalThis as { navigator?: { mediaDevices?: { getUserMedia?: unknown } } }).navigator;
  return typeof nav?.mediaDevices?.getUserMedia !== 'function';
}

function isPermissionError(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
}

export interface UseVoiceNoteRecorder {
  state: VoiceRecorderState;
  /** Length of the take so far, in milliseconds. */
  elapsedMs: number;
  maxMs: number;
  /** Plain copy for unavailable, denied and error states. */
  message: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

export function useVoiceNoteRecorder(options: {
  maxSeconds: number;
  onRecorded: (recording: VoiceRecording) => void;
}): UseVoiceNoteRecorder {
  const maxMs = Math.max(1, Math.round(options.maxSeconds)) * 1000;
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [state, setState] = useState<VoiceRecorderState>(() => (isWebMicrophoneBlocked() ? 'unavailable' : 'idle'));
  const [message, setMessage] = useState<string | null>(() => (isWebMicrophoneBlocked() ? VOICE_UNAVAILABLE_COPY : null));
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef(0);
  const maxSeenRef = useRef(0);
  const finishingRef = useRef(false);
  // Each take is finished once, whether it stopped at the limit or on Stop.
  const takeRef = useRef(0);
  const finishedTakeRef = useRef(0);
  const webBlobRef = useRef<Blob | null>(null);
  const webMediaRecorderRef = useRef<WebMediaRecorderLike | null>(null);
  /** The screen with the recorder has gone: no take may start or be kept. */
  const disposedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onRecordedRef = useRef(options.onRecorded);
  onRecordedRef.current = options.onRecorded;

  useEffect(() => {
    if (state !== 'recording') return;
    const reported = recorderState.durationMillis ?? 0;
    maxSeenRef.current = Math.max(maxSeenRef.current, reported);
    setElapsedMs(Math.min(maxMs, Math.max(reported, Date.now() - startedAtRef.current)));
  }, [recorderState.durationMillis, state, maxMs]);

  const finish = useCallback(async (): Promise<void> => {
    const take = takeRef.current;
    if (finishingRef.current || finishedTakeRef.current === take) return;
    finishingRef.current = true;
    setState('stopping');
    try {
      // Wait briefly for the file (the web recorder hands it over after stop).
      let uri: string | null = recorder.uri ?? null;
      for (let i = 0; i < 20 && !uri && !webBlobRef.current; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        uri = recorder.uri ?? null;
      }
      const reported = recorder.getStatus?.().durationMillis ?? 0;
      const wallClock = Date.now() - startedAtRef.current;
      const durationMs = Math.min(maxMs, Math.max(1, Math.round(reported > 0 ? reported : Math.max(maxSeenRef.current, wallClock))));

      let recording: VoiceRecording | null = null;
      if (Platform.OS === 'web') {
        let blob = webBlobRef.current;
        if (!blob && uri) {
          try { blob = await (await fetch(uri)).blob(); } catch { blob = null; }
        }
        const mime = blob ? resolveMime('voice', blob.type || 'audio/webm', null) : null;
        if (blob && mime && blob.size > 0) {
          recording = { source: { platform: 'web', blob }, uri: uri ?? '', mime, size: blob.size, durationMs };
        }
      } else if (uri) {
        const size = new File(uri).size;
        const mime = resolveMime('voice', null, uri);
        if (mime && size > 0) recording = { source: { platform: 'native', uri }, uri, mime, size, durationMs };
      }

      // Left during the stop: the take is thrown away.
      if (disposedRef.current) return;
      if (!recording) {
        setState('error');
        setMessage(VOICE_ERROR_COPY);
        return;
      }
      setState('idle');
      setMessage(null);
      setElapsedMs(0);
      onRecordedRef.current(recording);
    } finally {
      finishedTakeRef.current = take;
      finishingRef.current = false;
      try { await setAudioModeAsync({ allowsRecording: false }); } catch { /* playback still works */ }
    }
  }, [recorder, maxMs]);

  // The recorder stops by itself at the limit (forDuration).
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (recorderState.isRecording) {
      wasRecordingRef.current = true;
      return;
    }
    if (wasRecordingRef.current && stateRef.current === 'recording') {
      wasRecordingRef.current = false;
      void finish();
    }
  }, [recorderState.isRecording, finish]);

  const start = useCallback(async (): Promise<void> => {
    if (stateRef.current === 'recording' || stateRef.current === 'starting' || stateRef.current === 'stopping') return;
    if (isWebMicrophoneBlocked()) {
      setState('unavailable');
      setMessage(VOICE_UNAVAILABLE_COPY);
      return;
    }
    setState('starting');
    setMessage(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission?.granted) {
        setState('denied');
        setMessage(Platform.OS === 'web' ? VOICE_DENIED_COPY_WEB : VOICE_DENIED_COPY_NATIVE);
        return;
      }
      if (disposedRef.current) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      // Every take: the web recorder discards its MediaRecorder on stop.
      await recorder.prepareToRecordAsync();
      webBlobRef.current = null;
      maxSeenRef.current = 0;
      wasRecordingRef.current = false;
      webMediaRecorderRef.current = null;
      if (Platform.OS === 'web') {
        const internal = (recorder as unknown as { mediaRecorder?: WebMediaRecorderLike | null }).mediaRecorder;
        webMediaRecorderRef.current = internal ?? null;
        internal?.addEventListener('dataavailable', (event) => { webBlobRef.current = event.data; });
      }
      if (disposedRef.current) {
        // Left while the microphone was being opened: close it, record nothing.
        stopWebTracks(webMediaRecorderRef.current);
        try { await setAudioModeAsync({ allowsRecording: false }); } catch { /* ignore */ }
        return;
      }
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      takeRef.current += 1;
      recorder.record({ forDuration: Math.round(maxMs / 1000) });
      setState('recording');
    } catch (error) {
      if (isPermissionError(error)) {
        setState('denied');
        setMessage(Platform.OS === 'web' ? VOICE_DENIED_COPY_WEB : VOICE_DENIED_COPY_NATIVE);
      } else {
        setState('error');
        setMessage(VOICE_ERROR_COPY);
      }
      try { await setAudioModeAsync({ allowsRecording: false }); } catch { /* ignore */ }
    }
  }, [recorder, maxMs]);

  const stop = useCallback(async (): Promise<void> => {
    if (stateRef.current !== 'recording') return;
    try {
      await recorder.stop();
    } catch {
      // Already stopped at the limit; finish() reads what was recorded.
    }
    wasRecordingRef.current = false;
    await finish();
  }, [recorder, finish]);

  // Leaving mid-take: stop the recording, keep nothing, release the microphone.
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      const current = stateRef.current;
      if (current !== 'recording' && current !== 'starting' && current !== 'stopping') return;
      finishedTakeRef.current = takeRef.current;
      try {
        void Promise.resolve(recorder.stop()).catch(() => undefined);
      } catch { /* already stopped, or the native recorder was already released */ }
      stopWebTracks(webMediaRecorderRef.current);
      void Promise.resolve()
        .then(() => setAudioModeAsync({ allowsRecording: false }))
        .catch(() => undefined);
    };
  }, [recorder]);

  const reset = useCallback((): void => {
    if (isWebMicrophoneBlocked()) {
      setState('unavailable');
      setMessage(VOICE_UNAVAILABLE_COPY);
      return;
    }
    setState('idle');
    setMessage(null);
    setElapsedMs(0);
  }, []);

  return { state, elapsedMs, maxMs, message, start, stop, reset };
}

export default useVoiceNoteRecorder;
