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
  _onRetry: () => void,
  type: ToastType = 'error',
): void {
  // v1.0: surfaces the error message; the screen's existing retry button
  // is the recovery affordance. v1.1+ will inline an action button on the
  // toast itself per Part 2B Pattern 7.
  useToastStore.getState().show(message, type);
}
