import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getTierProgression: jest.fn().mockResolvedValue({
    currentTier: 'verified',
    currentCommission: 13,
    progressionTrack: 'standard',
    promotionMode: 'admin_review',
    nextTier: { tier: 'pro', minJobs: 25, minRating: 4.5, requiresCertification: false, requiresZeroDisputes: true, commission: 11, benefits: ['Live commission rate: 11%'] },
    progress: { totalJobs: 18, rating: 4.6, hasCertification: false, openDisputeCount: 0 },
    requirements: {
      jobs: { current: 18, required: 25, met: false },
      rating: { current: 4.6, required: 4.5, met: true },
      certification: { required: false, met: true },
      disputes: { required: true, current: 0, met: true },
    },
    allTiers: [
      { tier: 'founding', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 10, benefits: [] },
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: [] },
      { tier: 'verified', minJobs: 5, minRating: 4, requiresCertification: false, requiresZeroDisputes: false, commission: 13, benefits: [] },
      { tier: 'pro', minJobs: 25, minRating: 4.5, requiresCertification: false, requiresZeroDisputes: true, commission: 11, benefits: ['Live commission rate: 11%'] },
      { tier: 'elite', minJobs: 100, minRating: 4.7, requiresCertification: true, requiresZeroDisputes: true, commission: 9, benefits: [] },
    ],
    progressionTiers: [
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: [] },
      { tier: 'verified', minJobs: 5, minRating: 4, requiresCertification: false, requiresZeroDisputes: false, commission: 13, benefits: [] },
      { tier: 'pro', minJobs: 25, minRating: 4.5, requiresCertification: false, requiresZeroDisputes: true, commission: 11, benefits: ['Live commission rate: 11%'] },
      { tier: 'elite', minJobs: 100, minRating: 4.7, requiresCertification: true, requiresZeroDisputes: true, commission: 9, benefits: [] },
    ],
  }),
}));

import TierProgressionScreen from '../app/provider/tier-progression';

it('Bug UX-327 — tablet and desktop browsers receive a bounded provider tier workspace with explicit admin-review guidance', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <TierProgressionScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Tablet and desktop provider tier workspace')).toBeTruthy();
  expect(screen.getByText('Tier changes are not automatic.', { exact: false })).toBeTruthy();
  expect(screen.getByText('PARALLEL INVITE-ONLY STATUS')).toBeTruthy();
  expect(screen.getByText('STANDARD LADDER')).toBeTruthy();
});
