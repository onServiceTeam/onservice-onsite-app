import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import ProvidersPage from '../ProvidersPage';
import { providerId, revisionId, decisionResponse } from './helpers/provider-decision-fixture';

it('Bug UX-1313 — provider actions trap and restore focus, confirm draft discard, and retain their target during a pending or failed decision', async () => {
  const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const secondRevisionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const queue = { status: 200, ok: true, data: { success: true,
    data: [providerId, secondId].map((id, index) => ({ id, fullName: `${index === 0 ? 'first' : 'second'} applicant`, phone: 'Masked contact',
      status: 'pending', tier: 'new', rating: 0, createdAt: '2026-09-05' })),
    pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
  } };
  vi.mocked(api.get).mockImplementation(async path => (path === '/api/v1/admin/providers' ? queue
    : path.includes(secondId) ? decisionResponse(path, secondId, secondRevisionId) : decisionResponse(path)) as never);
  let failRequest!: (error: Error) => void;
  vi.mocked(api.put).mockImplementationOnce(() => new Promise((_resolve, reject) => { failRequest = reject; }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ProvidersPage /></MemoryRouter></QueryClientProvider>);
  const [trigger, otherTrigger] = await screen.findAllByRole('button', { name: 'Reject' });
  const open = async () => {
    trigger!.focus(); fireEvent.click(trigger!);
    const dialog = await screen.findByRole('dialog', { name: 'reject Provider' });
    await within(dialog).findByRole('textbox', { name: 'Rejection reason' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    return dialog;
  };
  let dialog = await open();
  const firstField = within(dialog).getByRole('button', { name: 'Reload latest submission and clear review' });
  const close = within(dialog).getByRole('button', { name: 'Close' });
  // Real Radix focus-scope handlers, not a stubbed dialog or source regex.
  act(() => { close.focus(); });
  fireEvent.keyDown(close, { key: 'Tab' });
  expect(firstField).toHaveFocus();
  fireEvent.keyDown(firstField, { key: 'Tab', shiftKey: true });
  expect(close).toHaveFocus();
  act(() => { otherTrigger!.focus(); });
  expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Discard review' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());

  dialog = await open();
  const reason = within(dialog).getByRole('textbox', { name: 'Rejection reason' });
  fireEvent.change(reason, { target: { value: 'This draft review must not be silently lost.' } });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(within(dialog).getByRole('region', { name: 'Discard unsaved provider review' })).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep reviewing' }));
  expect(reason).toHaveValue('This draft review must not be silently lost.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Discard review' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(api.put).not.toHaveBeenCalled();

  dialog = await open();
  const retryReason = within(dialog).getByRole('textbox', { name: 'Rejection reason' });
  expect(retryReason).toHaveValue('');
  fireEvent.change(retryReason, { target: { value: 'Identity evidence needs further review before admission.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  expect(within(dialog).getByRole('status')).toHaveTextContent('Saving this provider decision');
  expect(retryReason).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(within(dialog).queryByRole('region', { name: 'Discard unsaved provider review' })).not.toBeInTheDocument();
  await act(async () => { failRequest(new Error('Decision could not be saved.')); });
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Decision could not be saved.');
  expect(retryReason).toHaveValue('Identity evidence needs further review before admission.');
  expect(retryReason).toBeEnabled();
  expect(within(dialog).getByText(/first applicant/)).toBeVisible();
  expect(api.put).toHaveBeenCalledWith(`/api/v1/admin/providers/${providerId}/reject`, { reason: 'Identity evidence needs further review before admission.', expectedRevisionId: revisionId });

  vi.mocked(api.put).mockResolvedValueOnce({ status: 200, ok: true, data: { success: true } });
  // A successful decision can remove the selected row from a pending queue.
  vi.mocked(api.get).mockResolvedValueOnce({ status: 200, ok: true, data: { success: true,
    data: [{ id: secondId, fullName: 'second applicant', phone: 'Masked contact', status: 'pending', tier: 'new', rating: 0, createdAt: '2026-09-05' }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search providers by name, business, phone, email, or ID' })).toHaveFocus());
  expect(trigger).not.toBeInTheDocument();
  expect(api.put).toHaveBeenCalledTimes(2);
  fireEvent.click(otherTrigger!);
  expect(await screen.findByRole('textbox', { name: 'Rejection reason' })).toHaveValue('');
  expect(screen.queryByText('Decision could not be saved.')).not.toBeInTheDocument();
  expect(screen.getByText(/second applicant/, { selector: 'p' })).toBeVisible();
});
