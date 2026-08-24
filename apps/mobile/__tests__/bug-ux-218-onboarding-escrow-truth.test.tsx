import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/services/api', () => ({ storage: { setItem: jest.fn() } }));

import OnboardingScreen from '../app/onboarding';

it('Bug UX-218 — onboarding conditions escrow language on a verified paid-and-held booking', () => {
  render(<OnboardingScreen />);

  expect(screen.getByText(/When a booking shows paid and held/i)).toBeTruthy();
  expect(screen.getByText(/support can review the same evidence/i)).toBeTruthy();
  expect(screen.queryByText(/funds stay held while support reviews/i)).toBeNull();
});
