import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Textarea,
  useConfirmationDialog,
} from '@/components/ui';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

type TabId = 'ab-tests' | 'cohorts' | 'churn' | 'quality' | 'commission';

// Phase 14 Dispatch 13 — Bug 45 (A/B testing pulled for v1.0).
// The A/B Tests tab is hidden when feature_flag.ab_testing_enabled = false
// (the v1.0 default). Admin tab is filtered via useMemo against the flag.
const ALL_TABS: { id: TabId; label: string; flag?: keyof ReturnType<typeof useFeatureFlags> }[] = [
  { id: 'ab-tests', label: 'A/B Tests', flag: 'abTestingEnabled' },
  { id: 'cohorts', label: 'Cohort Analysis' },
  { id: 'churn', label: 'Retention Signals' },
  { id: 'quality', label: 'Quality Evidence' },
  { id: 'commission', label: 'Commission Evidence' },
];

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatManilaDateTime(value: number | string | null | undefined): string {
  if (!value) return 'Not available';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function SourceContract({
  definition,
  source,
  freshness,
  boundary,
  tone = 'blue',
}: {
  definition: string;
  source: string;
  freshness: string;
  boundary: string;
  tone?: 'blue' | 'amber';
}): React.ReactElement {
  const colors = tone === 'amber'
    ? 'border-amber-300 bg-amber-50 text-amber-950'
    : 'border-blue-200 bg-blue-50 text-blue-950';
  return (
    <section aria-label="Metric definition and source" className={`rounded-md border p-4 ${colors}`}>
      <div className="grid gap-3 text-sm lg:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Definition</p>
          <p className="mt-1 leading-5">{definition}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Source</p>
          <p className="mt-1 leading-5">{source}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Freshness</p>
          <p className="mt-1 leading-5">{freshness}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Decision boundary</p>
          <p className="mt-1 leading-5">{boundary}</p>
        </div>
      </div>
    </section>
  );
}

function PageControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}): React.ReactElement | null {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Analytics result pages" className="flex flex-wrap items-center justify-center gap-2">
      <Button aria-label="Previous page" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
      <span className="px-2 text-sm text-slate-600">Page {page} of {totalPages}</span>
      <Button aria-label="Next page" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
    </nav>
  );
}

// ─── A/B Tests Tab ──────────────────────────────────────────────────

