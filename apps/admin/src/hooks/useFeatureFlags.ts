/**
 * Phase 14 Dispatch 13 — Feature flag hook (admin web).
 *
 * Bug 44 (promo redemption pulled for v1.0) + Bug 45 (A/B testing pulled
 * for v1.0). The flags arrive in the existing /api/v1/config response
 * under `featureFlags`. Admin UI uses these to:
 * 1. Hide the A/B Tests tab on AnalyticsPage when ab_testing_enabled is false.
 * 2. Show a banner on MarketingPage Promo Codes tab explaining unwired state.
 *
 * Defaults to OFF if the request fails.
 */

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface FeatureFlags {
  promoRedemptionEnabled: boolean;
  abTestingEnabled: boolean;
}

interface ClientConfigResponse {
  data: {
    featureFlags?: FeatureFlags;
  };
}

const DEFAULT_FLAGS: FeatureFlags = {
  promoRedemptionEnabled: false,
  abTestingEnabled: false,
};

export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery<ClientConfigResponse>({
    queryKey: ['client-config'],
    queryFn: async () => (await api.get<ClientConfigResponse>('/api/v1/config')).data,
    staleTime: 5 * 60_000,
  });
  return data?.data.featureFlags ?? DEFAULT_FLAGS;
}

export default useFeatureFlags;
