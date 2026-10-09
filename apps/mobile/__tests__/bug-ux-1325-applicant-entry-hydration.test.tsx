import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '@/services/api';
import { ProviderApplicationSessionGate } from '@/components/ProviderApplicationSessionGate';
import { ProviderOnboardingDraftGuard } from '@/components/ProviderOnboardingDraftGuard';
import { resetApplicationSession, useApplicationSession } from '@/stores/provider-application-session.store';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { apiDraft, applicant, deferred, mockDraftSaves, revisionOne } from '../test-support/application-draft-fixture';
import RoleSelect from '../app/provider-onboarding/role-select';
import Categories from '../app/provider-onboarding/categories';

const mockApplicant = applicant;
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockRoute = 'role-select';
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mockApplicant }) }));
jest.mock('expo-router', () => ({ useSegments: () => ['provider-onboarding', mockRoute],
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }), Redirect: ({ href }: { href: string }) => <span>Redirect: {href}</span> }));
jest.mock('@/services/api', () => ({ __esModule: true, ApiError: class extends Error {},
  default: { get: jest.fn(), put: jest.fn() }, storage: { delete: jest.fn() } }));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Cleaning', slug: 'cleaning' }], isLoading: false, isError: false }) }));
function Flow() {
  return <ProviderApplicationSessionGate><ProviderOnboardingDraftGuard>
    {mockRoute === 'role-select' ? <RoleSelect /> : <Categories />}
  </ProviderOnboardingDraftGuard></ProviderApplicationSessionGate>;
}

it('Bug UX-1325 — customer entry stays available and a new provider choice survives draft hydration before real category controls mount', async () => {
  resetApplicationSession();
  useApplicationSession.setState({ phase: 'error', error: 'Draft storage unavailable' });
  const view = render(<Flow />);
  fireEvent.click(screen.getByText('I need services').closest('button')!);
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  expect(api.get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('I provide services').closest('button')!);
  expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/categories');
  const loading = deferred<ReturnType<typeof apiDraft>>();
  jest.mocked(api.get).mockReturnValueOnce(loading.promise);
  mockRoute = 'categories';
  view.rerender(<Flow />);
  expect(screen.queryByLabelText('Business / Professional Name')).toBeNull();
  await act(async () => loading.resolve(apiDraft(null)));
  expect(useOnboardingStore.getState().selectedRole).toBe('provider');
  fireEvent.change(screen.getByLabelText('Business / Professional Name'), { target: { value: 'Synthetic painting and cleaning' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Cleaning service category' }));
  mockDraftSaves();
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await waitFor(() => expect(mockPush).toHaveBeenLastCalledWith('/provider-onboarding/service-area'));
  expect(api.put).toHaveBeenCalledWith('/api/v1/providers/application-draft', expect.objectContaining({ expectedRevision: null,
    fields: expect.objectContaining({ businessName: 'Synthetic painting and cleaning', categoryIds: [revisionOne] }) }));
});
