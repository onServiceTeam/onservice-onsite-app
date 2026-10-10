import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Synthetic request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'synthetic-admin', role: 'admin' } }),
}));
import { mountProviderRecords, firstProviderId, secondProviderId } from './helpers/provider-record-navigation';

it('Bug UX-1356 — cached provider navigation cannot carry a completed or delayed contact reveal into another record', async () => {
  for (const delayed of [false, true]) {
    apiMocks.post.mockReset(); apiMocks.get.mockReset();
    const firstResult = { data: { data: { phone: '+639170001111', email: 'alpha@example.invalid' } } };
    let complete!: (value: typeof firstResult) => void;
    const pending = new Promise<typeof firstResult>(resolve => { complete = resolve; });
    apiMocks.post.mockImplementationOnce(() => delayed ? pending : Promise.resolve(firstResult));
    const fixture = mountProviderRecords();
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Reveal contact' }));
      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(`/api/v1/admin/providers/${firstProviderId}/reveal-contact`, {}));
      if (!delayed) expect(await screen.findByText('+639170001111')).toBeVisible();
      await act(async () => { await fixture.router.navigate(`/providers/${secondProviderId}`); });
      expect(await screen.findByRole('heading', { name: 'Synthetic Beta Services' })).toBeVisible();
      if (delayed) {
        await act(async () => { complete(firstResult); await pending; });
        await waitFor(() => expect(fixture.client.getMutationCache().getAll()[0]?.state.status).toBe('success'));
      }
      expect(screen.queryByText('+639170001111')).toBeNull();
      expect(screen.queryByText('alpha@example.invalid')).toBeNull();
      expect(screen.getByText('+63917****222')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Reveal contact' })).toBeEnabled();
      apiMocks.post.mockResolvedValueOnce({ data: { data: { phone: '+639170002222', email: null } } });
      fireEvent.click(screen.getByRole('button', { name: 'Reveal contact' }));
      expect(await screen.findByText('+639170002222')).toBeVisible();
      expect(apiMocks.post).toHaveBeenLastCalledWith(`/api/v1/admin/providers/${secondProviderId}/reveal-contact`, {});
      expect(fixture.client.getQueryData(['admin-provider-profile', firstProviderId])).toEqual(fixture.first);
      expect(fixture.client.getQueryData(['admin-provider-profile', secondProviderId])).toEqual(fixture.second);
      expect(apiMocks.get).not.toHaveBeenCalled(); // Both profiles really came from the warm cache.
    } finally { fixture.close(); }
  }
});
