// Bug UX-1423: on tablet and desktop, the onboarding slides' coloured brand
// panel ended with the plain text "onService PH" and no logo. Ken
// (2026-10-14): the logo is the house, the same everywhere. On the coloured
// panel the logo is a white tile with a brand-blue house, next to the
// wordmark in white. The logo colours are the fixed brand values, so the
// expected colours are written out here.
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/services/api', () => ({ storage: { set: jest.fn() } }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1440, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import OnboardingScreen from '../app/onboarding';

function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
}

it('Bug UX-1423 — each wide onboarding panel shows the white house tile with the white "onService PH" wordmark', () => {
  render(<OnboardingScreen />);

  const brands = screen.getAllByTestId('onboarding-brand');
  expect(brands.length).toBeGreaterThan(0);
  for (const brand of brands) {
    const tile = brand.querySelector('[data-testid="onboarding-brand-mark"]') as HTMLElement | null;
    expect(tile).not.toBeNull();
    expect(tile!.style.backgroundColor).toBe(cssColor('#FFFFFF'));
    const house = tile!.querySelector('[data-icon="Home"]');
    expect(house).not.toBeNull();
    expect(house!.getAttribute('color')).toBe('#003D9B');
    const wordmark = Array.from(brand.querySelectorAll('rn-text')).find((node) => node.textContent === 'onService PH') as HTMLElement | undefined;
    expect(wordmark).toBeDefined();
    expect(wordmark!.style.color).toBe(cssColor('#FFFFFF'));
  }
});
