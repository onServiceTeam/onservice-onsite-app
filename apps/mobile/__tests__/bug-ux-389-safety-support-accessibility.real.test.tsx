import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Linking } from 'react-native';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

import SafetyAndSupportScreen from '../app/customer/safety-and-support';

it('Bug UX-389 — safety actions and FAQ disclosures expose their purpose and expanded state to assistive users', () => {
  const callSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  render(<SafetyAndSupportScreen />);

  fireEvent.click(screen.getByRole('button', { name: 'Call 911 for immediate danger' }));
  expect(callSpy).toHaveBeenCalledWith('tel:911');
  expect(screen.getByRole('button', { name: 'Open onService support inbox' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Report a safety concern' })).toBeTruthy();

  const question = screen.getByRole('button', { name: 'What should I do before the provider arrives?, collapsed' });
  expect(screen.queryByText(/Lock away valuables/i)).toBeNull();
  fireEvent.click(question);
  expect(screen.getByRole('button', { name: 'What should I do before the provider arrives?, expanded' })).toBeTruthy();
  expect(screen.getByText(/Lock away valuables/i)).toBeTruthy();
  callSpy.mockRestore();
});
