import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/services/api', () => ({ storage: { set: jest.fn() } }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1440, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import OnboardingScreen from '../app/onboarding';

it('Bug UX-402 — desktop onboarding uses a named wide brand-and-copy workspace instead of stretching the phone composition', () => {
  render(<OnboardingScreen />);

  expect(screen.getByLabelText('Tablet and desktop customer onboarding')).toBeTruthy();
  expect(screen.getAllByText('onService PH').length).toBeGreaterThan(0);
  expect(screen.getAllByText('CLEAR, ON-APP SERVICE RECORDS').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
});
