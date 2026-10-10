import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import { ProfileTab } from '../ProviderDetailPage';
import { mountSubmission, signIn, json, base, revisionId } from './helpers/provider-submission-fixture';

afterEach(() => vi.unstubAllGlobals());

it('Private submitted documents load only on request and retire previews and delayed bytes with their provider or operator', async () => {
  const create = vi.fn(() => 'blob:synthetic-submission');
  const revoke = vi.fn();
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
  const fixture = mountSubmission();
  const documentUrl = `${base}/${revisionId}/kyc/government_id_front`;
  const blobResponse = (type = 'image/png'): Response => ({ ok: true, status: 200,
    blob: async () => new Blob(['synthetic original document bytes'], { type }),
  }) as Response;
  const open = async (): Promise<void> => {
    fireEvent.click(screen.getByRole('button', { name: 'Review submitted applications' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View submission 1' }));
    await screen.findByRole('button', { name: 'Load submitted Government ID (front)' });
  };
  try {
    await open();
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Open loaded/ })).toBeNull();
    fixture.fetcher.mockResolvedValueOnce(blobResponse());
    fireEvent.click(screen.getByRole('button', { name: 'Load submitted Government ID (front)' }));
    expect(await screen.findByRole('img', { name: 'Submitted Government ID (front)' })).toHaveAttribute('src', 'blob:synthetic-submission');
    expect(screen.getByRole('link', { name: 'Open loaded Government ID (front) in new tab' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(fixture.fetcher).toHaveBeenLastCalledWith(documentUrl, expect.objectContaining({ method: 'GET', credentials: 'include', signal: expect.any(globalThis.AbortSignal) }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Government ID (front) preview' }));
    expect(revoke).toHaveBeenCalledWith('blob:synthetic-submission');
    expect(screen.queryByRole('img', { name: 'Submitted Government ID (front)' })).toBeNull();
    for (const response of [json(null, 404), blobResponse('text/html'), blobResponse('image/svg+xml')]) {
      fixture.fetcher.mockResolvedValueOnce(response);
      fireEvent.click(screen.getByRole('button', { name: 'Load submitted Government ID (front)' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No replacement file was opened');
      expect(screen.queryByRole('link', { name: /Open loaded/ })).toBeNull();
      expect(create).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Reset document preview' }));
    }
    let finish!: (value: Response) => void;
    const delayed = new Promise<Response>(resolve => { finish = resolve; });
    fixture.fetcher.mockReturnValueOnce(delayed);
    fireEvent.click(screen.getByRole('button', { name: 'Load submitted Government ID (front)' }));
    await screen.findByText('Loading submitted Government ID (front)...');
    act(() => signIn()); // Same operator, fresh sign-in ownership.
    expect(screen.getByRole('button', { name: 'Review submitted applications' })).toHaveAttribute('aria-expanded', 'false');
    await act(async () => { finish(blobResponse()); await delayed; });
    expect(create).toHaveBeenCalledTimes(1);
    expect(fixture.fetcher.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
    await open();
    fixture.fetcher.mockResolvedValueOnce(blobResponse('application/pdf'));
    fireEvent.click(screen.getByRole('button', { name: 'Load submitted Government ID (front)' }));
    expect(await screen.findByRole('link', { name: /Open loaded Government ID/ })).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Submitted Government ID (front)' })).toBeNull();
    fixture.rerender(<ProfileTab profile={{ ...fixture.profile, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }} />);
    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('link', { name: /Open loaded/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Review submitted applications' })).toHaveAttribute('aria-expanded', 'false');
  } finally { fixture.unmount(); }
});
