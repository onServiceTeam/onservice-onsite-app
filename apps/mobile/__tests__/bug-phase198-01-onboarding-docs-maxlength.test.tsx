import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({ uploadImages: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
    ...jest.requireActual('@/stores/onboarding.store').useOnboardingStore.getInitialState(),
    governmentIdFrontUri: null,
    governmentIdBackUri: null,
    nbiClearanceUri: null,
    nbiExpiryDate: null,
    governmentIdNumber: null,
    setDocument: jest.fn(),
    setNbiExpiryDate: jest.fn(),
    setGovernmentIdNumber: jest.fn(),
  }),
}));

import DocumentsScreen from '../app/provider-onboarding/documents';

it('Bug PHASE198-01 - provider onboarding document fields enforce the server limits', () => {
  render(<DocumentsScreen />);

  expect(screen.getByLabelText('Tablet and desktop verification document workspace')).toBeTruthy();
  expect(screen.getByLabelText('NBI expiry date, optional').getAttribute('maxlength')).toBe('10');
  expect(screen.getByLabelText('Government ID number, optional').getAttribute('maxlength')).toBe('64');
});
