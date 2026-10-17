/**
 * D41 (Ken, 2026-10-18, Q32 and Q33): the referral bonus and Suki stay
 * switched off until Ken decides their rules. The server settings
 * `referral_program_enabled` and `suki_program_enabled` arrive in the public
 * /api/v1/config bundle as `referralProgramEnabled` and `sukiProgramEnabled`.
 *
 * Fails closed: only an explicit `true` turns a program on. While the config
 * is loading, offline, or from a server that does not send the field, the
 * program counts as off, so the app never offers wallet money the server
 * would refuse. The server enforces both switches on its own; this only
 * decides what the screens show.
 *
 * Shares the ['client-config'] cache entry with useFeatureFlags,
 * useRequestConfig and useRequestFirstBooking, so one request serves all.
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export interface ProgramSwitches {
  /** 'loading' until the first config answer (or failure) arrives. */
  status: 'loading' | 'ready';
  referralProgramEnabled: boolean;
  sukiProgramEnabled: boolean;
}

interface ClientConfigEnvelope {
  success: boolean;
  data?: Record<string, unknown>;
}

/** Only an explicit `true` from the server switches a program on. */
export function resolveProgramSwitches(
  config: Record<string, unknown> | null | undefined,
): Omit<ProgramSwitches, 'status'> {
  return {
    referralProgramEnabled: config?.referralProgramEnabled === true,
    sukiProgramEnabled: config?.sukiProgramEnabled === true,
  };
}

export function useProgramSwitches(): ProgramSwitches {
  const { data, isPending, isError } = useQuery<Record<string, unknown>>({
    queryKey: ['client-config'],
    queryFn: async () => {
      const res = await api.get<ClientConfigEnvelope>('/api/v1/config');
      return res.data?.data ?? {};
    },
    staleTime: 5 * 60_000,
  });
  const loading = isPending && !isError;
  return { status: loading ? 'loading' : 'ready', ...resolveProgramSwitches(data) };
}

export default useProgramSwitches;
