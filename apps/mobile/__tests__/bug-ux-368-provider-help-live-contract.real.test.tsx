import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

import ProviderHelpScreen from '../app/provider/help';

it('Bug UX-368 — provider Help follows live catalog, commission, and visible-review contracts', () => {
  render(<ProviderHelpScreen />);

  fireEvent.click(screen.getByLabelText('How do I receive job requests?'));
  expect(screen.getByText(/live acceptance countdown/i)).toBeTruthy();
  expect(screen.getByText(/when you have that channel enabled/i)).toBeTruthy();
  expect(screen.queryByText(/about a minute/i)).toBeNull();

  fireEvent.click(screen.getByLabelText('What is the platform commission?'));
  expect(screen.getByText(/current live rate/i)).toBeTruthy();
  expect(screen.queryByText(/New providers pay 15%/i)).toBeNull();

  fireEvent.click(screen.getByLabelText('How are ratings calculated?'));
  expect(screen.getByText(/visible customer reviews/i)).toBeTruthy();
  expect(screen.getByText(/hidden after support review are excluded/i)).toBeTruthy();

  fireEvent.click(screen.getByLabelText('How do I update my services?'));
  expect(screen.getByText(/live onService catalog/i)).toBeTruthy();
  expect(screen.getByText(/does not let an individual provider override/i)).toBeTruthy();
  expect(screen.queryByText(/update your pricing/i)).toBeNull();

  fireEvent.click(screen.getByLabelText('How do I benefit from Suki?'));
  expect(screen.getByText(/does not promise future jobs or ratings/i)).toBeTruthy();
  expect(screen.queryByText(/provide steady income/i)).toBeNull();
});
