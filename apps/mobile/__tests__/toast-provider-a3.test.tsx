/**
 * A3 / C3 — the mobile toast renderer is actually mounted and functional.
 *
 * The bug (C3): showToast() wrote to the toast store, but the component that
 * renders toasts (ToastProvider) was never mounted, so showToast() was silent
 * on native. The fix mounts <ToastProvider /> at the app root in
 * apps/mobile/app/_layout.tsx.
 *
 * These are real DOM-render tests of the renderer + the showToast/
 * showRetryableToast wiring (the exact unit that was broken): with the
 * provider mounted, driving it through the public showToast() helpers renders
 * the message and a working Retry action. The _layout mount itself is then
 * verified on the live web build after deploy.
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { ToastProvider, useToastStore } from '@/components/ui/Toast';
import { showToast, showRetryableToast } from '@/lib/toast';

afterEach(() => {
  // Reset the shared store between tests so toasts don't leak across cases.
  act(() => {
    useToastStore.getState().hide();
  });
});

describe('A3 — toast renderer', () => {
  it('A3 — renders nothing until a toast is shown', () => {
    const { container } = render(<ToastProvider />);
    expect(container.textContent).toBe('');
  });

  it('A3 — showToast renders the message once the provider is mounted', () => {
    const { container } = render(<ToastProvider />);
    act(() => {
      showToast('Saved', 'success');
    });
    expect(container.textContent).toContain('Saved');
  });

  it('A3 — showRetryableToast renders a working Retry button', () => {
    const onRetry = jest.fn();
    const { container, getByRole } = render(<ToastProvider />);
    act(() => {
      showRetryableToast('Network error', onRetry);
    });
    expect(container.textContent).toContain('Network error');

    const retry = getByRole('button', { name: 'Retry' });
    act(() => {
      retry.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
