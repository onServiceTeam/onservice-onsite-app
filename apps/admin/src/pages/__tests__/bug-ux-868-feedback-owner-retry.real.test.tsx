import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { getFeedbackFixture, mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-868 — unavailable feedback owner directory blocks assignment until its retry succeeds', async () => {
  let ownerAttempts = 0;
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/agents' && ownerAttempts++ === 0) {
      throw new Error('owner directory unavailable');
    }
    return getFeedbackFixture(url);
  });
  renderFeedbackPage();

  const retry = await screen.findByRole('button', { name: 'Retry owners' });
  const owner = screen.getByRole('combobox', { name: 'Tester feedback owner' });
  expect(owner).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Tester feedback status' }), { target: { value: 'triaged' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Tester feedback triage note' }), {
    target: { value: 'Verified and ready for assignment to an active owner.' },
  });
  expect(screen.getByRole('button', { name: 'Save triage' })).toBeDisabled();

  fireEvent.click(retry);
  await waitFor(() => expect(owner).toBeEnabled());
  fireEvent.change(owner, { target: { value: 'agent-1' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save triage' })).toBeEnabled());
  expect(ownerAttempts).toBe(2);
});
