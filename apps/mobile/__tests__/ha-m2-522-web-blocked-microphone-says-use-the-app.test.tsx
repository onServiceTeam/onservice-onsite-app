// HA-M2-522 (D38 Milestone 2, package P5a; split out of HA-M2-203 in
// review): on the website, where the server's Permissions-Policy blocks the
// microphone until a separate server step, the voice recorder says plainly
// that voice notes are recorded in the onService app, instead of showing a
// record button that fails silently.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Platform } from 'react-native';
import { VoiceNoteRecorder } from '@/components/job-media/VoiceNoteRecorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __audio: audio } = require('expo-audio') as {
  __audio: { recorders: Array<{ calls: Array<{ op: string }> }>; reset: () => void };
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

it('HA-M2-522: with the microphone blocked on the website, the recorder says to record voice notes in the app', () => {
  platform.OS = 'web';
  // A blocked microphone: the browser offers no getUserMedia.
  Object.defineProperty(nav, 'mediaDevices', { value: undefined, configurable: true });

  render(<VoiceNoteRecorder maxSeconds={60} onRecorded={jest.fn()} />);

  expect(screen.getByText(
    'Voice notes can be recorded in the onService app. On this website, write the details or add photos instead.',
  )).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Record a voice note' })).toBeNull();
  expect(audio.recorders[0]!.calls).toEqual([]);
});
