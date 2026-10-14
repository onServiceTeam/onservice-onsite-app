/**
 * Tester feedback v2, build step 4: where the floating "Feedback" button may
 * appear.
 *
 * Review finding (2026-10-12, blocker): mounted in the root layout, the button
 * sat on every screen and covered the left third of the main job button on
 * the provider job screen (phone). It now lives only in the two tab layouts,
 * whose 8 screens have no fixed bottom action buttons, sits just above the
 * tab bar, and hides while the keyboard is open.
 *
 * These tests render the real RootLayout with a stand-in router that shows
 * one screen at a time (the real customer tab layout, the real provider tab
 * layout or the real provider job screen), plus the tab layouts on their own.
 *
 * D38 Milestone 2 (package P5a) updates:
 * - The root layout now also mounts RealtimeGate (the live connection) and
 *   InAppNoticeHost (the in-app banner). They are replaced with stand-ins
 *   here, like the push and update gates, so no real socket opens in jsdom.
 * - The customer tab layout now reads the Bookings and Messages badge counts
 *   through react-query, so the tab layouts rendered on their own get a
 *   QueryClientProvider.
 * - New: tab screens end above the Feedback button in tester builds (the
 *   button covered the first "How it works" step on Home before scrolling).
 *
 * D38 Milestone 2 (package P5b) updates:
 * - The provider tab layout now reads the Requests tab badge through
 *   react-query, so it also gets a QueryClientProvider when rendered alone.
 * - New: the provider tab screens end above the Feedback button in tester
 *   builds too (the P5a review found the dashboard's own padding did not keep
 *   the last row clear, and the new Requests and My quotes lists need it).
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ReactNative from 'react-native';

type ScreenComponent = React.ComponentType | null;
const mockRouterScreen: { current: ScreenComponent } = { current: null };
const mockAuth: { isAuthenticated: boolean; user: Record<string, unknown> | null } = {
  isAuthenticated: false,
  user: null,
};

jest.mock('expo-router', () => {
  const ReactLocal = jest.requireActual<typeof import('react')>('react');
  // The root Stack shows the "current screen", like the router would.
  const Stack = Object.assign(
    ({ children }: { children?: React.ReactNode }) => {
      const Current = mockRouterScreen.current;
      return ReactLocal.createElement('rn-view', { 'aria-label': 'Screen stack' },
        children, Current ? ReactLocal.createElement(Current) : null);
    },
    { Screen: () => null },
  );
  // The navigator's scene padding (screenOptions.sceneStyle) is exposed as a
  // data attribute so the tester clearance can be checked.
  const Tabs = Object.assign(
    ({ children, screenOptions }: { children?: React.ReactNode; screenOptions?: { sceneStyle?: { paddingBottom?: number } } }) =>
      ReactLocal.createElement('rn-view', {
        'aria-label': 'Tab navigator',
        'data-scene-padding-bottom': String(screenOptions?.sceneStyle?.paddingBottom ?? 0),
      }, children),
    { Screen: () => null },
  );
  return {
    Stack,
    Tabs,
    Redirect: ({ href }: { href: string }) => ReactLocal.createElement('rn-view', { 'aria-label': `Redirect to ${href}` }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    usePathname: () => '/home',
    useLocalSearchParams: () => ({ id: 'booking-1' }),
  };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@/components/PushNotificationGate', () => ({ PushNotificationGate: () => null }));
jest.mock('@/components/RealtimeGate', () => ({ RealtimeGate: () => null }));
jest.mock('@/components/InAppNoticeHost', () => ({ InAppNoticeHost: () => null }));
jest.mock('@/components/AppUpdateGate', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/AccountQueryCacheGate', () => ({ AccountQueryCacheGate: () => null }));
jest.mock('@/components/provider/NewJobModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/auth-migration', () => ({ migrateLegacyTokensIfNeeded: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/config.service', () => ({
  ...jest.requireActual('@/services/config.service'),
  fetchPlatformConfig: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/stores/auth.store', () => {
  const state = (): Record<string, unknown> => ({
    isAuthenticated: mockAuth.isAuthenticated,
    user: mockAuth.user,
    hydrate: jest.fn(),
  });
  const useAuthStore = (selector?: (s: Record<string, unknown>) => unknown): unknown =>
    (selector ? selector(state()) : state());
  useAuthStore.getState = state;
  return { useAuthStore };
});
// Provider job screen, phone layout, a job in progress: its main button
// ("Review & Complete") is in the fixed bar at the bottom of the screen.
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/booking-proof.service', () => ({ getBookingProofSummary: jest.fn().mockResolvedValue(null) }));
jest.mock('@/services/booking.service', () => ({
  getMyDisputes: jest.fn().mockResolvedValue({ disputes: [] }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    bookingType: 'fixed_price',
    status: 'in_progress',
    servicePrice: 120000,
    description: 'Clean one split-type air conditioner',
    address: '88 Banilad Road',
    barangay: 'Banilad',
    city: 'Mandaue City',
    latitude: 10.3157,
    longitude: 123.8854,
    scheduledAt: '2026-08-24T01:00:00.000Z',
    createdAt: '2026-08-23T01:00:00.000Z',
    customerName: 'Paolo Garcia',
    serviceName: 'Aircon Cleaning',
  }),
}));

import RootLayout from '../app/_layout';
import CustomerTabLayout from '../app/(tabs)/_layout';
import ProviderTabLayout from '../app/(provider-tabs)/_layout';
import ProviderJobDetailScreen from '../app/provider/job/[id]';

const FEEDBACK = { name: 'Send feedback or report a problem' };
type KeyboardMock = typeof ReactNative.Keyboard & {
  __emit: (event: string) => void;
  __listenerCount: (event: string) => number;
};
const keyboard = ReactNative.Keyboard as KeyboardMock;
const platform = ReactNative.Platform as { OS: string };
const originalOS = platform.OS;
const originalFlag = process.env.EXPO_PUBLIC_TESTER_FEEDBACK;

/** A tab layout on its own (outside RootLayout) needs its own query client. */
function withQueries(element: React.ReactElement): React.ReactElement {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>;
}

