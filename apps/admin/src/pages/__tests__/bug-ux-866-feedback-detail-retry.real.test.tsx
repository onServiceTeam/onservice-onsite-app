import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { getFeedbackFixture, mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-866 — feedback detail failure hides decision controls and recovers without leaving the queue', async () => {
  let detailAttempts = 0;
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/feedback/feedback-1' && detailAttempts++ === 0) {
      throw new Error('detail source unavailable');
    }
    return getFeedbackFixture(url);
  });
  renderFeedbackPage();

  expect(await screen.findByText('Feedback detail unavailable')).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Tester feedback status' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry detail' }));
  expect(await screen.findByText('Choose QR and complete payment.')).toBeInTheDocument();
  await waitFor(() => expect(detailAttempts).toBe(2));
});
