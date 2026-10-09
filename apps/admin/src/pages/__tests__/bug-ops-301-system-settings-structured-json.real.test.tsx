import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

const marketingSetting = {
  id: 'marketing-channels',
  category: 'marketing',
  subcategory: 'channels',
  key: 'marketing_channels',
  label: 'Marketing Channels',
  description: 'Channels accepted by campaign attribution.',
  valueType: 'json',
  value: '["facebook_ads","google_ads"]',
  defaultValue: '["facebook_ads","google_ads"]',
  minValue: null,
  maxValue: null,
  allowedValues: null,
  unit: null,
  isSensitive: false,
  isDefault: true,
  requiresRestart: false,
  runtimeStatus: 'live',
  runtimeLabel: 'Live control',
  runtimeSummary: 'Campaign filters consume this list after cache refresh.',
  editable: true,
  updatedAt: '2026-09-01T10:00:00.000Z',
};

const matchingSetting = {
  ...marketingSetting,
  id: 'matching-tier-bonus',
  category: 'matching',
  subcategory: 'ranking',
  key: 'matching_tier_bonus',
  label: 'Provider Tier Ranking Bonus',
  description: 'Tier bonuses used by matching.',
  value: '{"founding":0.5,"new":0,"verified":0.25,"pro":0.5,"elite":1}',
  defaultValue: '{"founding":0.5,"new":0,"verified":0.25,"pro":0.5,"elite":1}',
  runtimeSummary: 'New provider matches consume these weights after cache refresh. Existing bookings are unchanged.',
  updatedAt: '2026-09-01T11:00:00.000Z',
};

function renderSettings(
  category: 'marketing' | 'matching',
  setting: typeof marketingSetting,
): QueryClient {
  apiMocks.get.mockResolvedValue({
    data: {
      data: {
        categories: [{ category, count: 1 }],
        settings: { [category]: [setting] },
      },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/settings?category=${category}`]}>
        <SystemSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

it('OPS-301 - high-impact JSON settings use bounded operator controls and submit canonical values', async () => {
  apiMocks.put.mockResolvedValue({ data: { data: marketingSetting } });
  const marketingClient = renderSettings('marketing', marketingSetting);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit setting marketing_channels' }));
  expect(screen.getByRole('group', { name: 'Value for marketing_channels' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Marketing channel 1' })).toHaveValue('facebook_ads');
  fireEvent.click(screen.getByRole('button', { name: 'Add marketing channel' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Marketing channel 3' }), {
    target: { value: 'facebook_ads' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Audit reason for marketing_channels' }), {
    target: { value: 'Add a new measurable acquisition channel.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/unique lowercase channel slugs/i);

  fireEvent.change(screen.getByRole('textbox', { name: 'Marketing channel 3' }), {
    target: { value: 'community_partnership' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => {
    expect(apiMocks.put).toHaveBeenCalledWith('/api/v1/admin/settings/marketing_channels', {
      value: '["facebook_ads","google_ads","community_partnership"]',
      reason: 'Add a new measurable acquisition channel.',
      expectedUpdatedAt: marketingSetting.updatedAt,
    });
  });

  cleanup();
  marketingClient.clear();
  apiMocks.get.mockReset();
  apiMocks.put.mockReset();
  apiMocks.put.mockResolvedValue({ data: { data: matchingSetting } });
  const matchingClient = renderSettings('matching', matchingSetting);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit setting matching_tier_bonus' }));
  expect(screen.getByRole('group', { name: 'Value for matching_tier_bonus' })).toBeVisible();
  expect(screen.getAllByRole('spinbutton')).toHaveLength(5);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Founding tier bonus' }), {
    target: { value: '1.25' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Audit reason for matching_tier_bonus' }), {
    target: { value: 'Increase founding-provider dispatch priority.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  expect(screen.getByRole('dialog', { name: 'Confirm this setting change' })).toHaveTextContent(
    /existing bookings are unchanged/i,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => {
    expect(apiMocks.put).toHaveBeenCalledWith('/api/v1/admin/settings/matching_tier_bonus', {
      value: '{"founding":1.25,"new":0,"verified":0.25,"pro":0.5,"elite":1}',
      reason: 'Increase founding-provider dispatch priority.',
      expectedUpdatedAt: matchingSetting.updatedAt,
    });
  });

  matchingClient.clear();
});
