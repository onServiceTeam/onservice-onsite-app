// UX-1394: on admin.onservice.ph the sidebar said "Production environment",
// but that host is the live tester server (tester pilot, not launched). It
// now says "Tester server". The same fix took the orange accent off the
// environment dot: a staging build showed an orange dot, and orange is kept
// for small UI accents, not for the environment marker next to the logo. The
// staging dot is now slate.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = { isAuthenticated: true, user: { id: 'user-1394', role: 'admin' } };
    return selector ? selector(state) : state;
  },
}));

import Sidebar from '../Sidebar';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// The dot is the aria-hidden span just before the environment label.
function environmentDot(label: string): string {
  const dot = screen.getByText(label).previousElementSibling;
  if (!dot) throw new Error(`No environment dot next to "${label}"`);
  expect(dot.getAttribute('aria-hidden')).toBe('true');
  return dot.getAttribute('class') ?? '';
}

it('Bug UX-1394 — on admin.onservice.ph the sidebar says "Tester server", not production, and the staging dot is slate, not orange', () => {
  vi.stubGlobal('location', new URL('https://admin.onservice.ph/dashboard'));
  const tester = render(<MemoryRouter><Sidebar /></MemoryRouter>);
  expect(screen.getByText('Tester server')).toBeInTheDocument();
  expect(screen.queryByText(/production/i)).toBeNull();
  expect(environmentDot('Tester server')).toContain('bg-[var(--color-primary)]');
  expect(environmentDot('Tester server')).not.toContain('color-accent');
  tester.unmount();

  // A production build on any other host is a staging build.
  vi.stubGlobal('location', new URL('https://admin-staging.onservice.test/dashboard'));
  vi.stubEnv('MODE', 'production');
  render(<MemoryRouter><Sidebar /></MemoryRouter>);
  expect(screen.getByText('Staging environment')).toBeInTheDocument();
  const stagingDot = environmentDot('Staging environment');
  expect(stagingDot).toContain('bg-slate-400');
  expect(stagingDot).not.toContain('color-accent');
});
