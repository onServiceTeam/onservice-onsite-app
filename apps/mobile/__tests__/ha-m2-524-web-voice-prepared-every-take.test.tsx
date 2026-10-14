// HA-M2-524 (D38 Milestone 2, package P5a; split out of HA-M2-203 in
// review): on the website the recorder is prepared again before every take
// (the web recorder throws its MediaRecorder away when it stops), and the
// recording is taken from the recorder's own data event, never with
// fetch(blob:), which the site's connect-src policy refuses.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Platform } from 'react-native';
import { VoiceNoteRecorder } from '@/components/job-media/VoiceNoteRecorder';
import type { VoiceRecording } from '@/hooks/useVoiceNoteRecorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __audio: audio } = require('expo-audio') as {
  __audio: {
    recorders: Array<{ calls: Array<{ op: string }>; mediaRecorder?: unknown }>;
    reset: () => void;
  };
};

const platform = Platform as { OS: string };
const originalOS = platform.OS;
const nav = globalThis.navigator as Navigator & { mediaDevices?: unknown };
const originalMediaDevices = nav.mediaDevices;
const originalFetch = globalThis.fetch;

beforeEach(() => audio.reset());
afterEach(() => {
  platform.OS = originalOS;
  Object.defineProperty(nav, 'mediaDevices', { value: originalMediaDevices, configurable: true });
  globalThis.fetch = originalFetch;
});

it('HA-M2-524: on the website each take is prepared first and the recording comes from the data event, not fetch', async () => {
  platform.OS = 'web';
  Object.defineProperty(nav, 'mediaDevices', { value: { getUserMedia: jest.fn() }, configurable: true });
  const fetchSpy = jest.fn(() => Promise.reject(new Error('fetch(blob:) is refused by connect-src')));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  const onRecorded = jest.fn<void, [VoiceRecording]>();
  render(<VoiceNoteRecorder maxSeconds={60} onRecorded={onRecorded} />);
  let dataListener: ((event: { data: Blob }) => void) | null = null;
  audio.recorders[0]!.mediaRecorder = {
    addEventListener: (_type: string, listener: (event: { data: Blob }) => void) => { dataListener = listener; },
  };

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' })); });
  act(() => { dataListener!({ data: new Blob([new Uint8Array(4000)], { type: 'audio/webm;codecs=opus' }) }); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })); });
  await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
  const recording = onRecorded.mock.calls[0]![0];
  expect(recording.source.platform).toBe('web');
  expect(recording.mime).toBe('audio/webm');
  expect(recording.size).toBe(4000);
  expect(recording.durationMs).toBe(12000);
  expect(fetchSpy).not.toHaveBeenCalled();

  // A second take: prepared again before recording.
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' })); });
  const ops = audio.recorders[0]!.calls.map((call) => call.op);
  expect(ops.filter((op) => op === 'prepare')).toHaveLength(2);
  expect(ops.lastIndexOf('prepare')).toBeLessThan(ops.lastIndexOf('record'));
});
