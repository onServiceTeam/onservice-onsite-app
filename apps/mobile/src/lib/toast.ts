/**
 * Phase 14 Dispatch 11 — toast shim.
 *
 * The customer-screen patterns in Part 2B use `showToast(message, type)`.
 * This file forwards to the Zustand-backed `useToastStore` already wired
 * in `components/ui/Toast.tsx` so screens can call it without importing
 * the store directly.
 */

import { useToastStore } from '@/components/ui/Toast';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export function showToast(message: string, type: ToastType = 'info'): void {
  useToastStore.getState().show(message, type);
}

export function showRetryableToast(
  message: string,
  onRetry: () => void,
  type: ToastType = 'error',
): void {
  // Phase K MED-K22 fix — pass onRetry through to the Toast store so
  // the provider can render an inline "Retry" button (Pattern 7).
  // Pre-fix the onRetry callback was accepted but ignored, so users
  // saw an error toast with no recovery affordance.
  useToastStore.getState().show(message, type, {
    onAction: onRetry,
    actionLabel: 'Retry',
  });
}
