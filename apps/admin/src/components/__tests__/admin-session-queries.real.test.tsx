import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
vi.unmock('@/stores/auth.store');
import AdminSessionQueries from '../AdminSessionQueries';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';

const supervisor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: 'super_admin', firstName: 'Synthetic', lastName: 'Supervisor',
  phone: '', email: null, avatarUrl: null };
const operator: AdminUser = { ...supervisor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'admin' };
type RecordData = { label: string };

function setActor(user: AdminUser | null): void {
  useAuthStore.setState({ user, isAuthenticated: Boolean(user), isLoading: false, mustRotatePassword: false });
}

function Probe({ read, lateWrite }: {
  read: () => Promise<RecordData>;
  lateWrite?: (client: QueryClient) => void;
}): React.ReactElement {
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const query = useQuery({ queryKey: ['protected-record'], queryFn: read, retry: false });
  return <>
    <p>{query.data?.label ?? 'Loading private record'}</p>
    <input aria-label="Operator draft" value={draft} onChange={event => setDraft(event.target.value)} />
    <button onClick={() => lateWrite?.(client)}>Start delayed callback</button>
  </>;
}

it('retains cached data and unsaved route state when the same operator profile refreshes', async () => {
  setActor(supervisor);
  const read = vi.fn().mockResolvedValue({ label: 'Current actor record' });
  const view = render(<AdminSessionQueries><Probe read={read} /></AdminSessionQueries>);
  try {
    expect(await screen.findByText('Current actor record')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Operator draft' }), { target: { value: 'Keep my unfinished review' } });
    await act(async () => { setActor({ ...supervisor, firstName: 'Refreshed synthetic name' }); });
    expect(screen.getByRole('textbox', { name: 'Operator draft' })).toHaveValue('Keep my unfinished review');
    expect(screen.getByText('Current actor record')).toBeVisible();
    expect(read).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); setActor(null); }
});

it('starts a new cache and empty route draft when the same operator ID changes role', async () => {
  setActor(supervisor);
  const read = vi.fn(async () => ({ label: useAuthStore.getState().user?.role === 'super_admin' ? 'Privileged record' : 'Masked record' }));
  const view = render(<AdminSessionQueries><Probe read={read} /></AdminSessionQueries>);
  try {
    expect(await screen.findByText('Privileged record')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Operator draft' }), { target: { value: 'Privileged unfinished action' } });
    await act(async () => { setActor({ ...supervisor, role: 'admin' }); });
    expect(screen.queryByText('Privileged record')).toBeNull();
    expect(await screen.findByText('Masked record')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Operator draft' })).toHaveValue('');
    expect(read).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); setActor(null); }
});

it('does not adopt an outstanding privileged query when another operator signs in', async () => {
  setActor(supervisor);
  let complete!: (data: RecordData) => void;
  const oldRequest = new Promise<RecordData>(resolve => { complete = resolve; });
  const read = vi.fn(() => useAuthStore.getState().user?.id === supervisor.id
    ? oldRequest : Promise.resolve({ label: 'New operator masked record' }));
  const view = render(<AdminSessionQueries><Probe read={read} /></AdminSessionQueries>);
  try {
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await act(async () => { setActor(operator); });
    expect(await screen.findByText('New operator masked record')).toBeVisible();
    await act(async () => { complete({ label: 'Late privileged response' }); await oldRequest; });
    expect(screen.queryByText('Late privileged response')).toBeNull();
    expect(screen.getByText('New operator masked record')).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); setActor(null); }
});

it('an old callback writing through its captured client cannot repopulate the new operator cache', async () => {
  setActor(supervisor);
  let complete!: () => void;
  const oldWork = new Promise<void>(resolve => { complete = resolve; });
  let oldClient: QueryClient | undefined;
  let wrote = false;
  const read = vi.fn(async () => ({ label: useAuthStore.getState().user?.id === supervisor.id ? 'Old private record' : 'Current masked record' }));
  const lateWrite = (client: QueryClient): void => {
    oldClient = client;
    void oldWork.then(() => {
      client.setQueryData(['protected-record'], { label: 'Old callback private payload' });
      wrote = true;
    });
  };
  const view = render(<AdminSessionQueries><Probe read={read} lateWrite={lateWrite} /></AdminSessionQueries>);
  try {
    expect(await screen.findByText('Old private record')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Start delayed callback' }));
    await act(async () => { setActor(operator); });
    expect(await screen.findByText('Current masked record')).toBeVisible();
    await act(async () => { complete(); await oldWork; });
    await waitFor(() => expect(wrote).toBe(true));
    expect(oldClient?.getQueryData(['protected-record'])).toEqual({ label: 'Old callback private payload' });
    expect(screen.queryByText('Old callback private payload')).toBeNull();
    expect(screen.getByText('Current masked record')).toBeVisible();
  } finally { view.unmount(); oldClient?.clear(); setActor(null); }
});
