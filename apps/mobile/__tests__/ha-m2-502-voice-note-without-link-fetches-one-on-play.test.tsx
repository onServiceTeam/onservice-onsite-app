// HA-M2-502 (D38 Milestone 2, package P5a review fix): a voice note whose
// message arrived with no signed link (media.url null: the server could not
// sign one) draws its bubble, and the first tap on play asks for a link
// (GET /job-media/:id/url) and plays it. Before, the phone app crashed while
// drawing the bubble (null.startsWith).
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '@/services/api';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { PROVIDER_USER_ID, messageFixture } from '../test-support/chat-fixtures';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __audio: audio } = require('expo-audio') as {
  __audio: { players: Array<{ source: unknown; calls: Array<{ op: string; source?: unknown }> }>; reset: () => void };
};

beforeEach(() => {
  audio.reset();
  jest.mocked(api.get).mockReset();
});

it('HA-M2-502: a voice note with no link renders, and play fetches a link and plays it', async () => {
  jest.mocked(api.get).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media/media-voice-7/url') {
      return { data: { success: true, data: {
        url: '/api/v1/job-media/file/fresh-voice-7', expiresAt: '2099-01-01T00:00:00.000Z',
        kind: 'voice', mime: 'audio/mp4', durationMs: 9000,
      } } };
    }
    return { data: {} };
  }) as never);

  render(
    <MessageBubble
      message={messageFixture('message-voice-7', PROVIDER_USER_ID, 'Voice message (0:09)', '2026-10-14T01:05:00.000Z', {
        messageType: 'voice',
        media: { id: 'media-voice-7', kind: 'voice', durationMs: 9000, url: null, expiresAt: null },
      })}
      isMine={false}
      accent="#1565C0"
    />,
  );

  expect(screen.getByLabelText('Voice message, 9 seconds')).toBeTruthy();
  expect(jest.mocked(api.get)).not.toHaveBeenCalled();

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })); });

  expect(jest.mocked(api.get)).toHaveBeenCalledWith('/api/v1/job-media/media-voice-7/url');
  const player = audio.players[0]!;
  const ops = player.calls.map((call) => call.op);
  expect(ops.indexOf('replace')).toBeGreaterThanOrEqual(0);
  expect(ops.indexOf('replace')).toBeLessThan(ops.indexOf('play'));
  expect(String(player.calls.find((call) => call.op === 'replace')!.source)).toMatch(/\/api\/v1\/job-media\/file\/fresh-voice-7$/);
  expect(screen.queryByText('Could not play. Tap to try again.')).toBeNull();
});
