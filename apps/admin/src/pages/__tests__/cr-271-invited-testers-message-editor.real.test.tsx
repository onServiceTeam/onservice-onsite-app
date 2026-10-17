// CR-271 (customer review 2026-10-17, slice P2; D41 Q47; standing rule 9):
// the admin editor for the invited-testers message refuses words the server
// would refuse (over 200 characters, or with < or >) before the review step,
// and sends good words to the server. The real System Settings page renders;
// the API client is a test double holding the setting as the server lists it.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

const messageSetting = {
  id: 'invited-message', category: 'auth', subcategory: 'sign_in',
  key: 'invited_testers_message', label: 'Message for people not invited',
  description: 'Shown on the sign-in screen to a number that is not on the test-number list.',
  valueType: 'string', value: 'onService is open to invited testers for now.',
  defaultValue: 'onService is open to invited testers for now.', minValue: null, maxValue: null,
  allowedValues: null, unit: null, isSensitive: false, isDefault: true, requiresRestart: false,
  runtimeStatus: 'live', runtimeLabel: 'Live control',
  runtimeSummary: 'Within 60 seconds, people whose number is not on the test-number list see these words.',
  editable: true, updatedAt: '2026-10-18T00:00:00.000Z',
};

it('Bug CR-271 — the invited-testers message editor refuses long or marked-up words and saves plain words', async () => {
  apiMocks.get.mockResolvedValue({
    data: { data: { categories: [{ category: 'auth', count: 1 }], settings: { auth: [messageSetting] } } },
  });
  apiMocks.put.mockResolvedValue({ data: { data: { ...messageSetting, value: 'Sign-up is by invitation for now.' } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SystemSettingsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Edit setting invited_testers_message' }));
  const editor = screen.getByRole('textbox', { name: 'Value for invited_testers_message' });
  expect(editor).toHaveAttribute('maxLength', '200');
  fireEvent.change(screen.getByRole('textbox', { name: 'Audit reason for invited_testers_message' }), {
    target: { value: 'Clearer words for people who are not invited yet.' },
  });

  fireEvent.change(editor, { target: { value: 'x'.repeat(201) } });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  expect(await screen.findByText('Use 200 characters or fewer.')).toBeVisible();

  fireEvent.change(editor, { target: { value: 'Ask us for an <b>invite</b>.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  expect(await screen.findByText('Use plain text, without < or >.')).toBeVisible();
  expect(screen.queryByText('Confirm this setting change')).not.toBeInTheDocument();

  fireEvent.change(editor, { target: { value: 'Sign-up is by invitation for now.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  expect(await screen.findByText('Confirm this setting change')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await vi.waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith('/api/v1/admin/settings/invited_testers_message', {
    value: 'Sign-up is by invitation for now.',
    reason: 'Clearer words for people who are not invited yet.',
    expectedUpdatedAt: '2026-10-18T00:00:00.000Z',
  }));
});
