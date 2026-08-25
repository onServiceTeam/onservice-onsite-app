import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, isPhone: false, isTablet: true, isDesktop: false }),
}));

import ProviderHelpScreen from '../app/provider/help';

it('BUG-PHASE89-01 — provider commission help describes one live rate per recorded tier', () => {
  render(<ProviderHelpScreen />);

  fireEvent.click(screen.getByLabelText('What is the platform commission?'));

  expect(screen.getByText(/tier-specific rate/i)).toBeTruthy();
  expect(screen.getByText(/does not move within a tier/i)).toBeTruthy();
  expect(screen.getByText(/current live rate/i)).toBeTruthy();
  expect(screen.queryByText(/Commission ranges from/i)).toBeNull();
  expect(screen.queryByText(/New providers pay 15%/i)).toBeNull();
});
