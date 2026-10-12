/**
 * Tester feedback v2, section 8 of
 * docs/qa/ux-testing/FEEDBACK-V2-AUDIT-AND-PLAN-2026-10-12.md: "The app shows
 * version 0.1.0 everywhere instead of 1.0.1."
 *
 * platformConfig.appVersion was a hard-coded '0.1.0'. It now comes from the
 * app itself: the installed build's version (the same value the update check
 * reads) or, on the web app, app.config.ts's version. These tests simulate an
 * installed build 1.0.2 whose app.config says 1.0.1 and a server /config that
 * still answers 0.1.0, render the real screens and check what they show.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

const mockInstalled: { name: string | null; build: string | null } = { name: '1.0.2', build: '3' };
const mockConfigured: { version: string | undefined } = { version: '1.0.1' };

jest.mock('expo-application', () => ({
  get nativeApplicationVersion() { return mockInstalled.name; },
  get nativeBuildVersion() { return mockInstalled.build; },
  applicationId: null,
}));
jest.mock('expo-constants', () => {
  const constants = {
    get expoConfig() { return { version: mockConfigured.version, extra: { sentryDsn: '', eas: { projectId: 'test' } } }; },
  };
  return { __esModule: true, default: constants };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/profile',
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => {
  const state = (): Record<string, unknown> => ({
    isAuthenticated: true,
    user: { id: 'u-1', firstName: 'Ana', lastName: 'Cruz', role: 'provider', phone: '+639171234567' },
    logout: jest.fn().mockResolvedValue(undefined),
    setUser: jest.fn(),
  });
  const useAuthStore = (selector?: (s: Record<string, unknown>) => unknown): unknown =>
    (selector ? selector(state()) : state());
  useAuthStore.getState = state;
  return { useAuthStore };
});

import ProfileScreen from '../app/(tabs)/profile';
import ProviderSettingsScreen from '../app/provider/settings';
import { platformConfig } from '@/config/platform.config';
import { resolveAppVersion } from '@/config/app-version';
import { fetchPlatformConfig, getConfig } from '@/services/config.service';
import { feedbackAppVersion } from '@/components/feedback/SendFeedbackLink';

afterEach(() => {
  mockInstalled.name = '1.0.2';
  mockInstalled.build = '3';
  mockConfigured.version = '1.0.1';
});

it('FB2-S8 — the customer Profile shows the installed app version, not 0.1.0', () => {
  render(<ProfileScreen />);
  expect(screen.getByText('Version 1.0.2')).toBeTruthy();
  expect(screen.queryByText('Version 0.1.0')).toBeNull();
});

it('FB2-S8 — provider Settings shows the installed app version, not 0.1.0', () => {
  render(<ProviderSettingsScreen />);
  expect(screen.getByText('1.0.2')).toBeTruthy();
  expect(screen.queryByText('0.1.0')).toBeNull();
});

it('FB2-S8 — the shown version, the update check and the feedback link use one source', () => {
  expect(platformConfig.appVersion).toBe('1.0.2');
  expect(resolveAppVersion()).toBe('1.0.2');
  expect(feedbackAppVersion()).toBe('1.0.2 (build 3)');
});

it('FB2-S8 — without an installed build (the web app) the version comes from app.config.ts', () => {
  mockInstalled.name = null;
  mockInstalled.build = null;
  expect(resolveAppVersion()).toBe('1.0.1');
  expect(feedbackAppVersion()).toBe('1.0.1');
  mockConfigured.version = undefined;
  expect(resolveAppVersion()).toBeNull();
  expect(feedbackAppVersion()).toBeNull();
});

it('FB2-S8 — the server /config answer (still 0.1.0) never replaces the app version', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { appVersion: '0.1.0', currency: 'PHP', quoteExpiryHours: 72 } }),
  }) as unknown as typeof fetch;
  try {
    await fetchPlatformConfig();
    // The fetch really merged (another value changed), but not the version.
    expect(getConfig().quoteExpiryHours).toBe(72);
    expect(getConfig().appVersion).toBe('1.0.2');
  } finally {
    global.fetch = originalFetch;
  }
});
