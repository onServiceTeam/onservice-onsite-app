import React from 'react';
import { render } from '@testing-library/react';

jest.mock('@/components/RoleRouteGuard', () => ({
  RoleRouteGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-router', () => {
  const ReactRuntime = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    ReactRuntime.createElement('nav', { 'aria-label': 'Provider route registry' }, children);
  Stack.Screen = ({ name }: { name: string }) =>
    ReactRuntime.createElement('span', { 'data-route-name': name }, name);
  return { Stack };
});

import ProviderLayout from '../app/provider/_layout';

it('Bug UX-316 — the provider navigator registers client detail records at clients/[id]', () => {
  const view = render(<ProviderLayout />);

  expect(view.container.querySelector('[data-route-name="clients/[id]"]')).not.toBeNull();
});
