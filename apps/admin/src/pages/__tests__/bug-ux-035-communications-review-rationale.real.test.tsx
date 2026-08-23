import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { mockCommunicationsApi, renderCommunicationsPage } from './communications-test-fixtures';

beforeEach(mockCommunicationsApi);

it('Bug UX-035 — clearing a message report requires and submits an audit rationale', async () => {
  renderCommunicationsPage();
  fireEvent.click((await screen.findByText('Please pay me outside the app.')).closest('button')!);
  fireEvent.click(await screen.findByRole('button', { name: 'Mark reviewed' }));

  const confirm = screen.getByRole('button', { name: 'Confirm reviewed' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Review rationale'), {
    target: { value: '  No policy violation after context review.  ' },
  });
  fireEvent.click(confirm);

  await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalledWith(
    '/api/v1/admin/conversations/messages/message-1/review',
    { reviewNote: 'No policy violation after context review.' },
  ));
});
