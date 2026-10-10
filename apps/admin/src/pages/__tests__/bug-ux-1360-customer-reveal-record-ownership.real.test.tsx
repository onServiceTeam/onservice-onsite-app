import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Synthetic request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'synthetic-admin', role: 'admin' } }),
}));
import { mountCustomerRecords, firstCustomerId, secondCustomerId } from './helpers/customer-record-navigation';

it('Bug UX-1360 — a completed or delayed customer contact reveal cannot enter another cached customer record', async () => {
  for (const delayed of [false, true]) {
    apiMocks.post.mockReset(); apiMocks.get.mockReset();
    const result = { data: { data: { phone: '+639180001111', email: 'alpha.customer@example.invalid' } } };
    let complete!: (value: typeof result) => void;
    const pending = new Promise<typeof result>(resolve => { complete = resolve; });
    apiMocks.post.mockImplementationOnce(() => delayed ? pending : Promise.resolve(result));
    const fixture = mountCustomerRecords();
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Reveal contact' }));
      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(`/api/v1/admin/customers/${firstCustomerId}/reveal-contact`, {}));
      if (!delayed) expect(await screen.findByText('+639180001111')).toBeVisible();
      await act(async () => { await fixture.router.navigate(`/customers/${secondCustomerId}`); });
      expect(await screen.findByRole('heading', { name: fixture.second.fullName })).toBeVisible();
      if (delayed) {
        await act(async () => { complete(result); await pending; });
        await waitFor(() => expect(fixture.client.getMutationCache().getAll()[0]?.state.status).toBe('success'));
      }
      expect(screen.queryByText('+639180001111')).toBeNull();
      expect(screen.queryByText('alpha.customer@example.invalid')).toBeNull();
      expect(screen.getByText('+63918****222')).toBeVisible();
      apiMocks.post.mockResolvedValueOnce({ data: { data: { phone: '+639180002222', email: null } } });
      fireEvent.click(screen.getByRole('button', { name: 'Reveal contact' }));
      expect(await screen.findByText('+639180002222')).toBeVisible();
      expect(apiMocks.post).toHaveBeenLastCalledWith(`/api/v1/admin/customers/${secondCustomerId}/reveal-contact`, {});
      expect(fixture.client.getQueryData(['admin-customer-profile', firstCustomerId])).toEqual(fixture.first);
      expect(fixture.client.getQueryData(['admin-customer-profile', secondCustomerId])).toEqual(fixture.second);
      expect(apiMocks.get).not.toHaveBeenCalled();
    } finally { fixture.close(); }
  }
});
