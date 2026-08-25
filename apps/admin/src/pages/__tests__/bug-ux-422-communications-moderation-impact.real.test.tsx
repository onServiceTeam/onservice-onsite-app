import { beforeEach, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { mockCommunicationsApi, renderCommunicationsPage } from './communications-test-fixtures';

beforeEach(mockCommunicationsApi);

it('Bug UX-422 — moderation explains participant impact and confirms the audited outcome', async () => {
  renderCommunicationsPage();
  fireEvent.click((await screen.findByText('Please pay me outside the app.')).closest('button')!);
  fireEvent.click(await screen.findByRole('button', { name: 'Mark reviewed' }));

  expect(screen.getByText('Mark reviewed clears this item from the queue without hiding it from either participant.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Review rationale'), { target: { value: 'Context shows no policy violation.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm reviewed' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Report marked reviewed without hiding the message.');
});
