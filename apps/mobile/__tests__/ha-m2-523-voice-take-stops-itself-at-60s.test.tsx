// HA-M2-523 (D38 Milestone 2, package P5a; split out of HA-M2-203 in
// review): a voice take records with expo-audio's forDuration set to the
// 60 s limit, so it stops by itself at the limit even if nobody taps Stop.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VoiceNoteRecorder } from '@/components/job-media/VoiceNoteRecorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __audio: audio } = require('expo-audio') as {
  __audio: {
    recorders: Array<{ calls: Array<{ op: string; options?: unknown }> }>;
    reset: () => void;
  };
};

beforeEach(() => audio.reset());

it('HA-M2-523: a voice take records with forDuration 60, so it stops itself at the limit', async () => {
  render(<VoiceNoteRecorder maxSeconds={60} onRecorded={jest.fn()} />);

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' })); });

  expect(audio.recorders[0]!.calls.find((call) => call.op === 'record')?.options).toEqual({ forDuration: 60 });
  expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy();
});
