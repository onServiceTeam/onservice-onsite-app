import React from 'react';
import { render, waitFor } from '@testing-library/react';

const mockApiGet = jest.fn();

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

import BackgroundCheckStatusScreen from '../app/provider-onboarding/background-check-status';

describe('provider background-check status', () => {
  it('Bug CRIT-K07 — the screen renders the rejection returned by the application-status API', async () => {
    mockApiGet.mockResolvedValue({
      data: { data: { status: 'rejected', rejectionReason: 'Government ID details did not match.' } },
    });

    const { getByText } = render(<BackgroundCheckStatusScreen />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/api/v1/providers/application-status');
      expect(getByText('Rejected')).toBeTruthy();
      expect(getByText('Government ID details did not match.')).toBeTruthy();
    });
  });
});
