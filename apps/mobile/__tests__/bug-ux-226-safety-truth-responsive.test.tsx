import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import SafetyAndSupportScreen from '../app/customer/safety-and-support';

it('Bug UX-226 — safety uses a desktop workspace and describes records and support without blanket protection claims', () => {
  render(<SafetyAndSupportScreen />);

  expect(screen.getByLabelText('Desktop safety and support workspace')).toBeTruthy();
  expect(screen.getByText('Payment and escrow records')).toBeTruthy();
  expect(screen.getByText(/Release can follow confirmation or the platform completion timer/i)).toBeTruthy();
  expect(screen.queryByText(/We protect every booking/i)).toBeNull();
  expect(screen.queryByText(/funds stay held while support reviews evidence/i)).toBeNull();

  fireEvent.click(screen.getByText("What if the provider doesn't show up?"));
  expect(screen.getByText(/A refund is confirmed only when the booking shows its method, destination, status, and reference/i)).toBeTruthy();
});
