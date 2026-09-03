import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { getFeedbackFixture, mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-867 — unavailable feedback decision history blocks triage until an in-place retry succeeds', async () => {
  let historyAttempts = 0;
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/feedback/feedback-1/history' && historyAttempts++ === 0) {
      throw new Error('history source unavailable');
    }
    return getFeedbackFixture(url);
  });
  renderFeedbackPage();

  expect(await screen.findByRole('button', { name: 'Retry history' }, { timeout: 5000 })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Tester feedback status' }), { target: { value: 'triaged' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Tester feedback owner' }), { target: { value: 'agent-1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Tester feedback triage note' }), {
    target: { value: 'Verified and linked to the checkout recovery work.' },
  });
  expect(screen.getByRole('button', { name: 'Save triage' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Retry history' }));
  expect(await screen.findByText('Verified the payment return problem and assigned the checkout fix.', {}, { timeout: 5000 })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save triage' })).toBeEnabled(), { timeout: 5000 });
  expect(historyAttempts).toBe(2);
});
