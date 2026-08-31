import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Linking, Platform } from 'react-native';

const mockShowToast = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/lib/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import SafetyAndSupportScreen from '../app/customer/safety-and-support';

it('Bug UX-662 — emergency help stays usable in a desktop browser without navigating to an unsupported telephone URL', () => {
  const platformSpy = jest.replaceProperty(Platform, 'OS', 'web');
  const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

  render(<SafetyAndSupportScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Call 911 for immediate danger' }));

  expect(mockShowToast).toHaveBeenCalledWith('For immediate danger, call 911 from your phone.', 'error');
  expect(openSpy).not.toHaveBeenCalled();
  openSpy.mockRestore();
  platformSpy.restore();
});
