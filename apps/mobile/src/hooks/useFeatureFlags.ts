/**
 * Phase 14 Dispatch 13 — Feature flag hook (mobile).
 *
 * Bug 44 (promo redemption pulled for v1.0) + Bug 45 (A/B testing pulled
 * for v1.0). The flags arrive in the existing /api/v1/config response
 * under `featureFlags`. Defaults to OFF if the request fails so a
 * customer never sees a UI for an unwired feature.
 */

import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export interface FeatureFlags {
  promoRedemptionEnabled: boolean;
  abTestingEnabled: boolean;
}

export interface ClientConfigResponse {
  data: {
    featureFlags?: FeatureFlags;
    appVersion?: string;
  };
}

const DEFAULT_FLAGS: FeatureFlags = {
  promoRedemptionEnabled: false,
  abTestingEnabled: false,
};

export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery<ClientConfigResponse['data']>({
    queryKey: ['client-config'],
    queryFn: async () => {
      const res = await api.get<ClientConfigResponse['data']>('/api/v1/config');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
  return data?.featureFlags ?? DEFAULT_FLAGS;
}

export default useFeatureFlags;
