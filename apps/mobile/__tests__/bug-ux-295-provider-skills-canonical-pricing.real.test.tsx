import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

import ProviderSkillsScreen from '../app/provider/skills';

it('Bug UX-295 — deprecated Skills directs providers to catalog-owned Services without claiming personal price editing', async () => {
  render(<ProviderSkillsScreen />);

  expect(screen.getByText(/choose which catalog services you offer/i)).toBeTruthy();
  expect(screen.getByText(/review their current pricing/i)).toBeTruthy();
  expect(screen.queryByText(/set your prices/i)).toBeNull();
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/provider/services'));
});
