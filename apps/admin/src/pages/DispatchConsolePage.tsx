/**
 * Phase 10 — Real-Time Dispatch Console.
 *
 * Three-panel admin tool that visualises live booking + provider activity:
 *   - Header: title, live counters, filters (city / status / service), refresh.
 *   - Map (top): react-leaflet OSM with custom markers per booking status and
 *     online-provider markers. Click → side detail panel.
 *   - Bottom-left: ACTIVE BOOKINGS list (capped at 50 rows). Reassign / Cancel
 *     / Message buttons are wired to real mutations as of Phase 14 Dispatch 10
 *     (Bug 272.A/B/C closed). Each button opens a modal with client-side
 *     validation aligned to the booking-admin.service reason/message rules;
 *     mutation goes through the booking-admin.service which writes
 *     a paired admin_actions row inside its transaction (D06 trx pattern).
 *   - Bottom-right: ALERT TAIL — last 20 admin alerts streamed via socket.
 *
 * Data sources:
 *   - GET /api/v1/admin/bookings?status=active&limit=100  (graceful empty
 *     fallback if endpoint returns 404).
 *   - GET /api/v1/admin/providers?online=true&limit=200   (same fallback).
 *   - Live socket events: booking:created, booking:status_changed,
 *     booking:gps_update, alert:new (see use-admin-socket.ts).
 */

import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Activity, RefreshCw, MapPin, AlertCircle } from '@/components/icons';

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
  etaMinutes: number | null;
}

interface DispatchProvider {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
}

interface ListEnvelope<T> {
  rows?: T[];
  data?: T[];
}

