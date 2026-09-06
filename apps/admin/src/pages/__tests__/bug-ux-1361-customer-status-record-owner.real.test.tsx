import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Synthetic request failed' }));
import { mountCustomerRecords, secondCustomerId } from './helpers/customer-record-navigation';

it('Bug UX-1361 — customer suspension confirmations and their status tray cannot follow a different cached customer', async () => {
  const fixture = mountCustomerRecords();
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Manage status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(screen.getByRole('dialog', { name: `Suspend ${fixture.first.fullName}?` })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Suspension reason' }), { target: { value: 'Synthetic Alpha-only security case' } });
    await act(async () => { await fixture.router.navigate(`/customers/${secondCustomerId}`); });
    expect(screen.getByRole('heading', { name: fixture.second.fullName, hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Manage status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(screen.getByRole('dialog', { name: `Suspend ${fixture.second.fullName}?` })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Suspension reason' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiMocks.put).not.toHaveBeenCalled();
  } finally { fixture.close(); }
});
