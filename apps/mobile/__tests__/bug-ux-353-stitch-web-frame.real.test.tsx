import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({
  usePathname: () => '/provider/leads',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/components/icons', () => {
  const ReactRuntime = require('react') as typeof React;
  const Icon = (): React.ReactElement => ReactRuntime.createElement('span');
  return {
    Home: Icon,
    ClipboardList: Icon,
    Wallet: Icon,
    Folder: Icon,
    Heart: Icon,
    HelpCircle: Icon,
    User: Icon,
    LayoutDashboard: Icon,
    Wrench: Icon,
    Inbox: Icon,
    Calendar: Icon,
    Users: Icon,
    Coins: Icon,
    Briefcase: Icon,
    UserCheck: Icon,
  };
});

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    isAuthenticated: true,
    user: { firstName: 'Roberto', lastName: 'Villanueva', role: 'provider' },
  }),
}));

const reactNative = require('react-native') as {
  Platform: { OS: string; select: (values: Record<string, unknown>) => unknown };
  useWindowDimensions: () => { width: number; height: number; scale: number; fontScale: number };
};
const originalOs = reactNative.Platform.OS;
const originalSelect = reactNative.Platform.select;
const originalDimensions = reactNative.useWindowDimensions;

reactNative.Platform.OS = 'web';
reactNative.Platform.select = (values) => values.web ?? values.default;
reactNative.useWindowDimensions = () => ({ width: 1280, height: 900, scale: 1, fontScale: 1 });

const { WebAppFrame } = require('@/components/WebAppFrame') as {
  WebAppFrame: React.ComponentType<{ children: React.ReactNode }>;
};

afterAll(() => {
  reactNative.Platform.OS = originalOs;
  reactNative.Platform.select = originalSelect;
  reactNative.useWindowDimensions = originalDimensions;
});

it('Bug UX-353 — the desktop web frame renders a bordered Stitch tonal workspace without a decorative shadow', () => {
  render(<WebAppFrame><div>Provider content</div></WebAppFrame>);

  const workspace = screen.getByLabelText('Desktop app workspace');
  const style = workspace.getAttribute('style') ?? '';
  expect(workspace.textContent).toContain('Provider content');
  expect(style).toContain('border-left-width');
  expect(style).toContain('border-right-width');
  expect(style).not.toContain('box-shadow');
});
