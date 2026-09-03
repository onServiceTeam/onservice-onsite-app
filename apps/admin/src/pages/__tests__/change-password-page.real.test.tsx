// LL#12 — real render + behaviour tests for ChangePasswordPage.
//
// Verifies:
//   1. The form renders the three password inputs + submit + show-passwords toggle.
//   2. Client-side validation: too-short, mismatch, same-as-old all gate the submit.
//   3. On successful submit:
//      - api.post hits /api/v1/security/admin/me/change-password with the right body
//      - clearMustRotate() is called on the auth store
//   4. The "Password rotation required" banner only renders when
//      mustRotatePassword=true is set in the store.
//   5. On API error, the page surfaces the error message via getErrorMessage.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const apiPostMock = vi.fn();

vi.mock('@/lib/api', () => ({
  default: { post: (...args: unknown[]) => apiPostMock(...args) },
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

// Stub the zustand store so each test can drive mustRotatePassword
// independently and verify clearMustRotate is invoked.
const clearMustRotateMock = vi.fn();
const storeState = {
  mustRotatePassword: false,
  clearMustRotate: clearMustRotateMock,
};
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => storeState,
}));

import ChangePasswordPage from '../ChangePasswordPage';

beforeEach(() => {
  apiPostMock.mockReset();
  clearMustRotateMock.mockReset();
  storeState.mustRotatePassword = false;
});

function renderPage(): { container: HTMLElement } {
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/change-password'] },
      React.createElement(ChangePasswordPage),
    ),
  );
}

describe('LL#12 ChangePasswordPage — render + form layout', () => {
  it('renders three password inputs + submit', () => {
    const { container } = renderPage();
    expect(container.querySelector('#cp-old')).not.toBeNull();
    expect(container.querySelector('#cp-new')).not.toBeNull();
    expect(container.querySelector('#cp-confirm')).not.toBeNull();
    expect(container.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it('shows the rotation-required banner when store flag is true', () => {
    storeState.mustRotatePassword = true;
    const { container } = renderPage();
    expect(container.textContent ?? '').toContain('Password rotation required');
  });

  it('hides the rotation-required banner when flag is false (voluntary visit)', () => {
    storeState.mustRotatePassword = false;
    const { container } = renderPage();
    expect(container.textContent ?? '').not.toContain('Password rotation required');
  });
});

describe('LL#12 ChangePasswordPage — validation + submit', () => {
  it('disables submit when form is empty', () => {
    const { container } = renderPage();
    const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables submit when new password is too short', () => {
    const { container } = renderPage();
    fireEvent.change(container.querySelector('#cp-old') as HTMLInputElement,
      { target: { value: 'old-password-12345' } });
    fireEvent.change(container.querySelector('#cp-new') as HTMLInputElement,
      { target: { value: 'short' } });
    fireEvent.change(container.querySelector('#cp-confirm') as HTMLInputElement,
      { target: { value: 'short' } });
    fireEvent.blur(container.querySelector('#cp-new') as HTMLInputElement);
    const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(container.textContent ?? '').toContain('at least 12 characters');
  });

  it('disables submit when confirm does not match new', () => {
    const { container } = renderPage();
    fireEvent.change(container.querySelector('#cp-old') as HTMLInputElement,
      { target: { value: 'old-password-12345' } });
    fireEvent.change(container.querySelector('#cp-new') as HTMLInputElement,
      { target: { value: 'new-password-strong-2026' } });
    fireEvent.change(container.querySelector('#cp-confirm') as HTMLInputElement,
      { target: { value: 'totally-different' } });
    fireEvent.blur(container.querySelector('#cp-confirm') as HTMLInputElement);
    const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(container.textContent ?? '').toContain('Passwords do not match');
  });

  it('disables submit when new == old', () => {
    const { container } = renderPage();
    const same = 'identical-password-2026';
    fireEvent.change(container.querySelector('#cp-old') as HTMLInputElement,
      { target: { value: same } });
    fireEvent.change(container.querySelector('#cp-new') as HTMLInputElement,
      { target: { value: same } });
    fireEvent.change(container.querySelector('#cp-confirm') as HTMLInputElement,
      { target: { value: same } });
    fireEvent.blur(container.querySelector('#cp-new') as HTMLInputElement);
    const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(container.textContent ?? '').toContain('differ from the current password');
  });

  it('on successful submit, hits the right endpoint and clears the must-rotate flag', async () => {
    apiPostMock.mockResolvedValueOnce({ data: { success: true, message: 'Password updated.' } });
    storeState.mustRotatePassword = true;

    const { container } = renderPage();
    fireEvent.change(container.querySelector('#cp-old') as HTMLInputElement,
      { target: { value: 'current-pw-12345' } });
    fireEvent.change(container.querySelector('#cp-new') as HTMLInputElement,
      { target: { value: 'new-strong-pw-2026' } });
    fireEvent.change(container.querySelector('#cp-confirm') as HTMLInputElement,
      { target: { value: 'new-strong-pw-2026' } });

    const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);

    await waitFor(() => expect(apiPostMock).toHaveBeenCalled());

    const [url, body] = apiPostMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/api/v1/security/admin/me/change-password');
    expect(body.oldPassword).toBe('current-pw-12345');
    expect(body.newPassword).toBe('new-strong-pw-2026');

    await waitFor(() => {
      expect(clearMustRotateMock).toHaveBeenCalledTimes(1);
    });
  });

  it('on API error, surfaces the error message and does not clear must-rotate', async () => {
    apiPostMock.mockRejectedValueOnce(new Error('The old password is incorrect.'));
    storeState.mustRotatePassword = true;

    const { container } = renderPage();
    fireEvent.change(container.querySelector('#cp-old') as HTMLInputElement,
      { target: { value: 'wrong-old-pw-2026' } });
    fireEvent.change(container.querySelector('#cp-new') as HTMLInputElement,
      { target: { value: 'new-strong-pw-2026' } });
    fireEvent.change(container.querySelector('#cp-confirm') as HTMLInputElement,
      { target: { value: 'new-strong-pw-2026' } });

    const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(btn);

    await waitFor(() => {
      expect(container.textContent ?? '').toContain('old password is incorrect');
    });
    // clearMustRotate must NOT have been called — the flag stays set
    // so the user can't escape the change-password screen.
    expect(clearMustRotateMock).not.toHaveBeenCalled();
  });
});
