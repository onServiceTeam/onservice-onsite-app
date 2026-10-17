// Bug UX-1431: on tablet and desktop, each onboarding slide shows the logo
// lockup (white house tile and the white "onService PH" wordmark) on the
// slide's coloured panel. The third slide's panel is purple (#8B5CF6), and
// white on that purple is about 4.2:1. At 18 px the wordmark counted as
// normal text under WCAG 2.2, which needs 4.5:1, so it failed. Bold text from
// 18.66 px (14 pt) counts as large text and needs 3:1. The wordmark is now
// 20 px bold, so it passes on all three slide colours.
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/services/api', () => ({ storage: { set: jest.fn() } }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1440, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import OnboardingScreen from '../app/onboarding';

/** jsdom reports colours as rgb(r, g, b). */
function rgb(value: string): [number, number, number] {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value);
  if (!match) throw new Error(`not an rgb() colour: "${value}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

it('Bug UX-1431 — the wide onboarding wordmark meets WCAG AA contrast on every slide colour, including the purple third slide', () => {
  render(<OnboardingScreen />);

  const brands = screen.getAllByTestId('onboarding-brand');
  expect(brands).toHaveLength(3);
  const panelColours = new Set<string>();
  for (const brand of brands) {
    const panel = brand.parentElement as HTMLElement;
    const background = panel.style.backgroundColor;
    panelColours.add(background);
    const wordmark = Array.from(brand.querySelectorAll('rn-text')).find((node) => node.textContent === 'onService PH') as HTMLElement;
    expect(wordmark).toBeDefined();

    const fontSize = Number.parseFloat(wordmark.style.fontSize);
    const bold = Number(wordmark.style.fontWeight) >= 700;
    const largeText = fontSize >= 24 || (bold && fontSize >= 18.66);
    const ratio = contrast(wordmark.style.color, background);
    const required = largeText ? 3 : 4.5;
    // The panel colour is in the object so a failure names the slide.
    expect({ background, ratio: Number(ratio.toFixed(2)), passes: ratio >= required }).toEqual({
      background,
      ratio: expect.any(Number),
      passes: true,
    });
  }
  // The purple slide is among the panels checked.
  expect(panelColours.has('rgb(139, 92, 246)')).toBe(true);
});
