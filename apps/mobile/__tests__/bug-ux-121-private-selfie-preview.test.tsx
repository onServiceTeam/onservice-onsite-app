import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/utils/image-capture', () => ({
  captureImageAsync: jest.fn(),
  isCameraCaptureAvailable: () => true,
}));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: false }) }));
jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
    selfieUri: 'https://private.example/onboarding/user/selfie.jpg',
    setDocument: jest.fn(),
  }),
}));

import SelfieScreen from '../app/provider-onboarding/selfie';

it('BUG-UX-121 — returning to selfie shows a secure on-file state without requesting the private storage URL', () => {
  const { container } = render(<SelfieScreen />);

  expect(screen.getByText('Selfie on file')).toBeTruthy();
  expect(screen.getByText('Stored privately for identity review')).toBeTruthy();
  expect(container.querySelector('rn-image')).toBeNull();
});
