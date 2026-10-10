import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'blob:portfolio-photo' }] }),
}));
jest.mock('@/utils/image-capture', () => ({ isCameraCaptureAvailable: () => false, captureImageAsync: jest.fn() }));
jest.mock('@/services/provider-api.service', () => ({
  getMyPortfolio: jest.fn().mockResolvedValue([]),
  addPortfolioItem: jest.fn(),
  updatePortfolioItem: jest.fn(),
  removePortfolioItem: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({ uploadImages: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

import PortfolioScreen from '../app/provider/portfolio';

it('Bug PHASE197-01 - provider portfolio caption input enforces the server 500-character limit', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <PortfolioScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText('No Portfolio Photos Yet')).toBeTruthy());
  fireEvent.click(screen.getByLabelText('Add a public work photo'));
  fireEvent.click(screen.getByLabelText('Choose a work photo from camera or photo library'));
  await waitFor(() => expect(screen.getByText('Change')).toBeTruthy());
  expect(screen.getByLabelText('Public work photo caption, optional').getAttribute('maxlength')).toBe('500');
});
