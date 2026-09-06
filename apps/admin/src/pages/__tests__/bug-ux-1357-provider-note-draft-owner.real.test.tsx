import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const apiMocks = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ data: { data: [] } }), post: vi.fn().mockResolvedValue({ data: {} }), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Synthetic request failed' }));
import { mountProviderRecords, secondProviderId } from './helpers/provider-record-navigation';

it('Bug UX-1357 — an internal-note draft for one provider cannot be saved under a different cached provider', async () => {
  const fixture = mountProviderRecords('notes');
  try {
    fireEvent.change(await screen.findByRole('textbox', { name: 'Internal note' }), { target: { value: 'Synthetic Alpha-only case details' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Note category' }), { target: { value: 'quality' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pin to top' }));
    await act(async () => {
      fixture.client.setQueryData(['admin-provider-profile', fixture.first.id], {
        ...fixture.first, businessName: 'Refreshed Synthetic Alpha Services',
      });
    });
    expect(await screen.findByRole('heading', { name: 'Refreshed Synthetic Alpha Services' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Internal note' })).toHaveValue('Synthetic Alpha-only case details');
    expect(screen.getByRole('combobox', { name: 'Note category' })).toHaveValue('quality');
    expect(screen.getByRole('checkbox', { name: 'Pin to top' })).toBeChecked();
    await act(async () => { await fixture.router.navigate(`/providers/${secondProviderId}?tab=notes`); });
    expect(await screen.findByRole('heading', { name: 'Synthetic Beta Services' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Internal note' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Note category' })).toHaveValue('general');
    expect(screen.getByRole('checkbox', { name: 'Pin to top' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save Note' })).toBeDisabled();
    expect(apiMocks.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Internal note' }), { target: { value: 'New Synthetic Beta case details' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Note' }));
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(`/api/v1/admin/providers/${secondProviderId}/notes`, {
      body: 'New Synthetic Beta case details', category: 'general', pinned: false,
    }));
  } finally { fixture.close(); }
});
