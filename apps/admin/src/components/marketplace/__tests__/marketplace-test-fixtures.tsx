// Shared data for the D38 Milestone 3 admin tests (HA-M3-41..71). Shapes
// follow the API's marketplace-health.service and marketplace-alert.service
// rows exactly; each test still mocks the api module itself.
import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type {
  MarketplaceAlert, OpenRequestRow, RequestInviteRow,
} from '../marketplace-api';

export const MARKETPLACE = '/api/v1/admin/marketplace-health';

export function minutesAgo(minutes: number, from = Date.now()): string {
  return new Date(from - minutes * 60_000).toISOString();
}

export function openRequest(overrides: Partial<OpenRequestRow> & { bookingId: string }): OpenRequestRow {
  return {
    categoryName: 'Aircon',
    subcategoryName: 'Aircon cleaning',
    barangay: 'Lahug',
    city: 'Cebu City',
    urgency: 'normal',
    scheduledAt: null,
    createdAt: minutesAgo(20),
    waitingSince: minutesAgo(20),
    waitMinutes: 20,
    waitingOn: 'providers',
    severity: 'none',
    round: 1,
    maxRounds: 3,
    notified: 4,
    viewed: 1,
    responded: 0,
    notifiedTotal: 4,
    viewedTotal: 1,
    respondedTotal: 0,
    liveQuotes: 0,
    totalQuotes: 0,
    declinedQuotes: 0,
    budgetMinCentavos: null,
    budgetMaxCentavos: null,
    budgetUnknown: false,
    opsReviewAt: null,
    opsReviewReason: null,
    openAlertIds: [],
    customer: { id: 'customer-1', displayName: 'Ana R.' },
    ...overrides,
  };
}

export function openRequestsResponse(rows: OpenRequestRow[], meta: Record<string, unknown> = {}) {
  return {
    data: {
      success: true,
      data: rows,
      meta: { amberMinutes: 5, redMinutes: 10, maxRounds: 3, generatedAt: new Date().toISOString(), ...meta },
    },
  };
}

export function invite(overrides: Partial<RequestInviteRow> & { inviteId: string; providerId: string }): RequestInviteRow {
  return {
    providerName: 'Ramon Cruz Aircon',
    phone: '+63 9XX XXX 4567',
    contactMasked: true,
    round: 1,
    source: 'push',
    status: 'sent',
    sentAt: '2026-10-14T02:00:00.000Z',
    viewedAt: null,
    respondedAt: null,
    responseMinutes: null,
    quoteId: null,
    quoteStatus: null,
    ...overrides,
  };
}

export function invitesResponse(rows: RequestInviteRow[], meta: Record<string, unknown> = { applicable: true, currentRound: 1 }) {
  return { data: { success: true, data: rows, meta } };
}

export function alert(overrides: Partial<MarketplaceAlert> & { id: string }): MarketplaceAlert {
  return {
    bookingId: 'booking-1',
    kind: 'request_waiting_red',
    severity: 'red',
    round: 1,
    anchorAt: '2026-10-14T02:00:00.000Z',
    thresholdMinutes: 10,
    details: { notified: 3, viewed: 1 },
    raisedAt: '2026-10-14T02:10:00.000Z',
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolution: null,
    serviceName: 'Aircon cleaning',
    barangay: 'Lahug',
    city: 'Cebu City',
    currentWaitMinutes: 14,
    ...overrides,
  };
}

export function alertsResponse(alerts: MarketplaceAlert[], meta: Record<string, unknown> = {}) {
  return {
    data: {
      success: true,
      data: alerts,
      meta: {
        openCount: alerts.filter((item) => item.resolvedAt === null).length,
        unacknowledgedCount: alerts.filter((item) => item.resolvedAt === null && item.acknowledgedAt === null).length,
        openRedCount: alerts.filter((item) => item.resolvedAt === null && item.severity === 'red').length,
        amberMinutes: 5,
        redMinutes: 10,
        ...meta,
      },
    },
  };
}

export function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

export function renderWithProviders(
  element: React.ReactElement,
  options: { route?: string; client?: QueryClient } = {},
): RenderResult & { client: QueryClient } {
  const client = options.client ?? newQueryClient();
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client };
}

/**
 * A Web Audio stand-in that records every beep started. By default a new
 * context is already running. `startsSuspended` follows the spec for a
 * context made outside a user gesture (it starts 'suspended' and runs once
 * resume() settles); `resumeFails` makes resume() reject and leaves it
 * suspended, as in a browser where audio cannot start.
 */
export function installFakeAudioContext(
  options: { startsSuspended?: boolean; resumeFails?: boolean } = {},
): { instances: FakeAudioContextShape[]; started: number[] } {
  const record = { instances: [] as FakeAudioContextShape[], started: [] as number[] };
  class FakeAudioContext implements FakeAudioContextShape {
    state: 'suspended' | 'running' = options.startsSuspended || options.resumeFails ? 'suspended' : 'running';
    currentTime = 0;
    destination = {};
    onstatechange: (() => void) | null = null;
    constructor() {
      record.instances.push(this);
    }
    resume = async (): Promise<void> => {
      if (options.resumeFails) throw new Error('Audio is not allowed here');
      this.state = 'running';
      this.onstatechange?.();
    };
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: () => undefined },
        connect: () => undefined,
        start: (at: number) => {
          record.started.push(at);
        },
        stop: () => undefined,
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
        connect: () => undefined,
      };
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  return record;
}

export interface FakeAudioContextShape {
  state: 'suspended' | 'running';
  currentTime: number;
}
