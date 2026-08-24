import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

/** Clear account-scoped server data whenever the active identity changes. */
export function AccountQueryCacheGate(): null {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }, [queryClient, userId]);

  return null;
}

export default AccountQueryCacheGate;
