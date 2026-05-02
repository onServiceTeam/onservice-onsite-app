/**
 * Phase 14 Dispatch 13 — Feature flag hook (mobile).
 *
 * Bug 44 (promo redemption pulled for v1.0) + Bug 45 (A/B testing pulled
 * for v1.0). The flags arrive in the existing /api/v1/config response
 * under `featureFlags`. Defaults to OFF if the request fails so a
 * customer never sees a UI for an unwired feature.
 *
 * Phase L MED-L02/L03 fix — pre-fix this hook returned DEFAULT_FLAGS
 * unconditionally because the response shape destructure was wrong.
 * The real /api/v1/config wire format is
 *   { success: true, data: { featureFlags: {...}, appVersion, ... } }
 * Pre-fix: queryFn returned `res.data` (the envelope) and
 * `data?.featureFlags` looked for featureFlags on { success, data } —
 * never present. Post-fix: queryFn returns `res.data.data` (the inner
 * config), aligning with the admin hook's destructure.
 */

import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export interface FeatureFlags {
  promoRedemptionEnabled: boolean;
  abTestingEnabled: boolean;
}

export interface ClientConfig {
  featureFlags?: FeatureFlags;
  appVersion?: string;
}

interface ClientConfigEnvelope {
  success: boolean;
  data: ClientConfig;
}

const DEFAULT_FLAGS: FeatureFlags = {
  promoRedemptionEnabled: false,
  abTestingEnabled: false,
};

export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery<ClientConfig>({
    queryKey: ['client-config'],
    queryFn: async () => {
      const res = await api.get<ClientConfigEnvelope>('/api/v1/config');
      // L02/L03 fix: extract the inner data envelope so featureFlags
      // is reachable. Pre-fix returned res.data (the envelope) so
      // data.featureFlags was always undefined → DEFAULT_FLAGS forever.
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
  return data?.featureFlags ?? DEFAULT_FLAGS;
}

export default useFeatureFlags;