interface AdminAlert {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  description: string;
  createdAt: string;
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

interface BookingGpsUpdatePayload {
  id: string;
  lat: number;
  lng: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

// BUG-PHASE97-01 fix — pre-fix the dispatch map was centered on
// Metro Manila at zoom 11. The platform's launch market is Boracay
// (Aklan); mobile customer/booking/tracker.tsx + provider/job/
// active.tsx + provider/service-area.tsx all default to the Boracay
// coords used below per Phase D CRIT-77. Admins opening the
// dispatch console at launch saw an empty Manila map and had to
// manually pan every shift. Now the default matches the rest of
// the platform; zoom is tighter because Boracay is a 7km island
// where the wider Manila zoom would render mostly empty water.
//
// Once the launch expands beyond Boracay, replace this with the
// active service-area's center (admin/service-areas API exposes
// centerLat/centerLng + status).
const DEFAULT_MAP_CENTER: [number, number] = [11.9685, 121.9162];
const DEFAULT_ZOOM = 13;

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

async function fetchBookings(): Promise<DispatchBooking[]> {
  try {
    const res = await api.get<ListEnvelope<DispatchBooking>>(
      '/api/v1/admin/bookings?status=active&limit=100',
    );
    return unwrap(res.data);
  } catch (err) {
    // Endpoint may not exist yet — surface as a non-blocking warning toast
    // and render an empty list rather than tearing down the page.
    toast.warning('Live bookings feed unavailable — showing empty list.', {
      description: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function fetchProviders(): Promise<DispatchProvider[]> {
  try {
    const res = await api.get<ListEnvelope<DispatchProvider>>(
      '/api/v1/admin/providers?online=true&limit=200',
    );
    return unwrap(res.data);
  } catch (err) {
    toast.warning('Online-providers feed unavailable — showing empty list.', {
      description: err instanceof Error ? err.message : String(err),
    });
    return [];
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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DispatchConsolePage(): React.ReactElement {
  const queryClient = useQueryClient();
  const socketStatus = useAdminSocketStatus();

  const bookingsQuery = useQuery({
    queryKey: ['dispatch', 'bookings'],
    queryFn: fetchBookings,
    refetchInterval: 60_000,
  });
  const providersQuery = useQuery({
    queryKey: ['dispatch', 'providers'],
    queryFn: fetchProviders,
    refetchInterval: 60_000,
  });

  const [cityFilter, setCityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);

  const allBookings: DispatchBooking[] = useMemo(
    () => bookingsQuery.data ?? [],
    [bookingsQuery.data],
  );
  const allProviders: DispatchProvider[] = useMemo(
    () => providersQuery.data ?? [],
    [providersQuery.data],
  );

  // ─── Derived filter option lists ────────────────────────────────────────
  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    allBookings.forEach((b) => { if (b.city) set.add(b.city); });
    return Array.from(set).sort();
  }, [allBookings]);

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

  // ─── Live event subscriptions ───────────────────────────────────────────

  useAdminSocketEvent<BookingCreatedPayload>('booking:created', (payload) => {
    queryClient.setQueryData<DispatchBooking[]>(['dispatch', 'bookings'], (prev) => {
      const list = prev ?? [];
      if (list.some((b) => b.id === payload.id)) return list;
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
        etaMinutes: null,
      };
      return [stub, ...list];
    });
  });

  useAdminSocketEvent<BookingStatusChangedPayload>('booking:status_changed', (payload) => {
    queryClient.setQueryData<DispatchBooking[]>(['dispatch', 'bookings'], (prev) => {
      if (!prev) return prev;
      return prev.map((b) => (b.id === payload.id ? { ...b, status: payload.newStatus } : b));
    });
  });

  useAdminSocketEvent<BookingGpsUpdatePayload>('booking:gps_update', (payload) => {
    queryClient.setQueryData<DispatchBooking[]>(['dispatch', 'bookings'], (prev) => {
      if (!prev) return prev;
      return prev.map((b) =>
        b.id === payload.id ? { ...b, latitude: payload.lat, longitude: payload.lng } : b,
      );
    });
  });

  useAdminSocketEvent<AdminAlert>('alert:new', (payload) => {
    setAlerts((prev) => {
      const next = [payload, ...prev];
      return next.slice(0, 20);
    });
  });

  // ─── Live counters ──────────────────────────────────────────────────────
  const activeBookingCount = filteredBookings.length;
  const onlineProviderCount = allProviders.length;

  const selectedBooking = useMemo(
    () => allBookings.find((b) => b.id === selectedBookingId) ?? null,
    [allBookings, selectedBookingId],
  );

  // ─── Action handlers (dialogs) ──────────────────────────────────
  const [reassignTarget, setReassignTarget] = useState<DispatchBooking | null>(null);
  const [reassignProviderId, setReassignProviderId] = useState<string>('');
  const [reassignReason, setReassignReason] = useState<string>('');

  const [cancelTarget, setCancelTarget] = useState<DispatchBooking | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  const [messageTarget, setMessageTarget] = useState<DispatchBooking | null>(null);
  const [messageBody, setMessageBody] = useState<string>('');

  const canReassign = reassignProviderId.length > 0 && reassignReason.trim().length >= 5;
  const canCancel = cancelReason.trim().length >= 10;
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
      setReassignReason('');
      void queryClient.invalidateQueries({ queryKey: ['dispatch', 'bookings'] });
    },
    onError: (err) => toast.error(`Reassign failed: ${getErrorMessage(err)}`),
  });

  const cancelMutation = useMutation({
    mutationFn: async (vars: { bookingId: string; reason: string }) => {
      await api.post(`/api/v1/admin/bookings/${vars.bookingId}/cancel`, {
        reason: vars.reason,
      });
    },
    onSuccess: () => {
      toast.success('Booking cancelled.');
      setCancelTarget(null);
      setCancelReason('');
      void queryClient.invalidateQueries({ queryKey: ['dispatch', 'bookings'] });
    },
    onError: (err) => toast.error(`Cancel failed: ${getErrorMessage(err)}`),
  });

  const messageMutation = useMutation({
    mutationFn: async (vars: { bookingId: string; message: string }) => {
      await api.post(`/api/v1/admin/bookings/${vars.bookingId}/message`, {
        message: vars.message,
      });
    },
    onSuccess: () => {
      toast.success('Message sent to customer.');
      setMessageTarget(null);
      setMessageBody('');
    },
    onError: (err) => toast.error(`Message failed: ${getErrorMessage(err)}`),
  });

  function handleReassign(b: DispatchBooking): void {
    setReassignTarget(b);
    setReassignProviderId('');
    setReassignReason('');
  }
  function handleCancel(b: DispatchBooking): void {
    setCancelTarget(b);
    setCancelReason('');
  }
  function handleMessage(b: DispatchBooking): void {
    setMessageTarget(b);
    setMessageBody('');
  }

  function handleRefresh(): void {
    void bookingsQuery.refetch();
    void providersQuery.refetch();
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
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-3 p-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Activity size={22} className="text-[var(--color-primary)]" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Dispatch Console</h1>
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span><strong>{activeBookingCount}</strong> active bookings</span>
              <span>·</span>
              <span><strong>{onlineProviderCount}</strong> providers online</span>
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
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">All cities</option>
            {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
          </select>
          <select
            aria-label="Filter by service"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">All services</option>
            {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={bookingsQuery.isFetching || providersQuery.isFetching}
            className="inline-flex items-center gap-1.5 text-sm border border-slate-300 rounded px-3 py-1.5 bg-white hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            {bookingsQuery.isFetching || providersQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <section className="flex-1 min-h-[280px] bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        {mapKey === null ? (
          <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
            Loading map…
          </div>
        ) : (
        <MapContainer
          key={mapKey}
          center={DEFAULT_MAP_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
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
          {allProviders
            .filter((p) => p.latitude != null && p.longitude != null)
            .map((p) => (
              <Marker
                key={`provider-${p.id}`}
                position={[p.latitude as number, p.longitude as number]}
                icon={providerIcon}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold">{p.name}</div>
                    <div>{p.city ?? '—'}</div>
                  </div>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
        )}
      </section>

      {/* ── Bottom panels ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 h-[260px]">
        {/* Active bookings list */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Active Bookings</h2>
            <span className="text-xs text-slate-500">
              Showing {visibleBookings.length} of {filteredBookings.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {bookingsQuery.isLoading && (
              <div className="p-4 text-sm text-slate-500">Loading bookings…</div>
            )}
            {!bookingsQuery.isLoading && visibleBookings.length === 0 && (
              <div className="p-4 text-sm text-slate-500">No active bookings.</div>
            )}
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Customer → Provider</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">ETA</th>
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
                    <td className="px-3 py-2 font-mono text-slate-700">{b.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">{b.categoryName ?? '—'}</td>
                    <td className="px-3 py-2 font-medium">{formatCurrency(b.totalAmount)}</td>
                    <td className="px-3 py-2">
                      {(b.customerName ?? 'Customer')} → {b.providerName ?? '(unassigned)'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-white text-[10px]"
                        style={{ background: statusColor(b.status) }}
                      >
                        {formatStatus(b.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{b.etaMinutes != null ? `${b.etaMinutes}m` : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleReassign(b); }}
                        aria-label={`Reassign booking ${b.id}`}
                        className="text-[var(--color-primary)] hover:underline mr-2"
                      >
                        Reassign
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleCancel(b); }}
                        aria-label={`Cancel booking ${b.id}`}
                        className="text-red-600 hover:underline mr-2"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleMessage(b); }}
                        aria-label={`Message customer for booking ${b.id}`}
                        className="text-slate-600 hover:underline"
                      >
                        Message
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alert tail */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-700">Live Alerts</h2>
            <span className="ml-auto text-xs text-slate-500">{alerts.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {alerts.length === 0 && (
              <div className="p-4 text-xs text-slate-500">No alerts received yet.</div>
            )}
            <ul>
              {alerts.map((a) => (
                <li key={a.id} className="px-4 py-2 border-b border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        a.severity === 'danger'
                          ? 'bg-red-500'
                          : a.severity === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                      }`}
                    />
                    <span className="font-medium text-slate-800">{a.title}</span>
                  </div>
                  <div className="text-slate-500 mt-0.5">{a.description}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Detail side-panel (overlay) ─────────────────────────────── */}
      {selectedBooking && (
        <div className="fixed top-0 right-0 bottom-0 w-80 bg-white border-l border-slate-200 shadow-lg z-30 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-slate-500" />
              <h3 className="text-sm font-semibold">Booking detail</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedBookingId(null)}
              className="text-slate-500 hover:text-slate-900 text-sm"
            >
              ✕
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
          </div>
        </div>
      )}

      {/* ── Reassign dialog ─────────────────────────────────────────── */}
      <Dialog
        open={reassignTarget !== null}
        onOpenChange={(open) => { if (!open) setReassignTarget(null); }}
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
              <Label htmlFor="reassign-provider">New provider</Label>
              <select
                id="reassign-provider"
                value={reassignProviderId}
                onChange={(e) => setReassignProviderId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
              >
                <option value="">Select an online provider…</option>
                {allProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.city ? ` — ${p.city}` : ''}
                  </option>
                ))}
              </select>
              {allProviders.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No online providers loaded. Refresh the live feed and retry.
                </p>
              )}
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
                if (!window.confirm('Reassign this booking to the selected provider?')) return;
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

      {/* ── Cancel dialog ───────────────────────────────────────────── */}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel booking</DialogTitle>
            <DialogDescription>
              {cancelTarget
                ? `Booking ${cancelTarget.id.slice(0, 8)} — ${formatCurrency(cancelTarget.totalAmount)}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
              This will refund the customer in full per current cancellation policy.
              Detailed refund preview will arrive in Phase 14+.
            </div>
            <div>
              <Label htmlFor="cancel-reason">Cancellation reason</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why cancel? (audit trail)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelMutation.isPending}
            >
              Keep booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!cancelTarget) return;
                // BUG-PHASE77-02 fix — pre-fix client validated reason
                // ≥ 5 chars but the server's `cancelBookingAsAdmin`
                // (booking-admin.service.ts:839) requires ≥ 10 via
                // `requireReason(reason, 10)`. A 6–9 char reason passed
                // the client check, hit the server, and bounced with
                // a generic 400. Now: client matches server's 10-char
                // floor so the dialog catches it with a clear toast.
                if (cancelReason.trim().length < 10) {
                  toast.warning('Reason must be at least 10 characters.');
                  return;
                }
                if (!window.confirm('Cancel this booking and trigger the configured refund flow?')) return;
                cancelMutation.mutate({
                  bookingId: cancelTarget.id,
                  reason: cancelReason.trim(),
                });
              }}
              disabled={cancelMutation.isPending || !canCancel}
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Message customer dialog ─────────────────────────────────── */}
      <Dialog
        open={messageTarget !== null}
        onOpenChange={(open) => { if (!open) setMessageTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message customer</DialogTitle>
            <DialogDescription>
              {messageTarget
                ? `Sends an admin notification to the customer on booking ${messageTarget.id.slice(0, 8)}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="message-body">Message</Label>
            <Textarea
              id="message-body"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Type the message the customer will see…"
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