interface AbTest {
  id: string;
  name: string;
  description: string;
  status: string;
  variantAName: string;
  variantBName: string;
  targetMetric: string;
  trafficSplit: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

function AbTestsTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    variantAName: 'Control',
    variantBName: 'Variant B',
    targetMetric: 'conversion_rate',
    trafficSplit: 0.5,
  });
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'ab-tests'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/analytics/ab-tests');
      return res.data as { data: AbTest[]; pagination: { total: number } };
    },
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post('/api/v1/admin/analytics/ab-tests', {
      ...body,
      name: body.name.trim(),
      description: body.description.trim(),
      variantAName: body.variantAName.trim(),
      variantBName: body.variantBName.trim(),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ab-tests'] });
      setShowCreate(false);
      setForm({
        name: '',
        description: '',
        variantAName: 'Control',
        variantBName: 'Variant B',
        targetMetric: 'conversion_rate',
        trafficSplit: 0.5,
      });
    },
  });

  const statusMut = useMutation({
    mutationFn: (args: { testId: string; status: string }) => api.patch(`/api/v1/admin/analytics/ab-tests/${args.testId}/status`, { status: args.status }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['admin', 'ab-tests'] }); void queryClient.invalidateQueries({ queryKey: ['admin', 'ab-test-results'] }); setActionError(''); },
    onError: (e) => setActionError(`Failed to update test status: ${getErrorMessage(e)}`),
  });

  const { data: resultsData, isError: isResultsError } = useQuery({
    queryKey: ['admin', 'ab-test-results', selectedTestId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/admin/analytics/ab-tests/${selectedTestId}/results`);
      return res.data.data as {
        test: AbTest;
        variantA: { users: number; conversions: number; conversionRate: number; totalValue: number };
        variantB: { users: number; conversions: number; conversionRate: number; totalValue: number };
        winner: string;
        confidence: number;
      };
    },
    enabled: !!selectedTestId,
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (isError) return <p role="alert" className="text-sm text-red-600">Failed to load A/B tests. Please try again.</p>;

  async function createTest(): Promise<void> {
    const name = form.name.trim();
    if (!name) {
      setActionError('Test name is required.');
      return;
    }
    const variantAName = form.variantAName.trim();
    const variantBName = form.variantBName.trim();
    if (!variantAName || !variantBName) {
      setActionError('Both variant names are required.');
      return;
    }
    if (!Number.isFinite(form.trafficSplit) || form.trafficSplit < 0.1 || form.trafficSplit > 0.9) {
      setActionError('Traffic split must be between 0.1 and 0.9.');
      return;
    }
    const accepted = await confirm({
      title: 'Create A/B test?',
      description: `Create “${name}” as a draft with ${Math.round(form.trafficSplit * 100)}% of enrolled traffic assigned to variant B. No customer is enrolled until the test is started.`,
      confirmLabel: 'Create draft',
    });
    if (!accepted) return;
    setActionError('');
    createMut.mutate({
      ...form,
      name,
      description: form.description.trim(),
      variantAName,
      variantBName,
    });
  }

  async function updateStatus(test: AbTest, status: string): Promise<void> {
    const action = status === 'active' ? 'Start or resume' : status === 'paused' ? 'Pause' : 'End';
    const accepted = await confirm({
      title: `${action} A/B test?`,
      description: status === 'active'
        ? `“${test.name}” will begin assigning eligible users between its configured variants and recording ${test.targetMetric.replaceAll('_', ' ')}.`
        : status === 'paused'
          ? `“${test.name}” will stop new variant assignment until resumed. Existing results remain available.`
          : `“${test.name}” will stop permanently. Existing results remain available for review.`,
      confirmLabel: action,
      tone: status === 'completed' ? 'destructive' : 'default',
    });
    if (!accepted) return;
    statusMut.mutate({ testId: test.id, status });
  }

  return (
    <div className="space-y-4">
      {actionError && <p role="alert" className="text-sm text-red-600 mb-2">{actionError}</p>}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">A/B Tests ({data?.pagination.total ?? 0})</h3>
        <button type="button" onClick={() => setShowCreate(!showCreate)} className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded-md hover:opacity-90">
          {showCreate ? 'Cancel' : '+ New Test'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-slate-50 p-4 rounded-lg border space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ab-test-name">Test name</Label>
            <Input id="ab-test-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Checkout button color" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ab-test-desc">Description</Label>
            <Textarea id="ab-test-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What hypothesis are you testing?" rows={2} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ab-test-variant-a">Variant A name</Label>
              <Input id="ab-test-variant-a" value={form.variantAName} onChange={(e) => setForm({ ...form, variantAName: e.target.value })} placeholder="e.g., Current experience" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ab-test-variant-b">Variant B name</Label>
              <Input id="ab-test-variant-b" value={form.variantBName} onChange={(e) => setForm({ ...form, variantBName: e.target.value })} placeholder="e.g., New experience" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label htmlFor="ab-test-metric">Target metric</Label>
              <select id="ab-test-metric" className="px-3 py-2 border rounded text-sm" value={form.targetMetric} onChange={(e) => setForm({ ...form, targetMetric: e.target.value })}>
                <option value="conversion_rate">Conversion Rate</option>
                <option value="average_order_value">Avg Order Value</option>
                <option value="booking_count">Booking Count</option>
                <option value="revenue">Revenue</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ab-test-split">Traffic split</Label>
              <Input id="ab-test-split" type="number" step="0.05" min="0.1" max="0.9" className="w-32" value={form.trafficSplit} onChange={(e) => setForm({ ...form, trafficSplit: Number(e.target.value) })} />
            </div>
          </div>
          <button type="button" onClick={() => void createTest()} disabled={!form.name.trim() || createMut.isPending} className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-md disabled:opacity-50">
            {createMut.isPending ? 'Creating...' : 'Create Test'}
          </button>
          {createMut.isError && <p role="alert" className="text-red-600 text-xs">{getErrorMessage(createMut.error)}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Metric</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Split</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((test) => (
              <tr key={test.id} className="border-t hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    aria-expanded={selectedTestId === test.id}
                    onClick={() => setSelectedTestId(test.id === selectedTestId ? null : test.id)}
                    className="rounded-md px-2 text-left font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {test.name}
                  </button>
                </td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${test.status === 'active' ? 'bg-green-100 text-green-700' : test.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{test.status}</span></td>
                <td className="px-3 py-2 text-slate-600">{test.targetMetric}</td>
                <td className="px-3 py-2 text-slate-600">{Math.round(test.trafficSplit * 100)}%</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {test.status === 'draft' && <button type="button" onClick={() => void updateStatus(test, 'active')} className="px-2 py-1 text-xs bg-green-500 text-white rounded">Start</button>}
                    {test.status === 'active' && <button type="button" onClick={() => void updateStatus(test, 'paused')} className="px-2 py-1 text-xs bg-yellow-500 text-white rounded">Pause</button>}
                    {test.status === 'active' && <button type="button" onClick={() => void updateStatus(test, 'completed')} className="px-2 py-1 text-xs bg-blue-500 text-white rounded">End</button>}
                    {test.status === 'paused' && <button type="button" onClick={() => void updateStatus(test, 'active')} className="px-2 py-1 text-xs bg-green-500 text-white rounded">Resume</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.data.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">No A/B tests yet. Click &ldquo;+ New Test&rdquo; to create one.</p>
      )}

      {isResultsError && selectedTestId && <p role="alert" className="text-sm text-red-600">Failed to load test results.</p>}

      {resultsData && selectedTestId && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <h4 className="font-semibold">Results: {resultsData.test.name}</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded">
              <p className="text-xs font-medium text-blue-600 mb-1">{resultsData.test.variantAName}</p>
              <p className="text-lg font-bold">{resultsData.variantA.conversionRate}%</p>
              <p className="text-xs text-slate-500">{resultsData.variantA.conversions} / {resultsData.variantA.users} users</p>
            </div>
            <div className="bg-purple-50 p-3 rounded">
              <p className="text-xs font-medium text-purple-600 mb-1">{resultsData.test.variantBName}</p>
              <p className="text-lg font-bold">{resultsData.variantB.conversionRate}%</p>
              <p className="text-xs text-slate-500">{resultsData.variantB.conversions} / {resultsData.variantB.users} users</p>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <span>Winner: <strong className={resultsData.winner === 'none' ? 'text-slate-400' : 'text-green-600'}>{resultsData.winner === 'none' ? 'No clear winner yet' : `Variant ${resultsData.winner}`}</strong></span>
            <span>Confidence: <strong>{resultsData.confidence}%</strong></span>
          </div>
        </div>
      )}
      {confirmationDialog}
    </div>
  );
}

// ─── Cohort Analysis Tab ────────────────────────────────────────────

interface CohortRow {
  cohort: string;
  cohortSize: number;
  periods: Array<{ period: number; value: number; percentage: number }>;
}

function CohortTab(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const months = [3, 6, 9, 12].includes(parsePositiveInt(searchParams.get('months'), 6)) ? parsePositiveInt(searchParams.get('months'), 6) : 6;
  const metric = searchParams.get('metric') === 'revenue' ? 'revenue' : 'retention';

  function setCohortMetric(nextMetric: 'retention' | 'revenue'): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('metric', nextMetric);
      return params;
    });
  }

  function setCohortMonths(nextMonths: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('months', String(nextMonths));
      return params;
    });
  }

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['admin', 'cohorts', months, metric],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/analytics/cohorts', { params: { months, metric } });
      return res.data.data as CohortRow[];
    },
  });

  return (
    <div className="space-y-4">
      <SourceContract
        definition={metric === 'retention'
          ? 'Customers grouped by Manila signup month. Each M-period is the share with at least one booking created in that Manila month, excluding cancelled bookings.'
          : 'Customers grouped by Manila signup month. Each M-period is the total recorded booking face value for confirmed, resolved, payout-ready, or paid-out bookings.'}
        source="Customer account creation plus booking creation time, status, customer, and total amount. Queried from the operational database."
        freshness={dataUpdatedAt ? `Generated ${formatManilaDateTime(dataUpdatedAt)} PHT.` : 'Waiting for the current query.'}
        boundary={metric === 'retention'
          ? 'Booking activity is not completed service, customer satisfaction, or payment settlement.'
          : 'Recorded booking value is not recognized platform revenue, provider earnings, or proof of gateway settlement.'}
      />
      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="cohort-metric">Measure</Label>
          <select id="cohort-metric" aria-label="Cohort metric" className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm" value={metric} onChange={(e) => setCohortMetric(e.target.value as 'retention' | 'revenue')}>
          <option value="retention">Retention</option>
          <option value="revenue">Recorded booking value</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cohort-range">Signup window</Label>
          <select id="cohort-range" aria-label="Cohort month range" className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm" value={months} onChange={(e) => setCohortMonths(Number(e.target.value))}>
          {[3, 6, 9, 12].map((m) => <option key={m} value={m}>{m} months</option>)}
          </select>
        </div>
      </div>

      {isLoading ? <LoadingState label="Loading cohort analysis…" /> : isError ? (
        <ErrorState
          title="Cohort analysis unavailable"
          description={`${getErrorMessage(error)} Retention and revenue figures are not available.`}
          action={<Button onClick={(): void => { void refetch(); }}>Retry cohort analysis</Button>}
        />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="No cohort data" description="No customer signup cohorts match this window." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border px-3 py-3 text-left font-medium text-slate-600">Signup cohort</th>
                <th className="border px-3 py-3 text-center font-medium text-slate-600">Customers</th>
                {Array.from({ length: Math.min(months, 12) }, (_, i) => (
                  <th key={i} className="border px-3 py-3 text-center font-medium text-slate-600">M{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.map((row) => (
                <tr key={row.cohort} className="border-t">
                  <td className="border px-3 py-3 font-medium">{row.cohort}</td>
                  <td className="border px-3 py-3 text-center">{row.cohortSize}</td>
                  {Array.from({ length: Math.min(months, 12) }, (_, i) => {
                    const periods = Array.isArray(row.periods) ? row.periods : [];
                    const p = periods.find((pp) => pp.period === i);
                    const pct = p?.percentage ?? 0;
                    const opacity = metric === 'retention' ? Math.max(0.1, pct / 100) : Math.min(1, Math.max(0.1, pct / 10));
                    return (
                      <td key={i} className="border px-3 py-3 text-center" style={{ backgroundColor: p ? `rgba(59,130,246,${opacity})` : undefined, color: p && opacity > 0.5 ? 'white' : undefined }}>
                        {p ? (metric === 'retention' ? `${pct}%` : formatCurrency(p.value)) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Churn Prediction Tab ───────────────────────────────────────────

interface ChurnCustomer {
  userId: string;
  name: string;
  phone: string;
  contactMasked: boolean;
  lastBookingDate: string | null;
  daysSinceLastBooking: number;
  totalBookings: number;
  totalBookedValue: number;
  riskScore: number;
  riskLevel: string;
}

function ChurnTab(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const riskLevel = ['critical', 'high', 'medium', 'low'].includes(searchParams.get('risk') ?? '') ? searchParams.get('risk') ?? '' : '';
  const page = parsePositiveInt(searchParams.get('churnPage'), 1);

  function setRiskLevel(nextRiskLevel: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('churnPage');
      if (nextRiskLevel) params.set('risk', nextRiskLevel);
      else params.delete('risk');
      return params;
    });
  }

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextPage <= 1) params.delete('churnPage');
      else params.set('churnPage', String(nextPage));
      return params;
    });
  }

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['admin', 'churn', riskLevel, page],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, pageSize: adminConfig.defaultPageSize };
      if (riskLevel) params.riskLevel = riskLevel;
      const res = await api.get('/api/v1/admin/analytics/churn', { params });
      return res.data as { data: ChurnCustomer[]; pagination: { total: number; totalPages: number } };
    },
  });

  const riskColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-4">
      <SourceContract
        definition="A deterministic attention score from time since the latest non-cancelled booking, non-cancelled booking count, and recorded booking face value. Higher is more attention, not a probability."
        source="Active customer accounts and their non-cancelled booking records. Ordinary-admin contact is masked by the API."
        freshness={dataUpdatedAt ? `Generated ${formatManilaDateTime(dataUpdatedAt)} PHT.` : 'Waiting for the current query.'}
        boundary="This is not churn prediction, outreach consent, service completion, or payment settlement. Open Customer 360 and the linked records before action."
      />
      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label htmlFor="retention-signal-filter">Attention signal</Label>
          <select id="retention-signal-filter" aria-label="Filter churn risk level" className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
          <option value="">All attention levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          </select>
        </div>
        <span className="text-sm text-slate-500">
          {data ? `${data.pagination.total} active customer accounts` : 'Customer count unavailable'}
        </span>
      </div>

      {isLoading ? <LoadingState label="Loading retention attention signals…" /> : isError ? (
        <ErrorState
          title="Retention signals unavailable"
          description={`${getErrorMessage(error)} No customer count or attention conclusion is available.`}
          action={<Button onClick={() => { void refetch(); }}>Retry retention signals</Button>}
        />
      ) : (data?.data.length ?? 0) === 0 ? (
        <EmptyState title="No matching customer signals" description="No active customer account matches this attention filter." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Customer account</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Contact</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Last Booking</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Non-cancelled bookings</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Recorded booking value</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Attention score</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Signal</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((c) => (
                <tr key={c.userId} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    <Link className="text-[var(--color-primary)] hover:underline" to={`/customers/${c.userId}`}>
                      {c.name || 'Open Customer 360'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {c.phone}{c.contactMasked ? <span className="ml-1 text-xs">(masked)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">{c.lastBookingDate ? new Date(c.lastBookingDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : 'Never'}</td>
                  <td className="px-3 py-2 text-center">{c.totalBookings}</td>
                  <td className="px-3 py-2 text-center">{formatCurrency(c.totalBookedValue)}</td>
                  <td className="px-3 py-2 text-center font-bold">{c.riskScore}</td>
                  <td className="px-3 py-2 text-center"><span className={`px-2 py-0.5 rounded text-xs font-medium ${riskColors[c.riskLevel] ?? 'bg-slate-100'}`}>{c.riskLevel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <PageControls page={page} totalPages={data?.pagination.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

// ─── Quality Scores Tab ─────────────────────────────────────────────

interface QualityScore {
  providerId: string;
  providerName: string;
  businessName: string;
  tier: string;
  overallScore: number;
  ratingScore: number;
  completionScore: number;
  timelinessScore: number;
  cancellationScore: number;
  responseScore: number;
  totalJobsScored: number;
  periodStart: string;
  periodEnd: string;
  computedAt: string;
}

function QualityTab(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get('qualitySort');
  const sortBy = ['overall', 'rating', 'completion', 'timeliness', 'cancellation', 'response'].includes(sortParam ?? '')
    ? sortParam ?? 'overall'
    : 'overall';
  const page = parsePositiveInt(searchParams.get('qualityPage'), 1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'quality-scores', sortBy, page],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/analytics/quality-scores', { params: { sortBy, page, pageSize: 25 } });
      return res.data as { data: QualityScore[]; pagination: { total: number; totalPages: number } };
    },
  });

  const newestVisibleSnapshot = data?.data.reduce<string | null>((latest, score) => {
    const scoreTime = new Date(score.computedAt).getTime();
    if (!Number.isFinite(scoreTime)) return latest;
    if (!latest || scoreTime > new Date(latest).getTime()) return score.computedAt;
    return latest;
  }, null) ?? null;

  function setSortBy(nextSortBy: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('qualitySort', nextSortBy);
      params.delete('qualityPage');
      return params;
    });
  }

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextPage <= 1) params.delete('qualityPage');
      else params.set('qualityPage', String(nextPage));
      return params;
    });
  }

  return (
    <div className="space-y-4">
      <SourceContract
        tone="amber"
        definition="Legacy automated index: rating 30%, completion 25%, completion within two hours of scheduled start 20%, provider cancellation 15%, and quote response time 10%."
        source="Stored provider_quality_scores snapshots. The rating input is the provider aggregate; booking and quote inputs use the stored snapshot period."
        freshness={newestVisibleSnapshot
          ? `Newest visible snapshot calculated ${formatManilaDateTime(newestVisibleSnapshot)} PHT.`
          : 'No current snapshot is visible.'}
        boundary="E47 holds recomputation because this model conflicts with the approved monthly operations scorecard. Do not use the overall number alone for discipline, tier, dispatch, or commission decisions."
      />
      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label htmlFor="quality-sort">Order snapshots</Label>
          <select id="quality-sort" aria-label="Sort provider quality scores" className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="overall">Legacy overall</option>
            <option value="rating">Rating component</option>
            <option value="completion">Completion component</option>
            <option value="timeliness">Two-hour completion component</option>
            <option value="cancellation">Cancellation component</option>
            <option value="response">Quote response component</option>
          </select>
        </div>
        <span className="text-sm text-slate-500">
          {data ? `${data.pagination.total} provider snapshots` : 'Snapshot count unavailable'}
        </span>
      </div>

      {isLoading ? <LoadingState label="Loading legacy quality snapshots…" /> : isError ? (
        <ErrorState
          title="Quality snapshots unavailable"
          description={`${getErrorMessage(error)} No quality conclusion is available.`}
          action={<Button onClick={() => { void refetch(); }}>Retry quality snapshots</Button>}
        />
      ) : data?.data.length === 0 ? (
        <EmptyState title="No quality snapshots" description="No legacy automated provider score snapshots are stored." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-white">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-[18%] px-3 py-2 text-left font-medium text-slate-600">Provider</th>
              <th className="w-[9%] px-3 py-2 text-left font-medium text-slate-600">Tier</th>
              <th className="w-[10%] px-3 py-2 text-center font-medium text-slate-600">Legacy overall</th>
              <th className="w-[34%] px-3 py-2 text-left font-medium text-slate-600">Component evidence</th>
              <th className="w-[7%] px-3 py-2 text-center font-medium text-slate-600">Jobs</th>
              <th className="w-[22%] px-3 py-2 text-left font-medium text-slate-600">Snapshot evidence</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((s) => (
              <tr key={s.providerId} className="border-t">
                <td className="px-3 py-2">
                  <Link to={`/providers/${s.providerId}`} className="font-medium text-[var(--color-primary)] hover:underline">
                    {s.providerName || s.businessName || 'Open Provider 360'}
                  </Link>
                  {s.businessName && s.providerName && <p className="text-xs text-slate-400">{s.businessName}</p>}
                </td>
                <td className="px-3 py-2"><span className="px-2 py-0.5 bg-slate-100 rounded text-xs">{s.tier}</span></td>
                <td className="px-3 py-2 text-center font-bold">{s.overallScore}</td>
                <td className="px-3 py-2">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Rating</dt><dd>{s.ratingScore}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Completion</dt><dd>{s.completionScore}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">2h completion</dt><dd>{s.timelinessScore}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Cancellation</dt><dd>{s.cancellationScore}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Quote response</dt><dd>{s.responseScore}</dd></div>
                  </dl>
                </td>
                <td className="px-3 py-2 text-center text-slate-600">{s.totalJobsScored}</td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  <p>{s.periodStart} to {s.periodEnd}</p>
                  <p>Calculated {formatManilaDateTime(s.computedAt)} PHT</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <PageControls page={page} totalPages={data?.pagination.totalPages ?? 1} onPageChange={setPage} />
    </div>
  );
}

// ─── Commission Evidence Tab ────────────────────────────────────────

interface CommissionEvidence {
  tier: string;
  currentRate: number;
  providerCount: number;
  legacyQualitySampleCount: number;
  averageCompletedBookings: number;
  averageCompletedBookingValue: number;
  sampleStatus: 'insufficient' | 'available';
}

function CommissionTab(): React.ReactElement {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['admin', 'commission-evidence'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/analytics/commission-evidence');
      return res.data.data as CommissionEvidence[];
    },
  });

  return (
    <div className="space-y-4">
      <SourceContract
        tone="amber"
        definition="Read-only evidence by provider tier: current effective base agreement, approved provider count, average completed bookings per approved provider, average gross face value per completed booking, and legacy quality snapshot count."
        source="Effective-dated tier agreement versions, approved provider profiles, current legacy quality snapshots, and confirmed/resolved/payout-ready/paid-out bookings from the last 90 days."
        freshness={dataUpdatedAt ? `Generated ${formatManilaDateTime(dataUpdatedAt)} PHT.` : 'Waiting for the current query.'}
        boundary="E48 removes automated rate advice. These figures do not forecast provider behavior, calculate provider earnings, approve a price change, or publish a setting."
      />
      {isLoading ? <LoadingState label="Loading commission evidence…" /> : isError ? (
        <ErrorState
          title="Commission evidence unavailable"
          description={`${getErrorMessage(error)} No tier comparison or rate conclusion is available.`}
          action={<Button onClick={() => { void refetch(); }}>Retry commission evidence</Button>}
        />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="No commission evidence" description="No configured provider tiers are available for comparison." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data?.map((s) => {
            return (
              <article key={s.tier} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold capitalize">{s.tier} tier</h4>
                    <p className="mt-1 text-xs text-slate-500">90-day read-only evidence</p>
                  </div>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-900">
                    Current base agreement {(s.currentRate * 100).toFixed(2)}%
                  </span>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-50 p-3">
                    <dt className="text-xs text-slate-500">Approved providers</dt>
                    <dd className="mt-1 text-lg font-semibold">{s.providerCount}</dd>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <dt className="text-xs text-slate-500">Average completed bookings per approved provider</dt>
                    <dd className="mt-1 text-lg font-semibold">{s.averageCompletedBookings.toFixed(1)}</dd>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <dt className="text-xs text-slate-500">Average gross value per completed booking</dt>
                    <dd className="mt-1 text-lg font-semibold">{formatCurrency(s.averageCompletedBookingValue)}</dd>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <dt className="text-xs text-slate-500">Legacy quality snapshots</dt>
                    <dd className="mt-1 text-lg font-semibold">{s.legacyQualitySampleCount}</dd>
                  </div>
                </dl>
                <div className={`mt-4 rounded-md border p-3 text-sm ${s.sampleStatus === 'available' ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                  {s.sampleStatus === 'available'
                    ? 'Evidence sample is available for a human review. No rate recommendation is generated.'
                    : 'Evidence is too small for comparison: at least 5 approved providers, 5 legacy quality snapshots, and 5 average completed bookings are required.'}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Analytics Page ────────────────────────────────────────────

export default function AnalyticsPage(): React.ReactElement {
  const flags = useFeatureFlags();
  const [searchParams, setSearchParams] = useSearchParams();
  // Filter out feature-flagged tabs that are off; default opens to the
  // first visible tab so a deep-link to ab-tests gracefully falls through.
  const TABS = useMemo(
    () => ALL_TABS.filter((t) => !t.flag || flags[t.flag]),
    [flags],
  );
  const activeTab = TABS.some((tab) => tab.id === searchParams.get('tab'))
    ? searchParams.get('tab') as TabId
    : (TABS[0]?.id ?? 'cohorts') as TabId;

  function selectTab(tabId: TabId): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('tab', tabId);
      return params;
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">Command</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Operations analytics</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Read definitions, source, freshness, and decision limits before using a number. Customer and provider rows open the canonical 360 record for investigation.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          Live queries and stored snapshots are labelled separately
        </div>
      </div>

      <div role="tablist" aria-label="Analytics sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-300">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`analytics-tab-${tab.id}`}
            aria-controls={`analytics-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
            className={`min-h-11 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        id={`analytics-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`analytics-tab-${activeTab}`}
      >
        {activeTab === 'ab-tests' && <AbTestsTab />}
        {activeTab === 'cohorts' && <CohortTab />}
        {activeTab === 'churn' && <ChurnTab />}
        {activeTab === 'quality' && <QualityTab />}
        {activeTab === 'commission' && <CommissionTab />}
      </section>
    </div>
  );
}
