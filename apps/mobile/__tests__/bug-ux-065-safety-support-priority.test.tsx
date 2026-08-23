import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import SafetyAndSupportScreen from '../app/customer/safety-and-support';

it('Bug UX-065 — safety reports open a prefilled urgent in-app support request', () => {
  render(<SafetyAndSupportScreen />);
  fireEvent.click(screen.getByRole('button', { name: /Report a safety concern/i }));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: expect.objectContaining({
      type: 'booking_issue',
      priority: 'urgent',
      subject: 'Safety concern',
    }),
  });
});
