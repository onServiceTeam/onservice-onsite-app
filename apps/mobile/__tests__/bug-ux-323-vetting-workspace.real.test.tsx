import React from 'react';
import { render, screen } from '@testing-library/react';

const emptyVetting = {
  mainSkills: '',
  hasOwnTools: false,
  businessType: '',
  yearStarted: '',
  teamSize: '',
  fullAddress: '',
  website: '',
  facebook: '',
  socialOther: '',
  credentials: '',
  registrations: '',
  resumeUrl: '',
  references: [],
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/stores/onboarding.store', () => ({
  emptyVetting,
  useOnboardingStore: () => ({
    yearsExperience: null,
    vetting: emptyVetting,
    setVetting: jest.fn(),
  }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import VettingScreen from '../app/provider-onboarding/vetting';

it('Bug UX-323 — the long provider vetting form is bounded and readable on tablet and desktop browsers', () => {
  render(<VettingScreen />);

  expect(screen.getByLabelText('Tablet and desktop provider vetting workspace')).toBeTruthy();
  expect(screen.getByText('Your business & experience')).toBeTruthy();
  expect(screen.getByText('References')).toBeTruthy();
  expect(screen.getByText('3 / 6')).toBeTruthy();
});
