import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockBack = jest.fn();

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/services/upload.service', () => ({
  uploadImages: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isPhone: false }),
}));

jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
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

import ProviderDocumentsScreen from '../app/provider-onboarding/documents';

it('Bug UX-526 — the document step names and performs its real back action to provider vetting', () => {
  render(<ProviderDocumentsScreen />);

  fireEvent.click(screen.getByLabelText('Back to provider vetting'));

  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Back to provider categories')).toBeNull();
});
