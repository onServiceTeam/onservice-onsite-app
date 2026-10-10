import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Synthetic request failed' }));
import { mountCustomerRecords, secondCustomerId } from './helpers/customer-record-navigation';

it('Bug UX-1363 — a force-sign-out confirmation cannot remain open for a different cached customer', async () => {
  const fixture = mountCustomerRecords();
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Force sign-out' }));
    expect(screen.getByRole('dialog', { name: `Force ${fixture.first.fullName} to sign in again?` })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Security or support reason' }), { target: { value: 'Synthetic Alpha-only lost device case' } });
    await act(async () => { await fixture.router.navigate(`/customers/${secondCustomerId}`); });
    expect(screen.getByRole('heading', { name: fixture.second.fullName, hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Force sign-out' }));
    expect(screen.getByRole('dialog', { name: `Force ${fixture.second.fullName} to sign in again?` })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Security or support reason' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiMocks.post).not.toHaveBeenCalled();
  } finally { fixture.close(); }
});
