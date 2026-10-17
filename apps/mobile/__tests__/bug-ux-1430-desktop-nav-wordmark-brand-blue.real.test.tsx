// Bug UX-1430: the wordmark "onService PH" was not one colour across the app.
// On the web app's desktop navigation rail (1180 px and wider, white
// background) it was drawn in the ink text colour #051A3E, while the phone
// customer home header and the privacy and terms pages draw it in brand blue
// #003D9B. Ken (2026-10-14) wants one logo everywhere, and the brand README
// puts the wordmark in #003D9B on light backgrounds. The rail now uses the
// fixed brand blue, the same value as the logo tile, so a later theme change
// cannot split it again.
import React from 'react';
import { render, screen, within, cleanup } from '@testing-library/react';
import { DesktopNavigation } from '@/components/WebAppFrame';

function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
}

it('Bug UX-1430 — the desktop navigation wordmark is brand blue #003D9B in one colour for every workspace', () => {
  for (const role of ['customer', 'provider', 'provider_staff']) {
    render(<DesktopNavigation role={role} pathname="/support" displayName="Maria Santos" />);

    const wordmark = within(screen.getByTestId('desktop-brand')).getByText('onService PH');
    expect(wordmark.style.color).toBe(cssColor('#003D9B'));
    // One run of text: no "on" and "Service" in different colours.
    expect(wordmark.querySelector('*')).toBeNull();

    cleanup();
  }
});
