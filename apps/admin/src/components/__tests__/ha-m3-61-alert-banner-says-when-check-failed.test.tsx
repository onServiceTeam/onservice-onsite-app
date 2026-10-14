// HA-M3-61 (D38 Milestone 3): when the alerts cannot be checked the banner
// says so ("Request alerts could not be checked") with a way to check again,
// instead of hiding, which would look like "no customer is waiting".
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'disconnected' }));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import {
  MARKETPLACE, alert, alertsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-61: a failed alert check shows "Request alerts could not be checked" and Check now loads the alerts', async () => {
  let calls = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/alerts`) throw new Error(`Unexpected GET ${url}`);
    calls += 1;
    if (calls === 1) throw new Error('Network down');
    return alertsResponse([alert({ id: 'alert-61' })]);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  expect(await screen.findByText('Request alerts could not be checked. Retrying automatically.')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Check now' }));

  expect(await screen.findByText('1 quote request alert open')).toBeInTheDocument();
  expect(screen.queryByText('Request alerts could not be checked. Retrying automatically.')).not.toBeInTheDocument();
});
