// Bug UX-1395: the "PUBLIC WORK PROOF" eyebrow on the provider portfolio
// screen was drawn in the orange accent (#FE8A00). Orange on white is about
// 2.4:1, below the WCAG 2.2 AA minimum of 4.5:1 for small text, and Ken does
// not want orange in the brand look. The eyebrow now uses the brand blue
// (colors.primary).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '@/config/theme';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/utils/image-capture', () => ({
  isCameraCaptureAvailable: () => false,
  captureImageAsync: jest.fn(),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyPortfolio: jest.fn().mockResolvedValue([
    {
      id: 'portfolio-1',
      imageUrl: 'https://cdn.example/portfolio/aircon-cleaning.jpg',
      caption: 'Aircon deep cleaning',
    },
  ]),
  addPortfolioItem: jest.fn(),
  updatePortfolioItem: jest.fn(),
  removePortfolioItem: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({ uploadImages: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import PortfolioScreen from '../app/provider/portfolio';

// jsdom normalises a hex colour to rgb(), so normalise the expected value
// through the same property before comparing.
function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
}

it('Bug UX-1395 — the portfolio "PUBLIC WORK PROOF" eyebrow is brand blue, not the low-contrast orange accent', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <PortfolioScreen />
    </QueryClientProvider>,
  );

  const eyebrow = await screen.findByText('PUBLIC WORK PROOF');
  expect(eyebrow.style.color).toBe(cssColor(colors.primary));
  expect(eyebrow.style.color).not.toBe(cssColor(colors.accent));
});
