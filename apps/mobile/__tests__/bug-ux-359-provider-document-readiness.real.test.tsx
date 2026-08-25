import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1180,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
    governmentIdFrontUri: 'https://private.example/onboarding/front.jpg',
    governmentIdBackUri: 'https://private.example/onboarding/back.jpg',
    nbiClearanceUri: null,
    nbiExpiryDate: null,
    governmentIdNumber: null,
    setDocument: jest.fn(),
    setNbiExpiryDate: jest.fn(),
    setGovernmentIdNumber: jest.fn(),
  }),
}));

import DocumentsScreen from '../app/provider-onboarding/documents';

it('Bug UX-359 — provider verification shows honest readiness, review timing, accessible upload states, and a wide document workspace', () => {
  render(<DocumentsScreen />);

  expect(screen.getByLabelText('2 of 3 verification documents ready. Review has not started.')).toBeTruthy();
  expect(screen.getByText('2 / 3')).toBeTruthy();
  expect(screen.getByText(/submitted only after you finish all six onboarding steps/i)).toBeTruthy();
  expect(screen.getByLabelText('Tablet and desktop verification document workspace')).toBeTruthy();
  expect(screen.getByLabelText('Government ID — Front. On file. Tap to replace')).toBeTruthy();
  expect(screen.getByLabelText('NBI Clearance. Required. Tap to upload')).toBeTruthy();
  expect(screen.getByLabelText('NBI expiry date, optional')).toBeTruthy();
  expect(screen.queryByText(/encrypted and stored securely/i)).toBeNull();
});
