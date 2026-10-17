// Bug UX-1421: the web app's desktop navigation rail (1180 px and wider, for
// customers, Service Providers and team members) showed a blue tile with the
// retired "oS" letters next to "onService PH". Ken (2026-10-14): the logo is
// the house everywhere. On the rail's white background the logo is a
// brand-blue tile with a white house. The logo colours are the fixed brand
// values, so the expected colours are written out here.
import React from 'react';
import { render, screen, within, cleanup } from '@testing-library/react';
import { DesktopNavigation } from '@/components/WebAppFrame';

function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = value;
  return probe.style.backgroundColor;
}

it('Bug UX-1421 — the desktop navigation brand is the blue house tile for every workspace, not "oS"', () => {
  for (const role of ['customer', 'provider', 'provider_staff']) {
    render(<DesktopNavigation role={role} pathname="/support" displayName="Maria Santos" />);

    expect(screen.queryByText('oS')).toBeNull();
    const tile = screen.getByTestId('desktop-brand-mark');
    expect(tile.style.backgroundColor).toBe(cssColor('#003D9B'));
    // Scoped to the brand tile: the customer rail also has a "Home" link icon.
    const house = tile.querySelector('[data-icon="Home"]');
    expect(house).not.toBeNull();
    expect(house!.getAttribute('color')).toBe('#FFFFFF');
    expect(within(screen.getByTestId('desktop-brand')).getByText('onService PH')).toBeTruthy();

    cleanup();
  }
});
