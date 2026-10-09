import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUploadImages = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'blob:portfolio-photo' }],
  }),
}));
jest.mock('@/utils/image-capture', () => ({
  isCameraCaptureAvailable: () => false,
  captureImageAsync: jest.fn(),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyPortfolio: jest.fn().mockResolvedValue([]),
  addPortfolioItem: jest.fn(),
  updatePortfolioItem: jest.fn(),
  removePortfolioItem: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({ uploadImages: (...args: unknown[]) => mockUploadImages(...args) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1024,
    breakpoint: 'tablet',
    isPhone: false,
    isTablet: true,
    isDesktop: false,
  }),
}));

import PortfolioScreen from '../app/provider/portfolio';

it('BUG-PHASE107-01 - provider portfolio uses the picker preview state and clears it on cancel', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PortfolioScreen /></QueryClientProvider>);

  await waitFor(() => expect(screen.getByText('No Portfolio Photos Yet')).toBeTruthy());
  fireEvent.click(screen.getByLabelText('Add a public work photo'));
  expect(screen.getByLabelText('Choose a work photo from camera or photo library')).toBeTruthy();
  expect(screen.queryByLabelText('Image URL')).toBeNull();

  fireEvent.click(screen.getByLabelText('Choose a work photo from camera or photo library'));
  await waitFor(() => expect(screen.getByLabelText('Choose a different work photo')).toBeTruthy());
  expect(mockUploadImages).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByLabelText('Add a public work photo'));
  expect(screen.getByLabelText('Choose a work photo from camera or photo library')).toBeTruthy();
  expect(screen.queryByLabelText('Choose a different work photo')).toBeNull();
});
