// Guard tests for the shared logo tile (src/components/BrandMark.tsx). They
// do not claim a bug fix.
//
// 1. The sign-in brand panel (tablet and desktop sign-in, sign-up and code
//    screens) already drew the house Ken approved: a white 48 px tile with a
//    6 px corner and a 28 px brand-blue house. Moving that panel onto the
//    shared BrandMark changed nothing visible. The first test pins the panel to
//    the shared component and to the approved look, so it cannot drift again
//    the way the hand-built "oS" copies did.
// 2. The logo colours are fixed brand values. The D41 plan rethemes the app
//    (colors.primary and friends) but keeps #003D9B for the logo, so the logo
//    must not follow the theme. The second test changes the theme and checks
//    the logo keeps its colours.
import React from 'react';
import { render, screen, within, cleanup } from '@testing-library/react';
import * as BrandMarkModule from '@/components/BrandMark';
import AuthBrandPanel from '@/components/AuthBrandPanel';

function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
}

afterEach(() => {
  jest.restoreAllMocks();
});

it('Guard (no visible change) — the sign-in brand panel draws the shared BrandMark: white 48 px tile, 6 px corner, 28 px brand-blue house', () => {
  const brandMark = jest.spyOn(BrandMarkModule, 'default');
  render(<AuthBrandPanel eyebrow="WELCOME BACK" title="Sign in" description="Use your account." />);

  expect(brandMark).toHaveBeenCalled();
  expect(brandMark.mock.calls[0]![0]).toMatchObject({ tone: 'onDark', size: 48 });

  const panel = screen.getByLabelText('onService account benefits');
  const tile = within(panel).getByTestId('auth-brand-mark');
  expect(tile.style.backgroundColor).toBe(cssColor('#FFFFFF'));
  expect(tile.style.width).toBe('48px');
  expect(tile.style.borderRadius).toBe('6px');
  const house = tile.querySelector('[data-icon="Home"]');
  expect(house).not.toBeNull();
  expect(house!.getAttribute('color')).toBe('#003D9B');
  expect(house!.getAttribute('size')).toBe('28');
  const wordmark = within(panel).getByText('onService PH');
  expect(wordmark.style.color).toBe(cssColor('#FFFFFF'));
});

it('Guard — the logo keeps #003D9B and white when the app theme colours change (D41 retheme)', () => {
  let ThemedBrandMark: typeof BrandMarkModule.default | undefined;
  jest.isolateModules(() => {
    jest.doMock('@/config/theme', () => {
      const actual = jest.requireActual('@/config/theme');
      return { ...actual, colors: { ...actual.colors, primary: '#7A1FA2', white: '#F4F4F4' } };
    });
    ThemedBrandMark = (jest.requireActual('@/components/BrandMark') as typeof BrandMarkModule).default;
  });
  jest.dontMock('@/config/theme');
  expect(ThemedBrandMark).toBeDefined();
  const Mark = ThemedBrandMark!;

  const expected = { onLight: ['#003D9B', '#FFFFFF'], onDark: ['#FFFFFF', '#003D9B'] } as const;
  for (const tone of ['onLight', 'onDark'] as const) {
    render(<Mark tone={tone} size={48} testID="themed-mark" />);
    const tile = screen.getByTestId('themed-mark');
    expect(tile.style.backgroundColor).toBe(cssColor(expected[tone][0]));
    expect(tile.querySelector('[data-icon="Home"]')!.getAttribute('color')).toBe(expected[tone][1]);
    cleanup();
  }
});
