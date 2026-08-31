import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking, Platform } from 'react-native';

const mockShowToast = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue(null),
  policyToTermsText: jest.fn(),
}));
jest.mock('@/lib/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import TermsScreen from '../app/customer/terms';

it('Bug UX-661 — Terms email support stays in the desktop browser and exposes the support address', () => {
  const platformSpy = jest.replaceProperty(Platform, 'OS', 'web');
  const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(<QueryClientProvider client={client}><TermsScreen /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('link', { name: 'Email onService support' }));

  expect(mockShowToast).toHaveBeenCalledWith('Email support at support@onservice.ph', 'info');
  expect(openSpy).not.toHaveBeenCalled();
  openSpy.mockRestore();
  platformSpy.restore();
});
