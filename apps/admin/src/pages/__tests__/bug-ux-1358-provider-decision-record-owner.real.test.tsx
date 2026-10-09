import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Synthetic request failed' }));
import { mountProviderRecords, secondProviderId } from './helpers/provider-record-navigation';

it('Bug UX-1358 — an unfinished provider suspension confirmation cannot follow navigation to a different provider', async () => {
  const fixture = mountProviderRecords();
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend provider' }));
    expect(screen.getByRole('dialog', { name: 'Suspend Synthetic Alpha Services?' })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Suspension reason' }), { target: { value: 'Synthetic Alpha-only security case' } });
    await act(async () => { await fixture.router.navigate(`/providers/${secondProviderId}`); });
    // An obsolete modal may aria-hide the new page; still prove navigation
    // occurred before asserting that the old decision dialog was removed.
    expect(screen.getByRole('heading', { name: 'Synthetic Beta Services', hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiMocks.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Suspend provider' }));
    expect(screen.getByRole('dialog', { name: 'Suspend Synthetic Beta Services?' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Suspension reason' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiMocks.put).not.toHaveBeenCalled();
  } finally { fixture.close(); }
});
