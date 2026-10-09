import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import api from '@/lib/api';
import { getFeedbackFixture, mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-874 — a failed queue transition hides the previously selected feedback record', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string, init?: { params?: Record<string, unknown> }) => {
    if (url === '/api/v1/admin/feedback' && init?.params?.status === 'triaged') {
      throw new Error('feedback source unavailable');
    }
    return getFeedbackFixture(url);
  });
  renderFeedbackPage();

  expect(await screen.findByText('Original tester submission')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Triaged 0$/i }));

  expect(await screen.findByText('Feedback queue unavailable')).toBeInTheDocument();
  expect(screen.queryByText('Original tester submission')).not.toBeInTheDocument();
  expect(screen.queryByText('Ownership and decisions')).not.toBeInTheDocument();
  expect(screen.queryByText('No feedback selected')).not.toBeInTheDocument();
});
