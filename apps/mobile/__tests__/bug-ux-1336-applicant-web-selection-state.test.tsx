import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Categories from '../app/provider-onboarding/categories';
import Area from '../app/provider-onboarding/service-area';
import Terms from '../app/provider-onboarding/terms';
import { completeApplicationFields, readyApplication } from '../test-support/application-draft-fixture';

jest.mock('@tanstack/react-query', () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({
  data: queryKey[0] === 'categories'
    ? [{ id: '11111111-1111-4111-8111-111111111111', name: 'Cleaning', slug: 'cleaning' }]
    : [{ id: '22222222-2222-4222-8222-222222222222', name: 'Cebu', city: 'Cebu City', province: 'Cebu', status: 'active' }],
  isLoading: false, isError: false,
}) }));
jest.mock('react-native', () => {
  const native = jest.requireActual('../__mocks__/react-native.js');
  const runtime = require('react') as typeof React;
  // The installed RN Web control ignores accessibilityState.checked, observed
  // in the compiled browser. Do not let the shared native mock invent it.
  return { ...native, TouchableOpacity: ({ accessibilityState, ...props }: { accessibilityState?: { disabled?: boolean } }) =>
    runtime.createElement(native.TouchableOpacity, { ...props, accessibilityState: { disabled: accessibilityState?.disabled } }) };
});

it('Bug UX-1336 — applicant category, market and agreement choices expose their current checked state to web users', () => {
  readyApplication(completeApplicationFields());
  const categories = render(<Categories />);
  const cleaning = screen.getByRole('checkbox', { name: 'Cleaning service category' });
  expect(cleaning.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(cleaning);
  expect(cleaning.getAttribute('aria-checked')).toBe('false');
  categories.unmount();
  const area = render(<Area />);
  expect(screen.getByRole('radio', { name: 'Cebu, Active market' }).getAttribute('aria-checked')).toBe('true');
  area.unmount();
  render(<Terms />);
  const agreement = screen.getByRole('checkbox', { name: 'Accept the Independent Contractor Agreement and Terms of Service' });
  expect(agreement.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(agreement);
  expect(agreement.getAttribute('aria-checked')).toBe('true');
});
