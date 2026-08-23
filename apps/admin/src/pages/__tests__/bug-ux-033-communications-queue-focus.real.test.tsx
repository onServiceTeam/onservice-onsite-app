import { beforeEach, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { mockCommunicationsApi, renderCommunicationsPage } from './communications-test-fixtures';

beforeEach(mockCommunicationsApi);

it('Bug UX-033 — Communications opens on the review queue and keeps focus on the reported message', async () => {
  renderCommunicationsPage();

  const reportText = await screen.findByText('Please pay me outside the app.');
  fireEvent.click(reportText.closest('button')!);

  const focusedMessage = await screen.findByText('Report reason: scam_or_off_platform');
  const messageCard = focusedMessage.closest('#moderation-message-message-1');
  expect(messageCard).toBeTruthy();
  expect(messageCard?.className).toContain('ring-2');
});
