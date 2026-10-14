/**
 * D38 Milestone 2: the request engine and job-media settings from the public
 * /api/v1/config bundle (packages/api settings.service getClientConfig).
 *
 * The server enforces every one of these values; the app uses them only for
 * display, form limits and polling. Until the config loads (or when an older
 * server leaves a key out) the defaults below, which match the migration
 * defaults, are used. Shares the ['client-config'] cache entry with
 * useFeatureFlags and useRequestFirstBooking, so one request serves all three.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export interface JobMediaLimits {
  maxPhotos: number;
  photoMaxBytes: number;
  videoMaxSeconds: number;
  videoMaxBytes: number;
  voiceMaxSeconds: number;
  voiceMaxBytes: number;
}

export interface RequestConfig {
  requestMaxOpenQuotes: number;
  requestMaxRounds: number;
  requestShowDeclinedAmount: boolean;
  requestProviderPollSeconds: number;
  requestStillLookingMinutes: number;
  requestThreadsEnabled: boolean;
  jobMedia: JobMediaLimits;
}

/** Migration 183-185 defaults (merged plan 2.1), with 6 photos as settled. */
export const REQUEST_CONFIG_DEFAULTS: RequestConfig = {
  requestMaxOpenQuotes: 1,
  requestMaxRounds: 3,
  requestShowDeclinedAmount: false,
  requestProviderPollSeconds: 30,
  requestStillLookingMinutes: 30,
  requestThreadsEnabled: true,
  jobMedia: {
    maxPhotos: 6,
    photoMaxBytes: 10_485_760,
    videoMaxSeconds: 30,
    videoMaxBytes: 83_886_080,
    voiceMaxSeconds: 60,
    voiceMaxBytes: 2_097_152,
  },
};

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Read the config bundle defensively: wrong types fall back to the defaults. */
export function resolveRequestConfig(raw: Record<string, unknown> | null | undefined): RequestConfig {
  const d = REQUEST_CONFIG_DEFAULTS;
  const media = (raw?.jobMedia ?? {}) as Record<string, unknown>;
  return {
    requestMaxOpenQuotes: positiveInt(raw?.requestMaxOpenQuotes, d.requestMaxOpenQuotes),
    requestMaxRounds: positiveInt(raw?.requestMaxRounds, d.requestMaxRounds),
    requestShowDeclinedAmount: typeof raw?.requestShowDeclinedAmount === 'boolean'
      ? raw.requestShowDeclinedAmount : d.requestShowDeclinedAmount,
    requestProviderPollSeconds: positiveInt(raw?.requestProviderPollSeconds, d.requestProviderPollSeconds),
    requestStillLookingMinutes: positiveInt(raw?.requestStillLookingMinutes, d.requestStillLookingMinutes),
    requestThreadsEnabled: typeof raw?.requestThreadsEnabled === 'boolean'
      ? raw.requestThreadsEnabled : d.requestThreadsEnabled,
    jobMedia: {
      maxPhotos: nonNegativeInt(media.maxPhotos, d.jobMedia.maxPhotos),
      photoMaxBytes: positiveInt(media.photoMaxBytes, d.jobMedia.photoMaxBytes),
      videoMaxSeconds: positiveInt(media.videoMaxSeconds, d.jobMedia.videoMaxSeconds),
      videoMaxBytes: positiveInt(media.videoMaxBytes, d.jobMedia.videoMaxBytes),
      voiceMaxSeconds: positiveInt(media.voiceMaxSeconds, d.jobMedia.voiceMaxSeconds),
      voiceMaxBytes: positiveInt(media.voiceMaxBytes, d.jobMedia.voiceMaxBytes),
    },
  };
}

interface ClientConfigEnvelope {
  success: boolean;
  data?: Record<string, unknown>;
}

export function useRequestConfig(): RequestConfig {
  const { data } = useQuery<Record<string, unknown>>({
    queryKey: ['client-config'],
    queryFn: async () => {
      const res = await api.get<ClientConfigEnvelope>('/api/v1/config');
      return res.data?.data ?? {};
    },
    staleTime: 5 * 60_000,
  });
  return useMemo(() => resolveRequestConfig(data), [data]);
}

export default useRequestConfig;
