import React from 'react';
import { it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { post, login } = vi.hoisted(() => ({ post: vi.fn(), login: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { post },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ isAuthenticated: false, login }),
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') } }));

import LoginPage from '../LoginPage';

it('Bug UX-1382 — recovery-code copy failure is visible and retry announces success without acknowledging storage', async () => {
  const codes = ['AAAAA22222', 'BBBBB33333', 'CCCCC44444', 'DDDDD55555',
    'EEEEE66666', 'FFFFF77777', 'GGGGG88888', 'HHHHH99999'];
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const copy = vi.fn().mockRejectedValueOnce(new Error('synthetic permission denied'));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  post.mockImplementation(async (url: string) => {
    if (url.endsWith('/admin/login')) return { data: { data: { requires2FASetup: true, preAuthToken: 'synthetic-setup' } } };
    if (url.endsWith('/2fa/setup')) return { data: { data: { secret: 'SYNTHETIC', uri: 'otpauth://test' } } };
    if (url.endsWith('/2fa/enable')) return { data: { data: {
      backupCodes: codes,
      user: { id: 'synthetic-admin', role: 'admin', email: 'operator@example.invalid' },
    } } };
    throw new Error(`Unexpected request: ${url}`);
  });
  const view = render(<MemoryRouter><LoginPage /></MemoryRouter>);
  try {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'operator@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    fireEvent.change(await screen.findByLabelText('6-digit code from your authenticator app'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enable & Sign In' }));
    const list = await screen.findByRole('list', { name: 'One-time administrator recovery codes' });
    const continueButton = screen.getByRole('button', { name: 'Continue to the operations console' });
    const acknowledgement = screen.getByLabelText(/I saved these codes in a private password manager/);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all recovery codes' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Copy was blocked by this browser. Select the codes and save them manually.');
    expect(error).not.toHaveTextContent('synthetic permission denied');
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
    for (const code of codes) expect(list).toHaveTextContent(code);
    expect(acknowledgement).not.toBeChecked();
    expect(continueButton).toBeDisabled();
    expect(login).not.toHaveBeenCalled();

    let finishCopy!: () => void;
    copy.mockImplementationOnce(() => new Promise<void>(resolve => { finishCopy = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy all recovery codes' }));
    const pending = screen.getByRole('button', { name: 'Copying recovery codes…' });
    expect(pending).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(pending);
    expect(copy).toHaveBeenCalledTimes(2);
    await act(async () => { finishCopy(); });
    expect(screen.getByRole('status')).toHaveTextContent('Recovery codes copied. Save them in your secure location before continuing.');
    expect(acknowledgement).not.toBeChecked();
    expect(continueButton).toBeDisabled();
    expect(copy).toHaveBeenNthCalledWith(2, codes.join('\n'));
    expect(login).not.toHaveBeenCalled();

    // A later failed attempt must not retain the earlier copied claim. A
    // browser without Clipboard API support still offers the manual path.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Codes copied' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Select the codes and save them manually.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy all recovery codes' })).toBeEnabled();
    for (const code of codes) expect(list).toHaveTextContent(code);
    fireEvent.click(acknowledgement);
    expect(continueButton).toBeEnabled();
    expect(post).toHaveBeenCalledTimes(3);
    expect(login).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});
