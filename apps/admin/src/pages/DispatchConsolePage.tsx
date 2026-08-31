/**
 * Phase 10 — Real-Time Dispatch Console.
 *
 * Three-panel admin tool that visualises live booking + provider activity:
 *   - Header: title, live counters, filters (city / status / service), refresh.
 *   - Map (top): react-leaflet OSM with custom markers per booking status and
 *     available-provider service-base markers. Provider locations are not
 *     live GPS in the v1.0 release.
 *   - Bottom-left: ACTIVE BOOKINGS list (capped at 50 rows). Reassign and
 *     support-message buttons are wired to real mutations. Cancellation is
 *     handed off to Booking 360 because refund inputs require full case review.
 *     Each mutation button opens a modal with client-side
 *     validation aligned to the booking-admin.service reason/message rules;
 *     mutation goes through the booking-admin.service which writes
 *     a paired admin_actions row inside its transaction (D06 trx pattern).
 *   - Bottom-right: derived dispatch-attention queue from the loaded bookings.
 *
 * Data sources:
 *   - GET /api/v1/admin/bookings?status=active&limit=100  (graceful empty
 *     fallback if endpoint returns 404).
 *   - GET /api/v1/admin/providers?online=true&limit=200   (same fallback).
 *   - Live socket events: booking:created, booking:status_changed, and
 *     booking:provider_assigned (see use-admin-socket.ts).
 */

import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import {
  useAdminSocketEvent,
  useAdminSocketStatus,
  type AdminSocketStatus,
} from '@/lib/use-admin-socket';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@/components/ui';
import { Activity, RefreshCw, MapPin, AlertCircle, X } from '@/components/icons';
import { useAuthStore } from '@/stores/auth.store';

