// Bug UX-1396: the Inbox icon on the provider dashboard's Requests card was
// drawn in the orange accent (#FE8A00) on a pale amber tile
// (colors.warningLight, #FCF4D6). Orange on that tile is about 2.2:1, below
// the WCAG 2.2 AA minimum of 3:1 for meaningful icons, and Ken does not want
// orange in the brand look. The icon now uses the brand blue (colors.primary)
// on the pale brand-blue tile (colors.primaryLight), like the other blue icon
// tiles. A blue icon left on the amber tile looked like a warning chip next to
// the amber "Phone alerts are off" banner below the card.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '@/config/theme';

// jsdom normalises a hex colour to rgb(), so compare through the same property.
function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = value;
  return probe.style.backgroundColor;
}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { firstName: 'Roberto', lastName: 'Villanueva', role: 'provider' },
  }),
}));
jest.mock('@/components/provider/NbiStatusBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { meta: { unread: 0 } } }) },
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue({
    tier: 'verified',
    isAvailable: true,
    rating: 4.5,
    totalJobs: 22,
    acceptanceRate: 0.92,
    services: [{ id: 'service-1', subcategoryName: 'Plumbing' }],
  }),
  setAvailability: jest.fn(),
  getProviderBookings: jest.fn().mockResolvedValue({ bookings: [] }),
}));

import ProviderDashboardScreen from '../app/(provider-tabs)/dashboard';

it('Bug UX-1396 — the dashboard Requests card icon is brand blue on a pale blue tile, not the low-contrast orange on amber', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderDashboardScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText('Hello, Roberto')).toBeTruthy());
  const requestsCard = screen.getByRole('button', { name: 'Open requests' });
  const icon = requestsCard.querySelector('[data-icon="Inbox"]');
  expect(icon).not.toBeNull();
  expect(icon!.getAttribute('color')).toBe(colors.primary);
  expect(icon!.getAttribute('color')).not.toBe(colors.accent);

  const tile = icon!.parentElement as HTMLElement;
  expect(tile.style.backgroundColor).toBe(cssColor(colors.primaryLight));
  expect(tile.style.backgroundColor).not.toBe(cssColor(colors.warningLight));
});
