import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getTierProgression: jest.fn().mockResolvedValue({
    currentTier: 'new',
    currentCommission: 12,
    currentCommissionSource: 'provider_contract',
    currentCommissionRateVersionId: 'provider-contract-v3',
    progressionTrack: 'standard',
    promotionMode: 'admin_review',
    nextTier: null,
    progress: { totalJobs: 1, rating: 5, hasCertification: false, openDisputeCount: 0 },
    requirements: null,
    allTiers: [
      { tier: 'founding', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 10, benefits: [] },
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: [] },
    ],
    progressionTiers: [
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: [] },
    ],
  }),
}));

import TierProgressionScreen from '../app/provider/tier-progression';

it('Bug OPS-259 — provider tier screen labels the personal default agreement and tier base rates without calling either a universal live rate', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <TierProgressionScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('12% default commission')).toBeTruthy();
  expect(screen.getByText('Your provider-specific default agreement')).toBeTruthy();
  expect(screen.getByText('These are the current base rates', { exact: false })).toBeTruthy();
  expect(view.container.textContent).toContain('Each booking keeps the rate shown');
  expect(view.container.textContent).not.toMatch(/live commission/i);
});
