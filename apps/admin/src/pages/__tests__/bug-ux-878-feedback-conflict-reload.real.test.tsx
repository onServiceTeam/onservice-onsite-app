import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-878 — a stale feedback decision gives the operator an in-place reload path', async () => {
  vi.mocked(api.patch).mockRejectedValueOnce(Object.assign(
    new Error('This feedback submission changed after the screen was loaded.'),
    { status: 409 },
  ));
  renderFeedbackPage();

  fireEvent.change(await screen.findByRole('textbox', { name: 'Tester feedback triage note' }), {
    target: { value: 'Verified before recording the operator decision.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save triage' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('changed after the screen was loaded');
  const callsBeforeReload = vi.mocked(api.get).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest feedback' }));

  await waitFor(() => expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(callsBeforeReload));
  expect(screen.queryByRole('button', { name: 'Reload latest feedback' })).not.toBeInTheDocument();
});
