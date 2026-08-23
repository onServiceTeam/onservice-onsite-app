import React from 'react';
import { render, screen } from '@testing-library/react';
import { DesktopNavigation } from '@/components/WebAppFrame';

describe('desktop role navigation', () => {
  it('Bug UX-001 — renders the customer workspace with customer destinations', () => {
    render(<DesktopNavigation role="customer" pathname="/home" displayName="Maria Santos" />);

    expect(screen.getByLabelText('Customer workspace navigation')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('link', { name: 'Projects' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Suki Pros' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Job Requests' })).toBeNull();
  });

  it('Bug UX-002 — renders provider operations instead of customer navigation', () => {
    render(
      <DesktopNavigation role="provider" pathname="/provider/leads" displayName="Juan Dela Cruz" />,
    );

    expect(screen.getByLabelText('Provider workspace navigation')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Job Requests' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('link', { name: 'Schedule' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Clients' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Suki Pros' })).toBeNull();
  });
});
