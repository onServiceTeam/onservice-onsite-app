import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import SafetyAndSupportScreen from '../app/customer/safety-and-support';

it('BUG-PHASE106-01 - customer safety guidance describes status updates without promising a live provider pin', () => {
  render(<SafetyAndSupportScreen />);

  expect(screen.getByLabelText('Desktop safety and support workspace')).toBeTruthy();
  expect(screen.getByText('Live status updates')).toBeTruthy();
  expect(screen.getByText(/booking-status tracking/i)).toBeTruthy();
  expect(screen.getByText(/not a live provider pin/i)).toBeTruthy();
  expect(screen.queryByText(/See your provider's location on the map while they're on the way to you/i)).toBeNull();
});
