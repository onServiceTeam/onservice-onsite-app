import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

function OwnedQueryCache({ children }: { children: React.ReactNode }): React.ReactElement {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
  }));

  useEffect(() => () => { client.clear(); }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Never share a privileged record cache or route state with another operator. */
export default function AdminSessionQueries({ children }: { children: React.ReactNode }): React.ReactElement {
  const userId = useAuthStore((state) => state.user?.id);
  const role = useAuthStore((state) => state.user?.role);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const owner = authenticated && userId && role ? `${userId}:${role}` : 'signed-out';

  // The old client is retired, not emptied and handed to a new actor. Delayed
  // callbacks keep their old reference and cannot populate the new actor's cache.
  return <OwnedQueryCache key={owner}>{children}</OwnedQueryCache>;
}
