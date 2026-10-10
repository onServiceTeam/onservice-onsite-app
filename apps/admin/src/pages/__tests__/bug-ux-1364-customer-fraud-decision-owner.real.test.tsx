import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Synthetic request failed' }));
import { mountCustomerRecords, secondCustomerId } from './helpers/customer-record-navigation';

it('Bug UX-1364 — a dispute-tab fraud-review confirmation cannot follow navigation into a different customer record', async () => {
  const fixture = mountCustomerRecords('disputes');
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Flag for fraud review' }));
    expect(screen.getByRole('dialog', { name: 'Flag customer for fraud review?' })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Fraud-review reason' }), { target: { value: 'Synthetic Alpha-only observable case pattern' } });
    await act(async () => { await fixture.router.navigate(`/customers/${secondCustomerId}?tab=disputes`); });
    expect(screen.getByRole('heading', { name: fixture.second.fullName, hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Flag for fraud review' }));
    expect(screen.getByRole('textbox', { name: 'Fraud-review reason' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiMocks.put).not.toHaveBeenCalled();
  } finally { fixture.close(); }
});
