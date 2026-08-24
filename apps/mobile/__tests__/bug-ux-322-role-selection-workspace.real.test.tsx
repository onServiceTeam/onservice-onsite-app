import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();
const mockSetRole = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));
jest.mock('@/services/api', () => ({ storage: { delete: jest.fn() } }));
jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: (selector: (state: unknown) => unknown) => selector({ setRole: mockSetRole }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import RoleSelectScreen from '../app/provider-onboarding/role-select';

it('Bug UX-322 — role selection uses a bounded wide workspace and truthfully preserves customer access during provider review', () => {
  render(<RoleSelectScreen />);

  expect(screen.getByLabelText('Tablet and desktop role selection workspace')).toBeTruthy();
  expect(screen.getByText(/keeping customer access during review/i)).toBeTruthy();
  fireEvent.click(screen.getByText('I provide services'));
  expect(mockSetRole).toHaveBeenCalledWith('provider');
  expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/categories');
});