function signIn(role: 'customer' | 'provider'): void {
  mockAuth.isAuthenticated = true;
  mockAuth.user = { id: `${role}-1`, role, firstName: 'Ana' };
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_TESTER_FEEDBACK = '1';
});

afterEach(() => {
  platform.OS = originalOS;
  mockRouterScreen.current = null;
  mockAuth.isAuthenticated = false;
  mockAuth.user = null;
  jest.restoreAllMocks();
});

afterAll(() => {
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_TESTER_FEEDBACK;
  else process.env.EXPO_PUBLIC_TESTER_FEEDBACK = originalFlag;
});

describe('Which screens show the floating Feedback button', () => {
  it('FB2-04 — a customer tab screen shows it, bottom-left just above the 80px tab bar', async () => {
    signIn('customer');
    mockRouterScreen.current = CustomerTabLayout;
    render(<RootLayout />);

    await waitFor(() => expect(screen.getByLabelText('Tab navigator')).toBeTruthy());
    const button = screen.getByRole('button', FEEDBACK);
    expect(button.textContent).toBe('Feedback');
    const style = button.getAttribute('style') ?? '';
    expect(style).toMatch(/bottom:\s*92px/);
    expect(style).toMatch(/left:\s*12px/);
    // Exactly one: the root layout no longer adds a second copy.
    expect(screen.getAllByRole('button', FEEDBACK)).toHaveLength(1);
  });

  it('FB2-04 — a provider tab screen shows it', async () => {
    signIn('provider');
    mockRouterScreen.current = ProviderTabLayout;
    render(<RootLayout />);

    await waitFor(() => expect(screen.getByLabelText('Tab navigator')).toBeTruthy());
    expect(screen.getAllByRole('button', FEEDBACK)).toHaveLength(1);
  });

  it('FB2-04 — the provider job screen (not a tab) does not show it, so it cannot cover the main job button', async () => {
    signIn('provider');
    mockRouterScreen.current = ProviderJobDetailScreen;
    render(<RootLayout />);

    // The job's main action in the fixed bottom bar is on screen ...
    expect(await screen.findByText('Review & Complete')).toBeTruthy();
    // ... and nothing floats over it.
    expect(screen.queryByRole('button', FEEDBACK)).toBeNull();
    expect(screen.queryByText('Feedback')).toBeNull();
  });

  it('FB2-04 — the root layout itself adds no Feedback button, even in a tester build', async () => {
    signIn('customer');
    render(<RootLayout />);

    await waitFor(() => expect(screen.getByLabelText('Screen stack')).toBeTruthy());
    expect(screen.queryByRole('button', FEEDBACK)).toBeNull();
  });

  it('FB2-04 — a normal build shows no Feedback button on the tab screens', async () => {
    delete process.env.EXPO_PUBLIC_TESTER_FEEDBACK;
    signIn('customer');
    mockRouterScreen.current = CustomerTabLayout;
    render(<RootLayout />);

    await waitFor(() => expect(screen.getByLabelText('Tab navigator')).toBeTruthy());
    expect(screen.queryByRole('button', FEEDBACK)).toBeNull();
  });

  it('FB2-04 — on the wide web app, where the tab bar is hidden, it drops to the bottom edge', () => {
    signIn('customer');
    platform.OS = 'web';
    // The raw module object the layout reads from (the namespace import above is a copy).
    jest.spyOn(require('react-native') as typeof ReactNative, 'useWindowDimensions').mockReturnValue({ width: 1280, height: 900, scale: 1, fontScale: 1 });
    render(withQueries(<CustomerTabLayout />));

    const style = screen.getByRole('button', FEEDBACK).getAttribute('style') ?? '';
    expect(style).toMatch(/bottom:\s*12px/);
  });
});

