// HA-M3-213 (D38 Milestone 3, review gap): when provider responsiveness cannot
// be loaded, the Providers tab says "Provider responsiveness could not be
// loaded" with the reason, never "No provider received a request in this
// period", and Retry asks again and shows the providers.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { ProvidersResponsivenessTab } from '@/components/marketplace/ProvidersResponsivenessTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

const providerRow = {
  providerId: 'provider-213', providerName: 'Ramon Cruz Aircon', providerStatus: 'approved', isAvailable: true,
  phone: '+63 9XX XXX 4567', contactMasked: true, invites: 4, notified: 4, viewed: 2, responded: 1,
  viewedRate: 0.5, responseRate: 0.25, medianResponseMinutes: 18, quotesAccepted: 0,
  lastActiveAt: '2026-10-13T02:00:00.000Z',
};

it('HA-M3-213: a failed Providers load shows an error with Retry, and Retry loads the providers', async () => {
  let calls = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/providers`) throw new Error(`Unexpected GET ${url}`);
    calls += 1;
    if (calls === 1) throw new Error('Database timeout');
    return { data: { success: true, data: [providerRow], meta: { total: 1, page: 1, pageSize: 25 } } };
  });

  renderWithProviders(<ProvidersResponsivenessTab />);

  expect(await screen.findByText('Provider responsiveness could not be loaded')).toBeInTheDocument();
  expect(screen.getByText('Database timeout')).toBeInTheDocument();
  expect(screen.queryByText('No provider received a request in this period')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByTestId('provider-row')).toHaveTextContent('Ramon Cruz Aircon');
  expect(calls).toBe(2);
});
