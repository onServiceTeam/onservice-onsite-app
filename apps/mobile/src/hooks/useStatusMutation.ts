/**
 * Phase 14 Dispatch 12 — Pattern P2: status-changing action with haptic
 * feedback.
 *
 * Wraps `useMutation` with three haptic events: an impact on mutate
 * (button-press confirm), a success notification on success, and an
 * error notification on failure. Used on every provider job-execution
 * status transition: Start travel, I've arrived, Start job, Mark complete.
 *
 * Bug 1215, 1221 (haptic feedback chain) + Bug 1213, 1214, 1217-1220
 * (every status-changing button in the provider job flow).
 */

import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';

export interface StatusMutationOptions {
  confirmHaptic?: 'light' | 'medium' | 'heavy';
}

export function useStatusMutation<TData = unknown, TVar = void>(
  mutationFn: (vars: TVar) => Promise<TData>,
  options?: StatusMutationOptions & Omit<UseMutationOptions<TData, unknown, TVar>, 'mutationFn'>,
) {
  const { confirmHaptic = 'medium', ...rest } = options ?? {};

  return useMutation<TData, unknown, TVar>({
    ...rest,
    mutationFn,
    onMutate: async (...args) => {
      const style =
        confirmHaptic === 'heavy'
          ? Haptics.ImpactFeedbackStyle.Heavy
          : confirmHaptic === 'medium'
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light;
      await Haptics.impactAsync(style).catch(() => undefined);
      return rest.onMutate?.(...args);
    },
    onSuccess: async (data, variables, context) => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      return rest.onSuccess?.(data, variables, context);
    },
    onError: async (error, variables, context) => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
      return rest.onError?.(error, variables, context);
    },
  });
}

export default useStatusMutation;