describe('Room for the Feedback button on the customer tab screens', () => {
  it('FB2-04 — tester builds end each customer tab screen above the button, so it never covers content (normal builds get no extra space)', () => {
    signIn('customer');
    const tester = render(withQueries(<CustomerTabLayout />));
    // 44px button + 12px gap above the tab bar + 12px breathing room.
    expect(screen.getByLabelText('Tab navigator').getAttribute('data-scene-padding-bottom')).toBe('68');
    tester.unmount();

    delete process.env.EXPO_PUBLIC_TESTER_FEEDBACK;
    render(withQueries(<CustomerTabLayout />));
    expect(screen.getByLabelText('Tab navigator').getAttribute('data-scene-padding-bottom')).toBe('0');
  });
});

describe('Room for the Feedback button on the provider tab screens', () => {
  it('FB2-04 — tester builds end each provider tab screen above the button, so it never covers the last request or quote (normal builds get no extra space)', () => {
    signIn('provider');
    const tester = render(withQueries(<ProviderTabLayout />));
    // 44px button + 12px gap above the tab bar + 12px breathing room.
    expect(screen.getByLabelText('Tab navigator').getAttribute('data-scene-padding-bottom')).toBe('68');
    tester.unmount();

    delete process.env.EXPO_PUBLIC_TESTER_FEEDBACK;
    render(withQueries(<ProviderTabLayout />));
    expect(screen.getByLabelText('Tab navigator').getAttribute('data-scene-padding-bottom')).toBe('0');
  });
});

describe('The Feedback button and the on-screen keyboard', () => {
  it('FB2-04 — on iPhone it hides as the keyboard opens and comes back when it closes', () => {
    signIn('customer');
    platform.OS = 'ios';
    const view = render(withQueries(<CustomerTabLayout />));
    expect(screen.getByRole('button', FEEDBACK)).toBeTruthy();

    act(() => { keyboard.__emit('keyboardWillShow'); });
    expect(screen.queryByRole('button', FEEDBACK)).toBeNull();

    act(() => { keyboard.__emit('keyboardWillHide'); });
    expect(screen.getByRole('button', FEEDBACK)).toBeTruthy();

    view.unmount();
    expect(keyboard.__listenerCount('keyboardWillShow')).toBe(0);
    expect(keyboard.__listenerCount('keyboardWillHide')).toBe(0);
  });

  it('FB2-04 — in the Android app it hides while the keyboard is open', () => {
    signIn('provider');
    platform.OS = 'android';
    const view = render(withQueries(<ProviderTabLayout />));
    expect(screen.getByRole('button', FEEDBACK)).toBeTruthy();

    act(() => { keyboard.__emit('keyboardDidShow'); });
    expect(screen.queryByRole('button', FEEDBACK)).toBeNull();

    act(() => { keyboard.__emit('keyboardDidHide'); });
    expect(screen.getByRole('button', FEEDBACK)).toBeTruthy();

    view.unmount();
    expect(keyboard.__listenerCount('keyboardDidShow')).toBe(0);
  });
});
