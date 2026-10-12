/**
 * Tester feedback v2, build step 4: "Send feedback" inside the app.
 * Plan: docs/qa/ux-testing/FEEDBACK-V2-AUDIT-AND-PLAN-2026-10-12.md section 6.
 *
 * Real renders of the customer Help, provider Help and provider Settings
 * screens and of the floating tester button. Each test clicks the rendered
 * control and asserts on the exact address handed to the phone's browser
 * (Linking.openURL) or to a new browser tab (window.open).
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking, Platform } from 'react-native';

const mockRoute = { current: '/' };
const mockInstalled: { name: string | null; build: string | null } = { name: null, build: null };
const mockAuth: { isAuthenticated: boolean; user: Record<string, unknown> | null } = {
  isAuthenticated: false,
  user: null,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => mockRoute.current,
}));
jest.mock('expo-application', () => ({
  get nativeApplicationVersion() { return mockInstalled.name; },
  get nativeBuildVersion() { return mockInstalled.build; },
  applicationId: null,
}));
jest.mock('expo-constants', () => {
  const constants = { expoConfig: { version: '1.0.1', extra: { sentryDsn: '', eas: { projectId: 'test' } } } };
  return { ...constants, default: constants };
});
jest.mock('@/stores/auth.store', () => {
  const state = (): Record<string, unknown> => ({
    isAuthenticated: mockAuth.isAuthenticated,
    user: mockAuth.user,
    logout: jest.fn().mockResolvedValue(undefined),
  });
  const useAuthStore = (selector?: (s: Record<string, unknown>) => unknown): unknown =>
    (selector ? selector(state()) : state());
  useAuthStore.getState = state;
  return { useAuthStore };
});
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue(null),
  policyToHelpAnswer: jest.fn().mockReturnValue('Current cancellation policy.'),
}));

import CustomerHelpScreen from '../app/customer/help';
import ProviderHelpScreen from '../app/provider/help';
import ProviderSettingsScreen from '../app/provider/settings';
import TesterFeedbackButton from '@/components/feedback/TesterFeedbackButton';
import { ToastProvider, useToastStore } from '@/components/ui/Toast';

const platform = Platform as { OS: string };
const originalOS = platform.OS;
const originalFlag = process.env.EXPO_PUBLIC_TESTER_FEEDBACK;

function setPlatform(os: 'android' | 'web'): void {
  platform.OS = os;
}

function renderWithQuery(element: React.ReactElement): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

beforeEach(() => {
  (Linking.openURL as jest.Mock).mockClear();
  (Linking.openURL as jest.Mock).mockResolvedValue(undefined);
  mockRoute.current = '/';
  mockInstalled.name = null;
  mockInstalled.build = null;
  mockAuth.isAuthenticated = false;
  mockAuth.user = null;
  delete process.env.EXPO_PUBLIC_TESTER_FEEDBACK;
});

afterEach(() => {
  platform.OS = originalOS;
  jest.restoreAllMocks();
});

afterAll(() => {
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_TESTER_FEEDBACK;
  else process.env.EXPO_PUBLIC_TESTER_FEEDBACK = originalFlag;
});

describe('Send feedback rows on Help and Settings', () => {
  // The rows send people to the tester study, so they exist only in tester
  // builds (EXPO_PUBLIC_TESTER_FEEDBACK=1); see the "normal build" tests below.
  beforeEach(() => { process.env.EXPO_PUBLIC_TESTER_FEEDBACK = '1'; });

  it('FB2-04 — customer Help row opens the problem form with the current route, installed version and apk', async () => {
    setPlatform('android');
    mockInstalled.name = '1.0.1';
    mockInstalled.build = '2';
    mockRoute.current = '/customer/help';
    renderWithQuery(<CustomerHelpScreen />);

    const row = screen.getByRole('button', { name: 'Send feedback or report a problem' });
    expect(row.textContent).toContain('Send feedback or report a problem');
    // Screen readers hear the label only, so the hint says it leaves the app.
    expect(row.getAttribute('aria-describedby')).toBe('Opens the feedback page in your browser');
    await act(async () => { fireEvent.click(row); });

    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://app.onservice.ph/feedback?report=1&screen=%2Fcustomer%2Fhelp&app=1.0.1%20(build%202)&surface=apk',
    );
  });

  it('FB2-04 — provider Help row opens the problem form with the current route and version', async () => {
    setPlatform('android');
    mockInstalled.name = '1.0.1';
    mockInstalled.build = '2';
    mockRoute.current = '/provider/help';
    render(<ProviderHelpScreen />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send feedback or report a problem' }));
    });

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://app.onservice.ph/feedback?report=1&screen=%2Fprovider%2Fhelp&app=1.0.1%20(build%202)&surface=apk',
    );
  });

  it('FB2-04 — provider Settings row opens the problem form with the current route and version', async () => {
    setPlatform('android');
    mockInstalled.name = '1.0.1';
    mockInstalled.build = '2';
    mockRoute.current = '/provider/settings';
    mockAuth.isAuthenticated = true;
    mockAuth.user = { firstName: 'Ana', lastName: 'Santos', role: 'provider', phone: '+639171234567' };
    render(<ProviderSettingsScreen />);

    const row = screen.getByRole('button', { name: 'Send feedback or report a problem' });
    expect(row.textContent).toContain('Opens our feedback page');
    expect(row.getAttribute('aria-describedby')).toBe('Opens the feedback page in your browser');
    // In a tester build Help & Support is no longer the last row, so it keeps its divider.
    expect(screen.getByText('Help & Support').parentElement?.getAttribute('style') ?? '').not.toMatch(/border-bottom-width:\s*0/);
    await act(async () => { fireEvent.click(row); });

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://app.onservice.ph/feedback?report=1&screen=%2Fprovider%2Fsettings&app=1.0.1%20(build%202)&surface=apk',
    );
  });

  it('FB2-04 — on the web app the Help row opens a new tab, marks it browser and never uses Linking', () => {
    setPlatform('web');
    mockRoute.current = '/customer/help';
    const tab = { opener: {} as unknown };
    const open = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as ReturnType<typeof window.open>);
    renderWithQuery(<CustomerHelpScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Send feedback or report a problem' }));

    expect(open).toHaveBeenCalledWith(
      'https://app.onservice.ph/feedback?report=1&screen=%2Fcustomer%2Fhelp&app=1.0.1&surface=browser',
      '_blank',
    );
    expect(tab.opener).toBeNull();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('FB2-04 — when the browser blocks the new tab, the web app tells the person where to go', () => {
    setPlatform('web');
    mockRoute.current = '/provider/help';
    jest.spyOn(window, 'open').mockReturnValue(null);
    render(<><ProviderHelpScreen /><ToastProvider /></>);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Send feedback or report a problem' }));
    });

    expect(screen.getByText('Open app.onservice.ph/feedback in your browser to send feedback.')).toBeTruthy();
    expect(Linking.openURL).not.toHaveBeenCalled();
    act(() => { useToastStore.getState().hide(); });
  });
});

describe('Send feedback rows in a normal (production) build', () => {
  // Production builds must never send real customers and providers into the
  // tester study, so without EXPO_PUBLIC_TESTER_FEEDBACK=1 the rows are gone.
  it('FB2-04 — customer Help shows no Send feedback row without the tester flag', () => {
    process.env.EXPO_PUBLIC_TESTER_FEEDBACK = '0';
    mockRoute.current = '/customer/help';
    renderWithQuery(<CustomerHelpScreen />);
    expect(screen.getByText('Still need help?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send feedback or report a problem' })).toBeNull();
    expect(screen.queryByText('Send feedback or report a problem')).toBeNull();
  });

  it('FB2-04 — provider Help shows no Send feedback row when the tester flag is missing', () => {
    mockRoute.current = '/provider/help';
    render(<ProviderHelpScreen />);
    expect(screen.queryByRole('button', { name: 'Send feedback or report a problem' })).toBeNull();
    expect(screen.queryByText('Send feedback or report a problem')).toBeNull();
  });

  it('FB2-04 — provider Settings shows no Send feedback row without the flag and Help & Support is the last row again', () => {
    mockRoute.current = '/provider/settings';
    mockAuth.isAuthenticated = true;
    mockAuth.user = { firstName: 'Ana', lastName: 'Santos', role: 'provider', phone: '+639171234567' };
    render(<ProviderSettingsScreen />);
    expect(screen.queryByRole('button', { name: 'Send feedback or report a problem' })).toBeNull();
    expect(screen.getByText('Help & Support').parentElement?.getAttribute('style') ?? '').toMatch(/border-bottom-width:\s*0/);
  });
});

describe('Floating tester Feedback button', () => {
  it('FB2-04 — renders nothing when EXPO_PUBLIC_TESTER_FEEDBACK is not 1, even when signed in', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = { role: 'customer' };
    process.env.EXPO_PUBLIC_TESTER_FEEDBACK = '0';
    const { container } = render(<TesterFeedbackButton />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('button', { name: 'Send feedback or report a problem' })).toBeNull();
  });

  it('FB2-04 — renders nothing for a signed-out visitor even with the flag on', () => {
    process.env.EXPO_PUBLIC_TESTER_FEEDBACK = '1';
    const { container } = render(<TesterFeedbackButton />);
    expect(container.innerHTML).toBe('');
  });

  it('FB2-04 — with the flag on and signed in, shows a labelled bottom-left button above the tab bar', () => {
    process.env.EXPO_PUBLIC_TESTER_FEEDBACK = '1';
    mockAuth.isAuthenticated = true;
    mockAuth.user = { role: 'customer' };
    render(<TesterFeedbackButton />);

    const button = screen.getByRole('button', { name: 'Send feedback or report a problem' });
    expect(button.textContent).toBe('Feedback');
    const style = button.getAttribute('style') ?? '';
    // 80px tab bar + 12px gap; left edge, never the right where screen actions sit.
    expect(style).toMatch(/bottom:\s*92px/);
    expect(style).toMatch(/left:\s*12px/);
    expect(style).toMatch(/min-width:\s*44px/);
    expect(style).toMatch(/min-height:\s*44px/);
    expect(style).not.toMatch(/right:/);
    expect(button.getAttribute('aria-describedby')).toBe('Opens the feedback page in your browser');
  });

  it('FB2-04 — when the wide web app hides the tab bar, the button drops to the bottom edge', () => {
    process.env.EXPO_PUBLIC_TESTER_FEEDBACK = '1';
    mockAuth.isAuthenticated = true;
    mockAuth.user = { role: 'customer' };
    render(<TesterFeedbackButton tabBarHidden />);

    const style = screen.getByRole('button', { name: 'Send feedback or report a problem' }).getAttribute('style') ?? '';
    expect(style).toMatch(/bottom:\s*12px/);
    expect(style).toMatch(/left:\s*12px/);
  });

  it('FB2-04 — the floating button on the web app opens a new tab with the current screen', () => {
    process.env.EXPO_PUBLIC_TESTER_FEEDBACK = '1';
    mockAuth.isAuthenticated = true;
    mockAuth.user = { role: 'provider' };
    setPlatform('web');
    mockRoute.current = '/provider/job/abc';
    const open = jest.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as ReturnType<typeof window.open>);
    render(<TesterFeedbackButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Send feedback or report a problem' }));

    expect(open).toHaveBeenCalledWith(
      'https://app.onservice.ph/feedback?report=1&screen=%2Fprovider%2Fjob%2Fabc&app=1.0.1&surface=browser',
      '_blank',
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('FB2-04 — the floating button in the installed app uses the phone browser with the current screen', async () => {
    process.env.EXPO_PUBLIC_TESTER_FEEDBACK = '1';
    mockAuth.isAuthenticated = true;
    mockAuth.user = { role: 'customer' };
    setPlatform('android');
    mockInstalled.name = '1.0.2';
    mockInstalled.build = '3';
    mockRoute.current = '/home';
    render(<TesterFeedbackButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send feedback or report a problem' }));
    });

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://app.onservice.ph/feedback?report=1&screen=%2Fhome&app=1.0.2%20(build%203)&surface=apk',
    );
  });
});
