import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import ProviderStandardsScreen from '../app/provider/standards';

it('Bug UX-229 — provider standards use a bounded desktop workspace and explain payment records without a guarantee claim', () => {
  render(<ProviderStandardsScreen />);

  expect(screen.getByLabelText('Desktop provider standards workspace')).toBeTruthy();
  expect(screen.getByText(/payment status, approvals, and communication stay in one support record/i)).toBeTruthy();
  expect(screen.getByText(/release follows customer confirmation or the platform completion timer/i)).toBeTruthy();
  expect(screen.queryByText(/our guarantee/i)).toBeNull();
});
