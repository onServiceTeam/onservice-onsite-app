// HA-M2-203 (D38 Milestone 2, package P5a): a refused microphone permission
// shows how to allow it, and nothing records. (The plan's item 203 also named
// the 60 s limit and the web's prepare-before-every-take; review split those
// into HA-M2-523 and HA-M2-524, and the website's blocked microphone into
// HA-M2-522, one behaviour per test.)
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VoiceNoteRecorder } from '@/components/job-media/VoiceNoteRecorder';
import { VOICE_DENIED_COPY_NATIVE } from '@/hooks/useVoiceNoteRecorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __audio: audio } = require('expo-audio') as {
  __audio: {
    permission: { granted: boolean; status: string };
    recorders: Array<{ calls: Array<{ op: string }> }>;
    reset: () => void;
  };
};

beforeEach(() => audio.reset());

it('HA-M2-203: a refused microphone permission shows how to allow it and records nothing', async () => {
  audio.permission = { granted: false, status: 'denied' };
  render(<VoiceNoteRecorder maxSeconds={60} onRecorded={jest.fn()} />);

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' })); });

  expect(screen.getByText(VOICE_DENIED_COPY_NATIVE)).toBeTruthy();
  expect(VOICE_DENIED_COPY_NATIVE).toBe(
    'Voice notes need microphone access. Allow the microphone for onService in your phone settings, then try again.',
  );
  expect(audio.recorders[0]!.calls.some((call) => call.op === 'prepare' || call.op === 'record')).toBe(false);
  expect(screen.queryByRole('button', { name: 'Stop recording' })).toBeNull();
});
