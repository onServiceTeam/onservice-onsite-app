import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Synthetic request failed' }));
import { mountCustomerRecords, secondCustomerId } from './helpers/customer-record-navigation';

it('Bug UX-1362 — wallet adjustment drafts survive their own customer refresh but never move to another customer', async () => {
  const fixture = mountCustomerRecords('payments');
  try {
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Amount (PHP)' }), { target: { value: '100.00' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason (min 5 chars)' }), { target: { value: 'Synthetic Alpha-specific adjustment draft' } });
    expect(screen.getByRole('button', { name: 'Submit wallet adjustment' })).toBeEnabled();
    await act(async () => {
      fixture.client.setQueryData(['admin-customer-profile', fixture.first.id], { ...fixture.first, fullName: 'Refreshed Alpha Customer' });
    });
    expect(await screen.findByRole('heading', { name: 'Refreshed Alpha Customer' })).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'Amount (PHP)' })).toHaveValue(100);
    expect(screen.getByRole('textbox', { name: 'Reason (min 5 chars)' })).toHaveValue('Synthetic Alpha-specific adjustment draft');
    await act(async () => { await fixture.router.navigate(`/customers/${secondCustomerId}?tab=payments`); });
    expect(await screen.findByRole('heading', { name: fixture.second.fullName })).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'Amount (PHP)' })).toHaveValue(null);
    expect(screen.getByRole('textbox', { name: 'Reason (min 5 chars)' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Submit wallet adjustment' })).toBeDisabled();
    expect(apiMocks.post).not.toHaveBeenCalled();
  } finally { fixture.close(); }
});
