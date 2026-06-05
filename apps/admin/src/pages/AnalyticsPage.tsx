import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Label, Input, Textarea } from '@/components/ui';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

type TabId = 'ab-tests' | 'cohorts' | 'churn' | 'quality' | 'commission';

// Phase 14 Dispatch 13 — Bug 45 (A/B testing pulled for v1.0).
// The A/B Tests tab is hidden when feature_flag.ab_testing_enabled = false
// (the v1.0 default). Admin tab is filtered via useMemo against the flag.
const ALL_TABS: { id: TabId; label: string; flag?: keyof ReturnType<typeof useFeatureFlags> }[] = [
  { id: 'ab-tests', label: 'A/B Tests', flag: 'abTestingEnabled' },
  { id: 'cohorts', label: 'Cohort Analysis' },
  { id: 'churn', label: 'Churn Prediction' },
  { id: 'quality', label: 'Quality Scores' },
  { id: 'commission', label: 'Commission' },
];

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', targetMetric: 'conversion_rate', trafficSplit: 0.5 });
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
    }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['admin', 'ab-tests'] }); setShowCreate(false); setForm({ name: '', description: '', targetMetric: 'conversion_rate', trafficSplit: 0.5 }); },
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

  function createTest(): void {
    const name = form.name.trim();
    if (!name) {
      setActionError('Test name is required.');
      return;
    }
    if (!Number.isFinite(form.trafficSplit) || form.trafficSplit < 0.1 || form.trafficSplit > 0.9) {
      setActionError('Traffic split must be between 0.1 and 0.9.');
      return;
    }
    if (!window.confirm(`Create A/B test "${name}"?`)) return;
    setActionError('');
    createMut.mutate({ ...form, name });
  }

  function updateStatus(test: AbTest, status: string): void {
    if (!window.confirm(`${status === 'active' ? 'Start or resume' : status === 'paused' ? 'Pause' : 'End'} A/B test "${test.name}"?`)) return;
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
          <div className="flex gap-3">
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
          <button type="button" onClick={createTest} disabled={!form.name.trim() || createMut.isPending} className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-md disabled:opacity-50">
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
              <tr key={test.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedTestId(test.id === selectedTestId ? null : test.id)}>
                <td className="px-3 py-2 font-medium">{test.name}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${test.status === 'active' ? 'bg-green-100 text-green-700' : test.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{test.status}</span></td>
                <td className="px-3 py-2 text-slate-600">{test.targetMetric}</td>
                <td className="px-3 py-2 text-slate-600">{Math.round(test.trafficSplit * 100)}%</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {test.status === 'draft' && <button type="button" onClick={() => updateStatus(test, 'active')} className="px-2 py-1 text-xs bg-green-500 text-white rounded">Start</button>}
                    {test.status === 'active' && <button type="button" onClick={() => updateStatus(test, 'paused')} className="px-2 py-1 text-xs bg-yellow-500 text-white rounded">Pause</button>}
                    {test.status === 'active' && <button type="button" onClick={() => updateStatus(test, 'completed')} className="px-2 py-1 text-xs bg-blue-500 text-white rounded">End</button>}
                    {test.status === 'paused' && <button type="button" onClick={() => updateStatus(test, 'active')} className="px-2 py-1 text-xs bg-green-500 text-white rounded">Resume</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'cohorts', months, metric],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/analytics/cohorts', { params: { months, metric } });
      return res.data.data as CohortRow[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select aria-label="Cohort metric" className="px-3 py-1.5 border rounded text-sm" value={metric} onChange={(e) => setCohortMetric(e.target.value as 'retention' | 'revenue')}>
          <option value="retention">Retention</option>
          <option value="revenue">Revenue</option>
        </select>
        <select aria-label="Cohort month range" className="px-3 py-1.5 border rounded text-sm" value={months} onChange={(e) => setCohortMonths(Number(e.target.value))}>
          {[3, 6, 9, 12].map((m) => <option key={m} value={m}>{m} months</option>)}
        </select>
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : isError ? <p role="alert" className="text-sm text-red-600">Failed to load cohort data. Please try again.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left font-medium text-slate-600 border">Cohort</th>
                <th className="px-3 py-2 text-center font-medium text-slate-600 border">Size</th>
                {Array.from({ length: Math.min(months, 12) }, (_, i) => (
                  <th key={i} className="px-3 py-2 text-center font-medium text-slate-600 border">M{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.map((row) => (
                <tr key={row.cohort} className="border-t">
                  <td className="px-3 py-1.5 font-medium border">{row.cohort}</td>
                  <td className="px-3 py-1.5 text-center border">{row.cohortSize}</td>
                  {Array.from({ length: Math.min(months, 12) }, (_, i) => {
                    const p = row.periods.find((pp) => pp.period === i);
                    const pct = p?.percentage ?? 0;
                    const opacity = metric === 'retention' ? Math.max(0.1, pct / 100) : Math.min(1, Math.max(0.1, pct / 10));
                    return (
                      <td key={i} className="px-3 py-1.5 text-center border" style={{ backgroundColor: p ? `rgba(59,130,246,${opacity})` : undefined, color: p && opacity > 0.5 ? 'white' : undefined }}>
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
  lastBookingDate: string | null;
  daysSinceLastBooking: number;
  totalBookings: number;
  totalSpent: number;
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

  const { data, isLoading, isError } = useQuery({
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
      <div className="flex items-center gap-4">
        <select aria-label="Filter churn risk level" className="px-3 py-1.5 border rounded text-sm" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
          <option value="">All Risk Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <span className="text-sm text-slate-500">{data?.pagination.total ?? 0} customers</span>
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : isError ? <p role="alert" className="text-sm text-red-600">Failed to load churn data. Please try again.</p> : (
        <>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Customer</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Phone</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Last Booking</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Total Bookings</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Total Spent</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Risk Score</th>
                <th className="text-center px-3 py-2 font-medium text-slate-600">Level</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((c) => (
                <tr key={c.userId} className="border-t">
                  <td className="px-3 py-2 font-medium">{c.name || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{c.phone}</td>
                  <td className="px-3 py-2 text-center text-slate-600">{c.lastBookingDate ? new Date(c.lastBookingDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : 'Never'}</td>
                  <td className="px-3 py-2 text-center">{c.totalBookings}</td>
                  <td className="px-3 py-2 text-center">{formatCurrency(c.totalSpent)}</td>
                  <td className="px-3 py-2 text-center font-bold">{c.riskScore}</td>
                  <td className="px-3 py-2 text-center"><span className={`px-2 py-0.5 rounded text-xs font-medium ${riskColors[c.riskLevel] ?? 'bg-slate-100'}`}>{c.riskLevel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.data.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No customers match this risk level.</p>
          )}
          {(data?.pagination.totalPages ?? 0) > 1 && (
            <div className="flex justify-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 text-sm border rounded disabled:opacity-30">Prev</button>
              <span className="px-3 py-1 text-sm">{page} / {data?.pagination.totalPages}</span>
              <button type="button" disabled={page >= (data?.pagination.totalPages ?? 1)} onClick={() => setPage(page + 1)} className="px-3 py-1 text-sm border rounded disabled:opacity-30">Next</button>
            </div>
          )}
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
  computedAt: string;
}

function QualityTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get('qualitySort');
  const sortBy = ['overall', 'rating', 'completion', 'timeliness'].includes(sortParam ?? '') ? sortParam ?? 'overall' : 'overall';
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'quality-scores', sortBy],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/analytics/quality-scores', { params: { sortBy, pageSize: 50 } });
      return res.data as { data: QualityScore[]; pagination: { total: number } };
    },
  });

  const computeMut = useMutation({
    mutationFn: () => api.post('/api/v1/admin/analytics/quality-scores/compute', { periodDays: 90 }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['admin', 'quality-scores'] }); setActionError(''); },
    onError: (e) => setActionError(`Failed to recompute scores: ${getErrorMessage(e)}`),
  });

  function setSortBy(nextSortBy: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('qualitySort', nextSortBy);
      return params;
    });
  }

  function recomputeScores(): void {
    if (!window.confirm('Recompute provider quality scores for the last 90 days?')) return;
    computeMut.mutate();
  }

  const scoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-4">
      {actionError && <p role="alert" className="text-sm text-red-600 mb-2">{actionError}</p>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{data?.pagination.total ?? 0} scored providers</span>
          <select aria-label="Sort provider quality scores" className="px-3 py-1.5 border rounded text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="overall">Sort by Overall</option>
            <option value="rating">Sort by Rating</option>
            <option value="completion">Sort by Completion</option>
            <option value="timeliness">Sort by Timeliness</option>
          </select>
        </div>
        <button type="button" onClick={recomputeScores} disabled={computeMut.isPending} className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded-md disabled:opacity-50">
          {computeMut.isPending ? 'Computing...' : 'Recompute Scores'}
        </button>
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : isError ? <p role="alert" className="text-sm text-red-600">Failed to load quality scores. Please try again.</p> : data?.data.length === 0 ? (
        <p className="text-sm text-slate-500 py-4">No providers have quality scores yet. Click &ldquo;Recompute Scores&rdquo; to generate them.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Provider</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Tier</th>
              <th className="text-center px-3 py-2 font-medium text-slate-600">Overall</th>
              <th className="text-center px-3 py-2 font-medium text-slate-600">Rating</th>
              <th className="text-center px-3 py-2 font-medium text-slate-600">Completion</th>
              <th className="text-center px-3 py-2 font-medium text-slate-600">Timeliness</th>
              <th className="text-center px-3 py-2 font-medium text-slate-600">Cancel</th>
              <th className="text-center px-3 py-2 font-medium text-slate-600">Jobs</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((s) => (
              <tr key={s.providerId} className="border-t">
                <td className="px-3 py-2">
                  <p className="font-medium">{s.providerName || s.businessName}</p>
                  {s.businessName && s.providerName && <p className="text-xs text-slate-400">{s.businessName}</p>}
                </td>
                <td className="px-3 py-2"><span className="px-2 py-0.5 bg-slate-100 rounded text-xs">{s.tier}</span></td>
                <td className={`px-3 py-2 text-center font-bold ${scoreColor(s.overallScore)}`}>{s.overallScore}</td>
                <td className={`px-3 py-2 text-center ${scoreColor(s.ratingScore)}`}>{s.ratingScore}</td>
                <td className={`px-3 py-2 text-center ${scoreColor(s.completionScore)}`}>{s.completionScore}</td>
                <td className={`px-3 py-2 text-center ${scoreColor(s.timelinessScore)}`}>{s.timelinessScore}</td>
                <td className={`px-3 py-2 text-center ${scoreColor(s.cancellationScore)}`}>{s.cancellationScore}</td>
                <td className="px-3 py-2 text-center text-slate-600">{s.totalJobsScored}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Commission Optimization Tab ────────────────────────────────────

interface CommissionSuggestion {
  tier: string;
  currentRate: number;
  suggestedRate: number;
  providerCount: number;
  avgQualityScore: number;
  avgRevenue: number;
  rationale: string;
}

function CommissionTab(): React.ReactElement {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'commission-optimization'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/analytics/commission-optimization');
      return res.data.data as CommissionSuggestion[];
    },
  });

  return (
    <div className="space-y-4">
      {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : isError ? <p role="alert" className="text-sm text-red-600">Failed to load commission data. Please try again.</p> : (data?.length ?? 0) === 0 ? (
        <p className="text-sm text-slate-500 py-4">No commission optimization suggestions available.</p>
      ) : (
        <div className="grid gap-4">
          {data?.map((s) => {
            const delta = s.suggestedRate - s.currentRate;
            return (
              <div key={s.tier} className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-semibold capitalize">{s.tier} Tier</h4>
                    <p className="text-xs text-slate-500">{s.providerCount} providers</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Current: <strong>{(s.currentRate * 100).toFixed(0)}%</strong></p>
                    <p className={`text-sm font-medium ${delta < 0 ? 'text-green-600' : delta > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                      Suggested: <strong>{(s.suggestedRate * 100).toFixed(0)}%</strong>
                      {delta !== 0 && <span className="ml-1">({delta > 0 ? '+' : ''}{(delta * 100).toFixed(0)}pp)</span>}
                    </p>
                  </div>
                </div>
                <div className="flex gap-6 text-xs text-slate-500 mb-2">
                  <span>Avg Quality: <strong className="text-slate-700">{s.avgQualityScore}</strong></span>
                  <span>Avg Revenue: <strong className="text-slate-700">{formatCurrency(s.avgRevenue)}</strong></span>
                </div>
                <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">{s.rationale}</p>
              </div>
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Analytics</h2>
      </div>

      <div role="tablist" aria-label="Analytics sections" className="flex gap-1 border-b mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'ab-tests' && <AbTestsTab />}
      {activeTab === 'cohorts' && <CohortTab />}
      {activeTab === 'churn' && <ChurnTab />}
      {activeTab === 'quality' && <QualityTab />}
      {activeTab === 'commission' && <CommissionTab />}
    </div>
  );
}
