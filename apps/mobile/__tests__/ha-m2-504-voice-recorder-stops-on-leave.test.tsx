// HA-M2-504 (D38 Milestone 2, package P5a review fix): closing the voice
// recorder mid-recording (the chat's X button, Back, or leaving the request
// form) stops the recording, releases the microphone and keeps nothing.
// Before, on the website expo-audio's own cleanup only cleared its 60 s
// auto-stop, so the browser kept recording with its microphone light on and
// nothing on screen could stop it.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Platform } from 'react-native';
import { VoiceNoteRecorder } from '@/components/job-media/VoiceNoteRecorder';
import type { VoiceRecording } from '@/hooks/useVoiceNoteRecorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __audio: audio } = require('expo-audio') as {
  __audio: {
    recorders: Array<{ calls: Array<{ op: string }>; mediaRecorder?: unknown }>;
    setAudioModeCalls: Array<{ allowsRecording?: boolean }>;
    reset: () => void;
  };
};

const platform = Platform as { OS: string };
const originalOS = platform.OS;
const nav = globalThis.navigator as Navigator & { mediaDevices?: unknown };
const originalMediaDevices = nav.mediaDevices;

beforeEach(() => audio.reset());
afterEach(() => {
  platform.OS = originalOS;
  Object.defineProperty(nav, 'mediaDevices', { value: originalMediaDevices, configurable: true });
});

it('HA-M2-504: leaving the recorder mid-take stops the recording, stops the microphone and keeps nothing', async () => {
  platform.OS = 'web';
  Object.defineProperty(nav, 'mediaDevices', { value: { getUserMedia: jest.fn() }, configurable: true });
  const onRecorded = jest.fn<void, [VoiceRecording]>();
  const view = render(<VoiceNoteRecorder maxSeconds={60} onRecorded={onRecorded} />);

  const microphoneTrack = { stop: jest.fn() };
  let dataListener: ((event: { data: Blob }) => void) | null = null;
  audio.recorders[0]!.mediaRecorder = {
    addEventListener: (_type: string, listener: (event: { data: Blob }) => void) => { dataListener = listener; },
    stream: { getTracks: () => [microphoneTrack] },
  };

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' })); });
  expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy();
  audio.setAudioModeCalls.length = 0;

  view.unmount();
  await act(async () => {
    // The browser hands over what it had recorded; it must be thrown away.
    dataListener?.({ data: new Blob([new Uint8Array(3000)], { type: 'audio/webm' }) });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  expect(audio.recorders[0]!.calls.map((call) => call.op)).toContain('stop');
  expect(microphoneTrack.stop).toHaveBeenCalled();
  expect(audio.setAudioModeCalls).toContainEqual({ allowsRecording: false });
  expect(onRecorded).not.toHaveBeenCalled();
});