// Vite ships broken default icon URLs; merge in the bundled assets.
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// BUG-PHASE18-03 fix (defense-in-depth): React 19 StrictMode + react-leaflet
// 4.2.1 cause MapContainer's mount effect to fire twice in dev. The second
// invocation calls L.map(divEl) on the same div that already has _leaflet_id
// stamped on it — Leaflet throws "Map container is already initialized" and
// the page hits the Sentry error boundary. The proper fix lives in react-
// leaflet 5+ which we cannot upgrade to in this dispatch.
//
// Workaround: shim L.Map.prototype.initialize to defensively clear
// _leaflet_id before constructing if the container is already stamped.
// In production (no StrictMode dual-mount) this branch never fires.
// Idempotent — guarded by a marker flag so HMR doesn't re-wrap.
type LeafletMapInternal = {
  initialize: (id: HTMLElement | string, options?: unknown) => unknown;
  __osPhase18Patched?: boolean;
};
{
  const proto = (L.Map as unknown as { prototype: LeafletMapInternal }).prototype;
  if (!proto.__osPhase18Patched) {
    const originalInitialize = proto.initialize;
    proto.initialize = function (id: HTMLElement | string, options?: unknown) {
      if (id && typeof id !== 'string') {
        const div = id as HTMLElement & { _leaflet_id?: number };
        if (div._leaflet_id) {
          delete div._leaflet_id;
        }
      }
      return originalInitialize.call(this, id, options);
    };
    proto.__osPhase18Patched = true;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface DispatchBooking {
  id: string;
  status: string;
  customerId: string;
  customerName: string | null;
  providerId: string | null;
  providerName: string | null;
  categoryName: string | null;
  city: string | null;
  totalAmount: number;
  latitude: number | null;
  longitude: number | null;
  scheduledAt: string | null;
}

interface DispatchProvider {
  id: string;
  // Phase 200 — the admin providers API returns `businessName` (see
  // adminService.formatProvider), not `name`. Match the wire field so the
  // map popup and reassign dropdown actually show the provider's name.
  businessName: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
}

interface ListEnvelope<T> {
  rows?: T[];
  data?: T[];
  pagination?: { total?: number };
}

interface PagedRows<T> {
  rows: T[];
  total: number;
}

interface BookingCreatedPayload {
  id: string;
  status: string;
  customerId: string;
  providerId: string | null;
  totalCentavos: number;
}

interface BookingStatusChangedPayload {
  id: string;
  oldStatus: string;
  newStatus: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

// Default dispatch-map viewport. The platform is city-agnostic; the
// default / first launch market is Metro Cebu (Cebu City, Mandaue,
// Lapu-Lapu, Talisay) per CLAUDE.md, so the map opens on Cebu City
// rather than the old Boracay coords (superseded by the Cebu-default,
// multi-city direction — Ken, 2026-06-04). Real bookings/providers with
// coordinates pan the map on load; the first active/default service area
// provides the normal empty-state center and this literal is only a final
// fallback when service-area configuration is unavailable.
const DEFAULT_MAP_CENTER: [number, number] = [10.3157, 123.8854]; // Cebu City
const DEFAULT_ZOOM = 12;

const ACTIVE_DISPATCH_STATUSES = new Set([
  'requested', 'quoted', 'matched', 'payment_pending', 'paid',
  'provider_en_route', 'provider_arrived', 'in_progress', 'disputed',
]);

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  requested: '#f59e0b',
  quoted: '#f59e0b',
  matched: '#3b82f6',
  paid: '#3b82f6',
  provider_en_route: '#3b82f6',
  provider_arrived: '#3b82f6',
  in_progress: '#3b82f6',
  completed: '#10b981',
  completed_by_provider: '#10b981',
  confirmed: '#10b981',
  disputed: '#ef4444',
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#64748b';
}

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
}

// ─── Marker icon factories ──────────────────────────────────────────────────

function bookingIcon(status: string): L.DivIcon {
  const color = statusColor(status);
  return L.divIcon({
    className: 'dispatch-booking-icon',
    html: `<div style="background:${color};border:2px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const providerIcon = L.divIcon({
  className: 'dispatch-provider-icon',
  html: '<div style="background:#22c55e;border:2px solid white;border-radius:50%;width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// ─── Data fetch helpers ─────────────────────────────────────────────────────

function unwrap<T>(payload: ListEnvelope<T> | undefined): T[] {
  if (!payload) return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

async function fetchBookings(): Promise<PagedRows<DispatchBooking>> {
  const res = await api.get<ListEnvelope<DispatchBooking>>(
    '/api/v1/admin/bookings?status=active&pageSize=100',
  );
  const rows = unwrap(res.data);
  return { rows, total: res.data.pagination?.total ?? rows.length };
}

async function fetchProviders(search = ''): Promise<PagedRows<DispatchProvider>> {
  // `online=true` is the historical API name. Server semantics are approved
  // + accepting work; coordinates are the saved service base, not live GPS.
  const searchParam = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
  const res = await api.get<ListEnvelope<DispatchProvider>>(
    `/api/v1/admin/providers?online=true&pageSize=100${searchParam}`,
  );
  const rows = unwrap(res.data);
  return { rows, total: res.data.pagination?.total ?? rows.length };
}

interface DispatchServiceArea {
  centerLat: number;
  centerLng: number;
  isDefault: boolean;
  status: string;
}

async function fetchServiceAreas(): Promise<DispatchServiceArea[]> {
  const res = await api.get<ListEnvelope<DispatchServiceArea>>(
    '/api/v1/admin/service-areas?pageSize=100',
  );
  return unwrap(res.data);
}

function DispatchMapViewport({
  center,
  positions,
}: {
  center: [number, number];
  positions: Array<[number, number]>;
}): null {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0 && typeof map.fitBounds === 'function') {
      map.fitBounds(L.latLngBounds(positions), { padding: [32, 32], maxZoom: 14 });
    } else if (typeof map.setView === 'function') {
      map.setView(center, DEFAULT_ZOOM);
    }
  }, [center, map, positions]);
  return null;
}

// ─── Map tile config ────────────────────────────────────────────────────────
// Phase 200 — the tile source is admin-configurable via platform_settings
// (category 'dispatch'). Defaults to OpenStreetMap so the map works with no
// configuration. An operator can paste a MapTiler/Mapbox URL + key in
// /admin/settings → Dispatch to use production tiles.

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface MapTileConfig {
  url: string;
  attribution: string;
}

interface SettingRow {
  key: string;
  value: string;
}

async function fetchMapTileConfig(): Promise<MapTileConfig> {
  try {
    const res = await api.get<{ success: boolean; data: SettingRow[] }>(
      '/api/v1/admin/settings/dispatch',
    );
    const rows = Array.isArray(res.data?.data) ? res.data.data : [];
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const rawUrl = (byKey.get('map_tile_url') ?? '').trim() || OSM_TILE_URL;
    const apiKey = (byKey.get('map_tile_api_key') ?? '').trim();
    const attribution = (byKey.get('map_tile_attribution') ?? '').trim() || OSM_ATTRIBUTION;
    // Substitute the {apiKey} placeholder only when a key is configured.
    const url = apiKey ? rawUrl.replace('{apiKey}', encodeURIComponent(apiKey)) : rawUrl;
    return { url, attribution };
  } catch {
    // Settings unreachable — fall back to keyless OSM so the map still draws.
    return { url: OSM_TILE_URL, attribution: OSM_ATTRIBUTION };
  }
}

// ─── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AdminSocketStatus }): React.ReactElement {
  const color =
    status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-400' : 'bg-slate-400';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline'}
    </span>
  );
}

function FeedFailure({
  label,
  retryLabel,
  onRetry,
}: {
  label: string;
  retryLabel: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span>{label}</span>
      <button type="button" className="min-h-11 shrink-0 rounded border border-red-300 bg-white px-3 font-semibold" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DispatchConsolePage(): React.ReactElement {
  const queryClient = useQueryClient();
  const socketStatus = useAdminSocketStatus();
  // Reassignment and cancellation review are super-admin controls. The
  // audited participant support-message route is intentionally available to
  // ordinary admins, so only the money/state controls use this gate.
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin');

  const bookingsQuery = useQuery({
    queryKey: ['dispatch', 'bookings'],
    queryFn: fetchBookings,
    refetchInterval: 60_000,
  });
  const providersQuery = useQuery({
    queryKey: ['dispatch', 'providers'],
    queryFn: () => fetchProviders(),
    refetchInterval: 60_000,
  });
  const serviceAreasQuery = useQuery({
    queryKey: ['dispatch', 'service-areas'],
    queryFn: fetchServiceAreas,
    staleTime: 5 * 60_000,
  });
  // Admin-configurable map tiles. Stale-time long since tile config rarely
  // changes; falls back to OSM on any error inside the fetcher.
  const mapConfigQuery = useQuery({
    queryKey: ['dispatch', 'map-config'],
    queryFn: fetchMapTileConfig,
    staleTime: 5 * 60_000,
  });
  const mapTile: MapTileConfig = mapConfigQuery.data ?? { url: OSM_TILE_URL, attribution: OSM_ATTRIBUTION };

  const [cityFilter, setCityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const allBookings: DispatchBooking[] = useMemo(
    () => bookingsQuery.data?.rows ?? [],
    [bookingsQuery.data],
  );
  const allProviders: DispatchProvider[] = useMemo(
    () => providersQuery.data?.rows ?? [],
    [providersQuery.data],
  );

  // ─── Derived filter option lists ────────────────────────────────────────
  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    allBookings.forEach((b) => { if (b.city) set.add(b.city); });
    allProviders.forEach((provider) => { if (provider.city) set.add(provider.city); });
    return Array.from(set).sort();
  }, [allBookings, allProviders]);

  const serviceOptions = useMemo(() => {
    const set = new Set<string>();
    allBookings.forEach((b) => { if (b.categoryName) set.add(b.categoryName); });
    return Array.from(set).sort();
  }, [allBookings]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    allBookings.forEach((b) => set.add(b.status));
    return Array.from(set).sort();
  }, [allBookings]);

  const filteredBookings = useMemo(() => {
    return allBookings.filter((b) => {
      if (cityFilter && b.city !== cityFilter) return false;
      if (statusFilter && b.status !== statusFilter) return false;
      if (serviceFilter && b.categoryName !== serviceFilter) return false;
      return true;
    });
  }, [allBookings, cityFilter, statusFilter, serviceFilter]);

  const visibleBookings = filteredBookings.slice(0, 50);
  const visibleProviders = useMemo(
    () => cityFilter
      ? allProviders.filter((provider) => provider.city === cityFilter)
      : allProviders,
    [allProviders, cityFilter],
  );

  // ─── Live event subscriptions ───────────────────────────────────────────

  useAdminSocketEvent<BookingCreatedPayload>('booking:created', (payload) => {
    queryClient.setQueryData<PagedRows<DispatchBooking>>(['dispatch', 'bookings'], (prev) => {
      const list = prev?.rows ?? [];
      if (list.some((b) => b.id === payload.id)) return prev;
      const stub: DispatchBooking = {
        id: payload.id,
        status: payload.status,
        customerId: payload.customerId,
        customerName: null,
        providerId: payload.providerId,
        providerName: null,
        categoryName: null,
        city: null,
        totalAmount: payload.totalCentavos,
        latitude: null,
        longitude: null,
        scheduledAt: null,
      };
      return { rows: [stub, ...list], total: (prev?.total ?? list.length) + 1 };
    });
  });

  useAdminSocketEvent<BookingStatusChangedPayload>('booking:status_changed', (payload) => {
    queryClient.setQueryData<PagedRows<DispatchBooking>>(['dispatch', 'bookings'], (prev) => {
      if (!prev) return prev;
      if (!ACTIVE_DISPATCH_STATUSES.has(payload.newStatus)) {
        const nextRows = prev.rows.filter((booking) => booking.id !== payload.id);
        const removed = nextRows.length !== prev.rows.length;
        return { rows: nextRows, total: Math.max(0, prev.total - (removed ? 1 : 0)) };
      }
      return {
        ...prev,
        rows: prev.rows.map((b) => (b.id === payload.id ? { ...b, status: payload.newStatus } : b)),
      };
    });
  });

  useAdminSocketEvent<{ id: string }>('booking:provider_assigned', () => {
    void queryClient.invalidateQueries({ queryKey: ['dispatch', 'bookings'] });
  });

  // ─── Live counters ──────────────────────────────────────────────────────
  const activeBookingCount = filteredBookings.length;
  const availableProviderCount = visibleProviders.length;
  const bookingsAreFiltered = Boolean(cityFilter || statusFilter || serviceFilter);
  const providersAreFiltered = Boolean(cityFilter);

  const mapCenter = useMemo<[number, number]>(() => {
    const areas = serviceAreasQuery.data ?? [];
    const area = areas.find((candidate) => candidate.isDefault
      && (candidate.status === 'active' || candidate.status === 'soft_launch'))
      ?? areas.find((candidate) => candidate.status === 'active' || candidate.status === 'soft_launch');
    const latitude = Number(area?.centerLat);
    const longitude = Number(area?.centerLng);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [latitude, longitude]
      : DEFAULT_MAP_CENTER;
  }, [serviceAreasQuery.data]);

  const mapPositions = useMemo<Array<[number, number]>>(() => [
    ...filteredBookings
      .filter((booking) => booking.latitude != null && booking.longitude != null)
      .map((booking) => [booking.latitude as number, booking.longitude as number] as [number, number]),
    ...visibleProviders
      .filter((provider) => provider.latitude != null && provider.longitude != null)
      .map((provider) => [provider.latitude as number, provider.longitude as number] as [number, number]),
  ], [filteredBookings, visibleProviders]);

  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      bookingId: string;
      severity: 'danger' | 'warning' | 'info';
      title: string;
      description: string;
    }> = [];
    const now = Date.now();
    for (const booking of filteredBookings) {
      if (!booking.providerId) {
        items.push({
          id: `${booking.id}-unassigned`, bookingId: booking.id, severity: 'danger',
          title: 'Provider not assigned',
          description: `${booking.categoryName ?? 'Booking'} in ${booking.city ?? 'an unknown city'} needs dispatch review.`,
        });
      }
      if (booking.scheduledAt && new Date(booking.scheduledAt).getTime() < now
        && ['requested', 'quoted', 'matched', 'payment_pending', 'paid'].includes(booking.status)) {
        items.push({
          id: `${booking.id}-overdue`, bookingId: booking.id, severity: 'danger',
          title: 'Scheduled time has passed',
          description: `${formatStatus(booking.status)} · scheduled ${formatDateTime(booking.scheduledAt)}.`,
        });
      }
      if (booking.latitude == null || booking.longitude == null) {
        items.push({
          id: `${booking.id}-coordinates`, bookingId: booking.id, severity: 'warning',
          title: 'Service coordinates missing',
          description: 'Map routing and arrival-radius verification cannot operate for this booking.',
        });
      }
    }
    const order = { danger: 0, warning: 1, info: 2 } as const;
    return items.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 20);
  }, [filteredBookings]);

  const selectedBooking = useMemo(
    () => allBookings.find((b) => b.id === selectedBookingId) ?? null,
    [allBookings, selectedBookingId],
  );

  // ─── Action handlers (dialogs) ──────────────────────────────────
  const [reassignTarget, setReassignTarget] = useState<DispatchBooking | null>(null);
  const [reassignProviderId, setReassignProviderId] = useState<string>('');
  const [reassignProviderSearch, setReassignProviderSearch] = useState<string>('');
  const [reassignReason, setReassignReason] = useState<string>('');

  const searchedProvidersQuery = useQuery({
    queryKey: ['dispatch', 'provider-search', reassignProviderSearch.trim()],
    queryFn: () => fetchProviders(reassignProviderSearch),
    enabled: reassignTarget !== null && reassignProviderSearch.trim().length >= 2,
    staleTime: 30_000,
  });
  const reassignProviderPool = reassignProviderSearch.trim().length >= 2
    ? (searchedProvidersQuery.data?.rows ?? [])
    : allProviders;
  const reassignProviderChoices = reassignProviderPool.filter(
    (provider) => provider.id !== reassignTarget?.providerId,
  );

  const [messageTarget, setMessageTarget] = useState<DispatchBooking | null>(null);
  const [messageBody, setMessageBody] = useState<string>('');

  const canReassign = reassignProviderId.length > 0 && reassignReason.trim().length >= 5;
  const canSendMessage = messageBody.trim().length >= 5 && messageBody.trim().length <= 2000;

  const reassignMutation = useMutation({
    mutationFn: async (vars: { bookingId: string; newProviderId: string; reason: string }) => {
      await api.post(`/api/v1/admin/bookings/${vars.bookingId}/reassign`, {
        newProviderId: vars.newProviderId,
        reason: vars.reason,
      });
    },
    onSuccess: () => {
      toast.success('Booking reassigned.');
      setReassignTarget(null);
      setReassignProviderId('');
      setReassignProviderSearch('');
      setReassignReason('');
      void queryClient.invalidateQueries({ queryKey: ['dispatch', 'bookings'] });
    },
    onError: (err) => toast.error(`Reassign failed: ${getErrorMessage(err)}`),
  });

  const messageMutation = useMutation({
    mutationFn: async (vars: { bookingId: string; message: string }) => {
      await api.post(`/api/v1/admin/bookings/${vars.bookingId}/message`, {
        message: vars.message,
      });
    },
    onSuccess: () => {
      toast.success('Booking support message posted.');
      setMessageTarget(null);
      setMessageBody('');
    },
    onError: (err) => toast.error(`Message failed: ${getErrorMessage(err)}`),
  });

  function handleReassign(b: DispatchBooking): void {
    setReassignTarget(b);
    setReassignProviderId('');
    setReassignProviderSearch('');
    setReassignReason('');
  }
  function handleMessage(b: DispatchBooking): void {
    setMessageTarget(b);
    setMessageBody('');
  }

  function handleRefresh(): void {
    void bookingsQuery.refetch();
    void providersQuery.refetch();
    void serviceAreasQuery.refetch();
  }

  // BUG-PHASE18-03 fix: pre-fix `useState(() => 'dispatch-map-' + Date.now())`
  // set the key ONCE per fresh component instance. Under React 19 StrictMode
  // every component double-mounts in dev, and react-leaflet 4.2.1's internal
  // useEffect calls L.map(divRef) again — Leaflet throws "Map container is
  // already initialized" because `_leaflet_id` was already stamped on the div
  // by the first invocation. The whole page hits the Sentry error boundary.
  //
  // Fix has TWO parts:
  // 1. Defer mapKey to AFTER the StrictMode dual-mount cycle finishes by
  //    setting it inside useEffect. The MapContainer doesn't even mount until
  //    after the parent has finished its dev-only mount-unmount-mount dance.
  // 2. Guard the key-setter with a useRef so the SECOND useEffect call (the
  //    one StrictMode triggers as a dev-only re-run of all mount effects)
  //    becomes a no-op. Without the guard, both invocations would call
  //    setMapKey, the second producing a different value and force-remounting
  //    the MapContainer — which would itself trigger another L.map() call.
  //
  // Net effect: MapContainer mounts exactly once per fresh page navigation,
  // its internal effect fires exactly once, no `_leaflet_id` collision.
  // mapKey === null shows a "Loading map…" placeholder for ~16ms before the
  // effect commits the real key; not user-visible.
  const [mapKey, setMapKey] = useState<string | null>(null);
  const mapKeySetRef = useRef(false);
  useEffect(() => {
    if (mapKeySetRef.current) return;
    mapKeySetRef.current = true;
    setMapKey(`dispatch-map-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-3 p-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Activity size={22} className="text-[var(--color-primary)]" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Dispatch Console</h1>
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span><strong>{bookingsQuery.isLoading ? '…' : bookingsQuery.isError ? 'Unavailable' : activeBookingCount}</strong> loaded active bookings{!bookingsAreFiltered && !bookingsQuery.isError && (bookingsQuery.data?.total ?? 0) > allBookings.length ? ` of ${bookingsQuery.data?.total}` : ''}</span>
              <span>·</span>
              <span><strong>{providersQuery.isLoading ? '…' : providersQuery.isError ? 'Unavailable' : availableProviderCount}</strong> loaded providers accepting work{!providersAreFiltered && !providersQuery.isError && (providersQuery.data?.total ?? 0) > allProviders.length ? ` of ${providersQuery.data?.total}` : ''}</span>
              <span>·</span>
              <StatusBadge status={socketStatus} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by city"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="min-h-11 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All cities</option>
            {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-11 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
          </select>
          <select
            aria-label="Filter by service"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="min-h-11 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All services</option>
            {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={bookingsQuery.isFetching || providersQuery.isFetching}
            className="inline-flex min-h-11 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            {bookingsQuery.isFetching || providersQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {(bookingsQuery.isError || providersQuery.isError || serviceAreasQuery.isError) && (
        <div role="alert" className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {bookingsQuery.isError && <FeedFailure label={`Active bookings feed failed: ${getErrorMessage(bookingsQuery.error)}`} retryLabel="Retry active bookings" onRetry={() => void bookingsQuery.refetch()} />}
          {providersQuery.isError && <FeedFailure label={`Accepting-work provider feed failed: ${getErrorMessage(providersQuery.error)}`} retryLabel="Retry accepting-work providers" onRetry={() => void providersQuery.refetch()} />}
          {serviceAreasQuery.isError && <FeedFailure label={`Service-area feed failed: ${getErrorMessage(serviceAreasQuery.error)} Map is using its fallback center.`} retryLabel="Retry service areas" onRetry={() => void serviceAreasQuery.refetch()} />}
        </div>
      )}

      {!providersQuery.isError && (providersQuery.data?.total ?? 0) > allProviders.length && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          The map shows the first {allProviders.length} of {providersQuery.data?.total} providers accepting work. Use provider search in Reassign to reach providers outside this loaded map page.
        </div>
      )}

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <section className="h-[320px] min-h-[280px] flex-none overflow-hidden rounded-lg border border-[var(--color-border)] bg-white lg:flex-1">
        {mapKey === null ? (
          <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
            Loading map…
          </div>
        ) : (
        <MapContainer
          key={mapKey}
          center={mapCenter}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            key={mapTile.url}
            attribution={mapTile.attribution}
            url={mapTile.url}
          />
          <DispatchMapViewport center={mapCenter} positions={mapPositions} />
          {filteredBookings
            .filter((b) => b.latitude != null && b.longitude != null)
            .map((b) => (
              <Marker
                key={`booking-${b.id}`}
                position={[b.latitude as number, b.longitude as number]}
                icon={bookingIcon(b.status)}
                eventHandlers={{ click: () => setSelectedBookingId(b.id) }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold">{b.categoryName ?? 'Booking'}</div>
                    <div>{formatStatus(b.status)}</div>
                    <div>{formatCurrency(b.totalAmount)}</div>
                  </div>
                </Popup>
              </Marker>
            ))}
          {visibleProviders
            .filter((p) => p.latitude != null && p.longitude != null)
            .map((p) => (
              <Marker
                key={`provider-${p.id}`}
                position={[p.latitude as number, p.longitude as number]}
                icon={providerIcon}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold">{p.businessName ?? 'Provider'}</div>
                    <div>{p.city ?? '—'} · saved service base</div>
                    <div>Accepting work, not live GPS</div>
                  </div>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
        )}
      </section>

      {/* ── Bottom panels ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:h-[300px] lg:grid-cols-3">
        {/* Active bookings list */}
        <div className="flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-white lg:col-span-2 lg:min-h-0">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Active Bookings</h2>
            <span className="text-xs text-slate-500">
              Showing {visibleBookings.length} of {filteredBookings.length}
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            {bookingsQuery.isLoading && (
              <div className="p-4 text-sm text-slate-500">Loading bookings…</div>
            )}
            {bookingsQuery.isError && (
              <div className="p-4 text-sm text-red-700">Active bookings are unavailable. Use “Retry active bookings” before making a dispatch decision.</div>
            )}
            {!bookingsQuery.isLoading && !bookingsQuery.isError && visibleBookings.length === 0 && (
              <div className="p-4 text-sm text-slate-500">No active bookings.</div>
            )}
            {!bookingsQuery.isLoading && !bookingsQuery.isError && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Customer → Provider</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Scheduled</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleBookings.map((b) => (
                  <tr
                    key={b.id}
                    className={`border-t border-slate-100 hover:bg-slate-50 ${
                      selectedBookingId === b.id ? 'bg-slate-50' : ''
                    }`}
                    tabIndex={0}
                    aria-label={`View booking ${b.id}`}
                    onClick={() => setSelectedBookingId(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedBookingId(b.id);
                      }
                    }}
                  >
                    <td className="px-3 py-2 font-mono">
                      <Link
                        to={`/bookings/${b.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-[var(--color-secondary)] hover:underline"
                      >
                        {b.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{b.categoryName ?? '—'}</td>
                    <td className="px-3 py-2 font-medium">{formatCurrency(b.totalAmount)}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/customers/${b.customerId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="font-medium text-[var(--color-secondary)] hover:underline"
                      >
                        {b.customerName ?? 'Customer'}
                      </Link>
                      {' → '}
                      {b.providerId ? (
                        <Link
                          to={`/providers/${b.providerId}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium text-[var(--color-secondary)] hover:underline"
                        >
                          {b.providerName ?? 'Provider'}
                        </Link>
                      ) : '(unassigned)'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-white text-[10px]"
                        style={{ background: statusColor(b.status) }}
                      >
                        {formatStatus(b.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatDateTime(b.scheduledAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <>
                        {isSuperAdmin && (
                          <>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleReassign(b); }}
                            aria-label={`Reassign booking ${b.id}`}
                            className="text-[var(--color-primary)] hover:underline mr-2"
                          >
                            Reassign
                          </button>
                          <Link
                            to={`/bookings/${b.id}`}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Review cancellation for booking ${b.id}`}
                            className="text-red-700 hover:underline mr-2"
                          >
                            Review cancellation
                          </Link>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleMessage(b); }}
                          aria-label={`Post support message for booking ${b.id}`}
                          className="text-slate-600 hover:underline"
                        >
                          Support message
                        </button>
                      </>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>

        {/* Derived operational attention queue */}
        <div className="flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-white lg:min-h-0">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-700">Dispatch Attention</h2>
            <span className="ml-auto text-xs text-slate-500">{bookingsQuery.isError ? 'Unavailable' : attentionItems.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {bookingsQuery.isError ? (
              <div className="p-4 text-xs text-red-700">Dispatch attention cannot be derived while the active-booking feed is unavailable.</div>
            ) : attentionItems.length === 0 && (
              <div className="p-4 text-xs text-slate-500">No loaded booking currently needs dispatch attention.</div>
            )}
            <ul>
              {attentionItems.map((item) => (
                <li key={item.id} className="border-b border-slate-100 text-xs">
                  <button type="button" onClick={() => setSelectedBookingId(item.bookingId)} className="w-full px-4 py-2 text-left hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        item.severity === 'danger'
                          ? 'bg-red-500'
                          : item.severity === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                      }`}
                    />
                    <span className="font-medium text-slate-800">{item.title}</span>
                  </div>
                  <div className="text-slate-500 mt-0.5">{item.description}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Detail side-panel (overlay) ─────────────────────────────── */}
      {selectedBooking && (
        <div
          role="complementary"
          aria-label="Selected booking details"
          className="fixed bottom-0 right-0 top-0 z-40 flex w-[min(24rem,100vw)] flex-col border-l border-[var(--color-border-strong)] bg-white"
        >
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-slate-500" />
              <h3 className="text-sm font-semibold">Booking detail</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedBookingId(null)}
              className="text-slate-500 hover:text-slate-900 text-sm"
              aria-label="Close booking details"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="p-4 text-xs space-y-2 overflow-y-auto">
            <div><strong>ID:</strong> <span className="font-mono">{selectedBooking.id}</span></div>
            <div><strong>Status:</strong> {formatStatus(selectedBooking.status)}</div>
            <div><strong>Service:</strong> {selectedBooking.categoryName ?? '—'}</div>
            <div><strong>Amount:</strong> {formatCurrency(selectedBooking.totalAmount)}</div>
            <div><strong>Customer:</strong> {selectedBooking.customerName ?? '—'}</div>
            <div><strong>Provider:</strong> {selectedBooking.providerName ?? '(unassigned)'}</div>
            <div><strong>City:</strong> {selectedBooking.city ?? '—'}</div>
            <div><strong>Scheduled:</strong> {formatDateTime(selectedBooking.scheduledAt)}</div>
            <div><strong>Service map:</strong> {selectedBooking.latitude != null && selectedBooking.longitude != null ? 'coordinates available' : 'coordinates missing'}</div>
            <div className="grid grid-cols-2 gap-2 pt-3">
              <Link to={`/bookings/${selectedBooking.id}`} className="rounded border border-slate-200 px-3 py-2 text-center font-semibold text-[var(--color-secondary)] hover:bg-slate-50">Booking 360</Link>
              <Link to={`/customers/${selectedBooking.customerId}`} className="rounded border border-slate-200 px-3 py-2 text-center font-semibold text-[var(--color-secondary)] hover:bg-slate-50">Customer 360</Link>
              {selectedBooking.providerId && (
                <Link to={`/providers/${selectedBooking.providerId}`} className="rounded border border-slate-200 px-3 py-2 text-center font-semibold text-[var(--color-secondary)] hover:bg-slate-50">Provider 360</Link>
              )}
              <Link to={`/communications?bookingId=${encodeURIComponent(selectedBooking.id)}`} className="rounded border border-slate-200 px-3 py-2 text-center font-semibold text-[var(--color-secondary)] hover:bg-slate-50">Conversation</Link>
              <Link to={`/support-tickets?bookingId=${encodeURIComponent(selectedBooking.id)}`} className="rounded border border-slate-200 px-3 py-2 text-center font-semibold text-[var(--color-secondary)] hover:bg-slate-50">Support cases</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Reassign dialog ─────────────────────────────────────────── */}
      <Dialog
        open={reassignTarget !== null}
        onOpenChange={(open) => { if (!open) { setReassignTarget(null); setReassignProviderSearch(''); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign booking</DialogTitle>
            <DialogDescription>
              {reassignTarget
                ? `Booking ${reassignTarget.id.slice(0, 8)} — currently ${reassignTarget.providerName ?? '(unassigned)'}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reassign-provider-search">Search providers</Label>
              <input
                id="reassign-provider-search"
                type="search"
                value={reassignProviderSearch}
                onChange={(event) => {
                  setReassignProviderSearch(event.target.value);
                  setReassignProviderId('');
                }}
                placeholder="Business name, phone, or email"
                className="mb-2 min-h-11 w-full rounded border border-slate-300 bg-white px-3 text-sm"
              />
              <Label htmlFor="reassign-provider">New provider</Label>
              <select
                id="reassign-provider"
                value={reassignProviderId}
                onChange={(e) => setReassignProviderId(e.target.value)}
                disabled={searchedProvidersQuery.isLoading || searchedProvidersQuery.isError}
                className="min-h-11 w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
              >
                <option value="">{searchedProvidersQuery.isLoading ? 'Searching accepting-work providers…' : 'Select an accepting-work provider…'}</option>
                {reassignProviderChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.businessName ?? p.id}{p.city ? ` — ${p.city}` : ''}
                  </option>
                ))}
              </select>
              {searchedProvidersQuery.isError && (
                <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-700">
                  <span>Provider search failed. No searched result can be selected.</span>
                  <Button variant="outline" onClick={() => void searchedProvidersQuery.refetch()}>Retry provider search</Button>
                </div>
              )}
              {!searchedProvidersQuery.isLoading && !searchedProvidersQuery.isError && reassignProviderChoices.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  {reassignProviderSearch.trim().length >= 2
                    ? 'No alternative accepting-work provider matched this search.'
                    : 'No other provider is present in the loaded map page. Search by name or contact to query the full provider directory.'}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">The server rechecks account approval, accepting-work state, service capability, service radius, and double-booking conflicts when the job is scheduled.</p>
            </div>
            <div>
              <Label htmlFor="reassign-reason">Reason</Label>
              <Textarea
                id="reassign-reason"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Why reassign? At least 5 characters."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReassignTarget(null)}
              disabled={reassignMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reassignTarget) return;
                if (!reassignProviderId) {
                  toast.warning('Pick a new provider first.');
                  return;
                }
                if (reassignReason.trim().length < 5) {
                  toast.warning('Reason must be at least 5 characters.');
                  return;
                }
                reassignMutation.mutate({
                  bookingId: reassignTarget.id,
                  newProviderId: reassignProviderId,
                  reason: reassignReason.trim(),
                });
              }}
              disabled={reassignMutation.isPending || !canReassign}
            >
              {reassignMutation.isPending ? 'Reassigning…' : 'Reassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Booking support message dialog ──────────────────────────── */}
      <Dialog
        open={messageTarget !== null}
        onOpenChange={(open) => { if (!open) setMessageTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post booking support message</DialogTitle>
            <DialogDescription>
              {messageTarget
                ? `Adds an audited support message to booking ${messageTarget.id.slice(0, 8)}. If a provider is assigned, both booking participants can read it and both are notified.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="message-body">Message</Label>
            <Textarea
              id="message-body"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Type the support update the booking participants will see…"
              rows={5}
              maxLength={2000}
            />
            <p className="text-xs text-slate-500 mt-1">{messageBody.length} / 2000</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMessageTarget(null)}
              disabled={messageMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!messageTarget) return;
                const trimmed = messageBody.trim();
                if (trimmed.length < 5 || trimmed.length > 2000) {
                  toast.warning('Message must be 5–2000 characters.');
                  return;
                }
                messageMutation.mutate({
                  bookingId: messageTarget.id,
                  message: trimmed,
                });
              }}
              disabled={messageMutation.isPending || !canSendMessage}
            >
              {messageMutation.isPending ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
