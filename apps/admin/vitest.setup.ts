/**
 * Phase 14 R7-real — vitest setup.
 *
 * Mocks the api module + auth-store so admin pages can render without
 * real network or storage access. Per-test mocks override specific
 * cases.
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Stub the project-internal API client.
vi.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [], pagination: { total: 0, page: 1 } } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

// Stub the auth store so pages that gate on isAuthenticated render.
vi.mock('@/stores/auth.store', () => {
  const baseState = {
    isAuthenticated: true,
    user: { id: 'admin-1', email: 'admin@onservice.us', role: 'super_admin' },
    logout: vi.fn(),
    hydrate: vi.fn(),
  };
  const useAuthStore = (selector?: (s: unknown) => unknown) =>
    selector ? selector(baseState) : baseState;
  // Zustand hooks expose a .getState() static for consumers that need the
  // raw state outside a React tree. Stub it so admin code that calls
  // useAuthStore.getState() doesn't throw.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (useAuthStore as any).getState = () => baseState;
  return { useAuthStore };
});

// react-router-dom: stub the navigation context so pages that use it can mount.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: 'sample-id' }),
    useSearchParams: () => [
      new URLSearchParams(),
      vi.fn(),
    ],
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'default' }),
    Link: ({ children, ...props }: { children: React.ReactNode }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (require('react') as any).createElement('a', props, children),
  };
});

// Sentry — no breadcrumbs in tests.
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  withErrorBoundary: <T,>(c: T) => c,
}));

// recharts — uses canvas + ResizeObserver; stub to a passthrough.
vi.mock('recharts', () => {
  const passthrough = (name: string) =>
    function Stub({ children }: { children?: React.ReactNode }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (require('react') as any).createElement('div', { 'data-recharts': name }, children);
    };
  return {
    LineChart: passthrough('LineChart'),
    BarChart: passthrough('BarChart'),
    PieChart: passthrough('PieChart'),
    AreaChart: passthrough('AreaChart'),
    XAxis: passthrough('XAxis'),
    YAxis: passthrough('YAxis'),
    CartesianGrid: passthrough('CartesianGrid'),
    Tooltip: passthrough('Tooltip'),
    Legend: passthrough('Legend'),
    Line: passthrough('Line'),
    Bar: passthrough('Bar'),
    Pie: passthrough('Pie'),
    Area: passthrough('Area'),
    Cell: passthrough('Cell'),
    ResponsiveContainer: passthrough('ResponsiveContainer'),
  };
});

// react-leaflet — needs the browser map runtime; stub.
vi.mock('react-leaflet', () => {
  const passthrough = (name: string) =>
    function Stub({ children }: { children?: React.ReactNode }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (require('react') as any).createElement('div', { 'data-leaflet': name }, children);
    };
  return {
    MapContainer: passthrough('MapContainer'),
    TileLayer: passthrough('TileLayer'),
    Marker: passthrough('Marker'),
    Popup: passthrough('Popup'),
    Polyline: passthrough('Polyline'),
    Circle: passthrough('Circle'),
    useMap: () => ({}),
  };
});

// Stub global ResizeObserver for components that depend on it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
