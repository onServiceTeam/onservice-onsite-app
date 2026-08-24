import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import ProviderHelpScreen from '../app/provider/help';

it('Bug UX-230 — provider Help exposes manual payout review and paid-and-held prerequisites in its desktop workspace', () => {
  render(<ProviderHelpScreen />);

  expect(screen.getByLabelText('Desktop provider help workspace')).toBeTruthy();
  fireEvent.click(screen.getByText('When do I get paid?'));
  expect(screen.getByText(/booking that shows paid and held/i)).toBeTruthy();
  expect(screen.getByText(/Withdrawal requests are manual/i)).toBeTruthy();

  fireEvent.click(screen.getByText('How do withdrawals work?'));
  expect(screen.getByText(/large requests may enter an internal risk review/i)).toBeTruthy();
  expect(screen.queryByText(/processed within 1-3 business days/i)).toBeNull();
});
