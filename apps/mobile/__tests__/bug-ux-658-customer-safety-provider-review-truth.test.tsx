import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));

import SafetyAndSupportScreen from '../app/customer/safety-and-support';

it('Bug UX-658 — customer safety describes provider document review without asserting a stronger approval gate than operations enforce', () => {
  render(<SafetyAndSupportScreen />);

  expect(screen.getByText('Provider document review')).toBeTruthy();
  expect(screen.getByText(/collects a government ID, selfie identity check, and NBI clearance/i)).toBeTruthy();
  expect(screen.getByText(/confirm current platform approval/i)).toBeTruthy();
  expect(screen.queryByText(/Active providers must have an approved identity/i)).toBeNull();
});
