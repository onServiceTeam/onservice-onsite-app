import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getTierProgression: jest.fn().mockResolvedValue({
    currentTier: 'founding',
    currentCommission: 10,
    progressionTrack: 'founding',
    promotionMode: 'admin_review',
    nextTier: null,
    progress: { totalJobs: 12, rating: 4.8, hasCertification: true, openDisputeCount: 0 },
    requirements: null,
    allTiers: [
      { tier: 'founding', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 10, benefits: [] },
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: [] },
      { tier: 'verified', minJobs: 5, minRating: 4, requiresCertification: false, requiresZeroDisputes: false, commission: 13, benefits: [] },
      { tier: 'pro', minJobs: 25, minRating: 4.5, requiresCertification: false, requiresZeroDisputes: true, commission: 11, benefits: [] },
      { tier: 'elite', minJobs: 100, minRating: 4.7, requiresCertification: true, requiresZeroDisputes: true, commission: 9, benefits: [] },
    ],
    progressionTiers: [
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: [] },
      { tier: 'verified', minJobs: 5, minRating: 4, requiresCertification: false, requiresZeroDisputes: false, commission: 13, benefits: [] },
      { tier: 'pro', minJobs: 25, minRating: 4.5, requiresCertification: false, requiresZeroDisputes: true, commission: 11, benefits: [] },
      { tier: 'elite', minJobs: 100, minRating: 4.7, requiresCertification: true, requiresZeroDisputes: true, commission: 9, benefits: [] },
    ],
  }),
}));

import TierProgressionScreen from '../app/provider/tier-progression';

it('Bug UX-326 — Founding is presented as a parallel invite-only status instead of the highest or lowest-rate tier', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <TierProgressionScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(view.container.textContent).toContain('Founding sits beside the standard ladder'));
  expect(view.container.textContent).toContain('is not a rung above Elite');
  expect(view.container.textContent).not.toContain("You're at the highest tier");
  expect(view.container.textContent).not.toContain('lowest commission rate');
});
