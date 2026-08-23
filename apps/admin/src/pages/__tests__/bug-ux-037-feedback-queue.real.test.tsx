import { beforeEach, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-037 — tester feedback opens on the new queue and filters customer, provider, and admin areas', async () => {
  renderFeedbackPage();

  expect(await screen.findByRole('heading', { name: 'Tester Feedback' })).toBeTruthy();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/admin/feedback', expect.objectContaining({
    params: expect.objectContaining({ status: 'new' }),
  })));

  fireEvent.change(screen.getByRole('combobox', { name: 'Filter tester feedback by app area' }), { target: { value: 'provider' } });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/admin/feedback', expect.objectContaining({
    params: expect.objectContaining({ status: 'new', area: 'provider' }),
  })));
  expect(screen.getByRole('option', { name: 'Customer' })).toBeTruthy();
  expect(screen.getByRole('option', { name: 'Provider' })).toBeTruthy();
  expect(screen.getByRole('option', { name: 'Admin' })).toBeTruthy();
});
