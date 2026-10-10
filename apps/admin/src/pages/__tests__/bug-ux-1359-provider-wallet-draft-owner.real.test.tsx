import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Synthetic request failed' }));
import { mountProviderRecords, secondProviderId } from './helpers/provider-record-navigation';

it('Bug UX-1359 — a wallet-adjustment draft cannot carry its amount and reason into another cached provider account', async () => {
  const fixture = mountProviderRecords('financials');
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Adjust Wallet' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Wallet adjustment amount in PHP' }), { target: { value: '100.00' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Wallet adjustment reason' }), { target: { value: 'Synthetic Alpha-specific adjustment draft' } });
    expect(screen.getByRole('button', { name: 'Submit Adjustment' })).toBeEnabled();
    await act(async () => { await fixture.router.navigate(`/providers/${secondProviderId}?tab=financials`); });
    expect(await screen.findByRole('heading', { name: 'Synthetic Beta Services' })).toBeVisible();
    expect(screen.queryByRole('spinbutton', { name: 'Wallet adjustment amount in PHP' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit Adjustment' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Wallet' }));
    expect(screen.getByRole('spinbutton', { name: 'Wallet adjustment amount in PHP' })).toHaveValue(null);
    expect(screen.getByRole('textbox', { name: 'Wallet adjustment reason' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Submit Adjustment' })).toBeDisabled();
    expect(apiMocks.post).not.toHaveBeenCalled(); // No ledger endpoint is exercised or changed.
  } finally { fixture.close(); }
});
