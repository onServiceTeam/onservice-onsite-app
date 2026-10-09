import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn().mockResolvedValue({
  data: {
    data: {
      summaries: [],
      published: [],
      allowedConsentTypes: ['privacy_policy'],
    },
  },
}));
const apiPost = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { success: true } }));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: apiPost },
  getErrorMessage: (error: Error) => error.message,
}));

import ConsentVersionsPage from '../ConsentVersionsPage';

it('Bug UX-1049 — the publish dialog records now and schedules future material activation without a browser confirm', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}><ConsentVersionsPage /></QueryClientProvider>
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Publish a new consent version' }));
  expect(screen.getByRole('status')).toHaveTextContent(/routine version does not require customer or provider re-consent/i);

  fireEvent.click(screen.getByLabelText(/this is a material change/i));
  fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '2099-01-02' } });

  expect(screen.getByRole('status')).toHaveTextContent('Scheduled material activation');
  expect(screen.getByRole('status')).toHaveTextContent(/audit event now/i);
  expect(screen.getByRole('status')).toHaveTextContent(/not before/i);
  expect(screen.getByRole('button', { name: 'Publish and schedule' })).toBeDisabled();

  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Consent type' })).toHaveTextContent('privacy policy'));
  fireEvent.change(screen.getByLabelText('Version'), { target: { value: 'v9' } });
  fireEvent.change(screen.getByLabelText('Change summary'), {
    target: { value: 'Approved future material update for privacy policy processing.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Publish and schedule' }));

  await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
    '/api/v1/admin/compliance/consent-versions',
    expect.objectContaining({
      consentType: 'privacy_policy',
      version: 'v9',
      effectiveAt: '2099-01-01T16:00:00.000Z',
      material: true,
    }),
  ));
  expect(confirmSpy).not.toHaveBeenCalled();
});
