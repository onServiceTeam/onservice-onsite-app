import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { getFeedbackFixture, mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-865 — feedback queue failure hides false counts and stale rows and recovers in place', async () => {
  let queueAttempts = 0;
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/feedback' && queueAttempts++ === 0) {
      throw new Error('feedback source unavailable');
    }
    return getFeedbackFixture(url);
  });
  renderFeedbackPage();

  expect(await screen.findByRole('alert')).toHaveTextContent('Feedback queue unavailable');
  expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  expect(screen.queryByText('Customer tester')).not.toBeInTheDocument();
  expect(screen.queryByText('No feedback selected')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry queue' }));
  expect(await screen.findByText('Customer tester')).toBeInTheDocument();
  await waitFor(() => expect(queueAttempts).toBe(2));
});
