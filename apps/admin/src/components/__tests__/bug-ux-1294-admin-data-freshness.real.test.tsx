import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DataFreshness from '../ui/DataFreshness';

it('Bug UX-1294 - operator workspaces show the last successful refresh and expose a disabled refresh state while fetching', () => {
  const onRefresh = vi.fn();
  const { rerender } = render(
    <DataFreshness
      label="Dispute queue"
      timestamp={Date.now() - 120_000}
      onRefresh={onRefresh}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Dispute queue: Last successful update 2m ago.');
  const refreshButton = screen.getByRole('button', { name: 'Refresh Dispute queue' });
  expect(refreshButton).toHaveTextContent('Refresh');
  fireEvent.click(refreshButton);
  expect(onRefresh).toHaveBeenCalledTimes(1);

  rerender(
    <DataFreshness
      label="Dispute queue"
      timestamp={Date.now() - 120_000}
      isFetching
      onRefresh={onRefresh}
    />,
  );

  expect(screen.getByRole('button', { name: 'Refresh Dispute queue' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Refresh Dispute queue' })).toHaveTextContent('Refreshing…');
});
