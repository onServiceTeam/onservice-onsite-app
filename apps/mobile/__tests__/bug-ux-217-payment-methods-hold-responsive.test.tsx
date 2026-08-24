import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import PaymentMethodsScreen from '../app/customer/payment-methods';

it('Bug UX-217 — payment methods uses a bounded desktop workspace and exposes only existing wallet balance as available', () => {
  render(<PaymentMethodsScreen />);

  expect(screen.getByLabelText('Desktop payment methods workspace')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Existing Wallet Balance, available' })).toBeTruthy();
  expect(screen.getAllByText('Paused')).toHaveLength(4);
  expect(screen.getByText('External payments paused')).toBeTruthy();
  expect(screen.queryByText(/Choose any of these methods during checkout/i)).toBeNull();
});
