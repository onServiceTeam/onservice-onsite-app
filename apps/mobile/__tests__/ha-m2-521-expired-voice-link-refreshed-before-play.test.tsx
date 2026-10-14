// HA-M2-521 (D38 Milestone 2, package P5a review fix, missing coverage):
// signed media links live 10 minutes. Playing a voice note in a thread that
// has been open longer than that first asks for a fresh link
// (GET /job-media/:id/url), then plays the fresh link, instead of failing on
// the dead one.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '@/services/api';
import { VoiceNoteBubble } from '@/components/chat/VoiceNoteBubble';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __audio: audio } = require('expo-audio') as {
  __audio: { players: Array<{ source: unknown; calls: Array<{ op: string; source?: unknown }> }>; reset: () => void };
};

beforeEach(() => {
  audio.reset();
  jest.mocked(api.get).mockReset();
});

it('HA-M2-521: playing a voice note whose link expired fetches a fresh link first and plays that', async () => {
  jest.mocked(api.get).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media/media-voice-3/url') {
      return { data: { success: true, data: {
        url: '/api/v1/job-media/file/fresh-voice-3', expiresAt: '2099-01-01T00:00:00.000Z',
        kind: 'voice', mime: 'audio/mp4', durationMs: 14000,
      } } };
    }
    return { data: {} };
  }) as never);

  render(
    <VoiceNoteBubble
      mediaId="media-voice-3"
      url="/api/v1/job-media/file/old-voice-3"
      expiresAt="2026-01-01T00:00:00.000Z"
      durationMs={14000}
    />,
  );
  const player = audio.players[0]!;
  expect(String(player.source)).toMatch(/\/api\/v1\/job-media\/file\/old-voice-3$/);

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })); });

  expect(jest.mocked(api.get)).toHaveBeenCalledWith('/api/v1/job-media/media-voice-3/url');
  const ops = player.calls.map((call) => call.op);
  expect(ops.indexOf('replace')).toBeGreaterThanOrEqual(0);
  expect(ops.indexOf('replace')).toBeLessThan(ops.indexOf('play'));
  expect(String(player.calls.find((call) => call.op === 'replace')!.source)).toMatch(/\/api\/v1\/job-media\/file\/fresh-voice-3$/);
});
