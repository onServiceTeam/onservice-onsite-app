import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockAddPortfolioItem = jest.fn();
const mockUploadImages = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'blob:https://app.onservice.ph/work-photo' }],
  }),
}));
jest.mock('@/utils/image-capture', () => ({
  isCameraCaptureAvailable: () => false,
  captureImageAsync: jest.fn(),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyPortfolio: jest.fn().mockResolvedValue([]),
  addPortfolioItem: (...args: unknown[]) => mockAddPortfolioItem(...args),
  updatePortfolioItem: jest.fn(),
  removePortfolioItem: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({
  uploadImages: (...args: unknown[]) => mockUploadImages(...args),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isPhone: false, isTablet: false }),
}));

import PortfolioScreen from '../app/provider/portfolio';

it('BUG-UX-119 — publishing a work photo asks for written consent before a public portfolio upload', async () => {
  mockUploadImages.mockResolvedValue([{
    url: 'https://cdn.example/portfolio/user-1/work.jpg',
  }]);
  mockAddPortfolioItem.mockResolvedValue({ id: 'portfolio-1' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <PortfolioScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText('No Portfolio Photos Yet')).toBeTruthy());
  fireEvent.click(screen.getByText('+ Add'));
  fireEvent.click(screen.getByText('Tap to add photo'));
  await waitFor(() => expect(screen.getByText('Change')).toBeTruthy());
  fireEvent.click(screen.getByText('Save'));

  expect(Alert.alert).toHaveBeenCalledWith(
    'Customer consent required',
    'Do you have written consent from the customer to use this photo?',
    expect.any(Array),
  );
  expect(mockUploadImages).not.toHaveBeenCalled();

  const buttons = (Alert.alert as jest.Mock).mock.calls[0]![2] as Array<{ text: string; onPress?: () => void }>;
  buttons.find((button) => button.text === 'Yes, I have consent')!.onPress!();

  await waitFor(() => expect(mockUploadImages).toHaveBeenCalledWith(
    ['blob:https://app.onservice.ph/work-photo'],
    'portfolio',
  ));
  await waitFor(() => expect(mockAddPortfolioItem).toHaveBeenCalledWith(expect.objectContaining({
    imageUrl: 'https://cdn.example/portfolio/user-1/work.jpg',
    customerConsentConfirmed: true,
  })));
});
