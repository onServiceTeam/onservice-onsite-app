import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-039 — triaged feedback requires a named owner and written note before saving', async () => {
  renderFeedbackPage();

  const status = await screen.findByRole('combobox', { name: 'Tester feedback status' });
  fireEvent.change(status, { target: { value: 'triaged' } });
  const save = screen.getByRole('button', { name: 'Save triage' });
  expect(save).toBeDisabled();

  fireEvent.change(screen.getByRole('combobox', { name: 'Tester feedback owner' }), { target: { value: 'agent-1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Tester feedback triage note' }), {
    target: { value: 'Verified and linked to the wallet redirect fix.' },
  });
  expect(save).toBeEnabled();
  fireEvent.click(save);

  await waitFor(() => expect(vi.mocked(api.patch)).toHaveBeenCalledWith(
    '/api/v1/admin/feedback/feedback-1/triage',
    {
      status: 'triaged',
      assignedAdminId: 'agent-1',
      note: 'Verified and linked to the wallet redirect fix.',
    },
  ));
});
