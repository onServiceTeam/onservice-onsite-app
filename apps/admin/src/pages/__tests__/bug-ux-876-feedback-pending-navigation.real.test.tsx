import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { feedbackRecord, mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-876 — feedback navigation stays locked to the record while its triage save is pending', async () => {
  let finishSave: ((value: never) => void) | undefined;
  vi.mocked(api.patch).mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
  renderFeedbackPage();

  fireEvent.change(await screen.findByRole('textbox', { name: 'Tester feedback triage note' }), {
    target: { value: 'Verified before keeping this record selected.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save triage' }));

  await waitFor(() => expect(screen.getByRole('button', { name: /Customer tester/i })).toBeDisabled());
  expect(screen.getByRole('button', { name: /^Triaged 0$/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();

  finishSave?.({
    data: {
      success: true,
      data: { ...feedbackRecord, triageNote: 'Verified before keeping this record selected.' },
    },
  } as never);

  await waitFor(() => expect(screen.getByRole('button', { name: /Customer tester/i })).toBeEnabled());
});
