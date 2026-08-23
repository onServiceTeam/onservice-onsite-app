import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: false }) }));
jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
    governmentIdFrontUri: 'https://private.example/onboarding/user/front.jpg',
    governmentIdBackUri: 'https://private.example/onboarding/user/back.jpg',
    nbiClearanceUri: 'https://private.example/onboarding/user/nbi.jpg',
    nbiExpiryDate: null,
    governmentIdNumber: null,
    setDocument: jest.fn(),
    setNbiExpiryDate: jest.fn(),
    setGovernmentIdNumber: jest.fn(),
  }),
}));

import DocumentsScreen from '../app/provider-onboarding/documents';

it('BUG-UX-120 — returning to documents shows secure on-file states without loading private storage URLs as images', () => {
  const { container } = render(<DocumentsScreen />);

  expect(screen.getAllByText('On file')).toHaveLength(3);
  expect(container.querySelectorAll('rn-image')).toHaveLength(0);
});
