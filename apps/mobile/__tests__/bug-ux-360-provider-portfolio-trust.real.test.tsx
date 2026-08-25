import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) }),
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
  useResponsive: () => ({
    width: 1180,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));

import PortfolioScreen from '../app/provider/portfolio';

it('Bug UX-360 — provider portfolio presents real public proof with accessible controls and certification and review linkages', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <PortfolioScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('1 public work photo. Portfolio trust workspace.')).toBeTruthy();
  expect(screen.getByLabelText('Edit caption for Aircon deep cleaning')).toBeTruthy();
  expect(screen.getByLabelText('Remove Aircon deep cleaning')).toBeTruthy();
  expect(screen.getByLabelText('Portfolio photo: Aircon deep cleaning')).toBeTruthy();

  fireEvent.click(screen.getByLabelText('Manage provider certifications'));
  expect(mockPush).toHaveBeenCalledWith('/provider/certifications');
  fireEvent.click(screen.getByLabelText('View provider reviews'));
  expect(mockPush).toHaveBeenCalledWith('/provider/reviews');
});
