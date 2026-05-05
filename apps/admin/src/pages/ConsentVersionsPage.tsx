/**
// Phase 14 remediation — audited (D14r-9 markers pass)
 * Phase 13 Dispatch C — Consent Versions manager (admin DPO surface).
 *
 * Lists current (consent_type, version) tuples with active-user counts
 * (derived from consent_records) and the published-version audit trail.
 * Lets DPO publish a new version (writes admin_actions.consent_version_published).
 *
 * All form inputs include aria-* attributes; all feedback uses sonner toasts.
 */

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { Shield } from '@/components/icons';

interface ConsentVersionSummary {
  consentType: string;
  version: string;
  effectiveDate: string;
  activeUsers: number;
  totalRecords: number;
  lastUpdated: string;
}

interface PublishedConsentVersion {
  id: string;
  consentType: string;
  version: string;
  effectiveAt: string;
  changeSummary: string;
  /**
   * LAUNCH-LIMITATIONS #5 — when true, the publish event forces every
   * user with an older grant of this consentType to re-acknowledge.
   * Server returns false for legacy publishes that predate the flag.
   */
  material: boolean;
  publishedBy: string | null;
  publishedAt: string;
}

interface ConsentVersionsResponse {
  data: { summaries: ConsentVersionSummary[]; published: PublishedConsentVersion[] };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

// BUG-PHASE111-01 fix — pre-fix this called toISOString().slice(0,10),
// which returns the UTC date. For an admin in Manila publishing late
// at night (e.g., 00:30 Manila Thursday = 16:30 UTC Wednesday), the
// effectiveDate defaulted to 'Wednesday' even though the admin saw
// the screen on 'Thursday'. The effectiveDate is a legally relevant
// field — it determines when a consent version is in force for the
// active-users count. Now we extract Manila day via toLocaleDateString
// with `en-CA` (which produces the same YYYY-MM-DD shape).
function todayLocalIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export default function ConsentVersionsPage(): React.ReactElement {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'current' | 'history'>('current');
  const [publishOpen, setPublishOpen] = useState(false);
  const [consentType, setConsentType] = useState('');
  const [versionStr, setVersionStr] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayLocalIso());
  const [changeSummary, setChangeSummary] = useState('');
  // LAUNCH-LIMITATIONS #5 — defaults to false so a routine publish
  // keeps the legacy marker-only semantics. Operator must explicitly
  // tick the box when the change is material (e.g., adds new processing
  // purpose, expands data sharing). Acknowledgement copy in the dialog
  // explains the consequence.
  const [material, setMaterial] = useState(false);

  const versionsQuery = useQuery({
    queryKey: ['adminConsentVersions'],
    queryFn: async (): Promise<{ summaries: ConsentVersionSummary[]; published: PublishedConsentVersion[] }> => {
      const res = await api.get<ConsentVersionsResponse>('/api/v1/admin/compliance/consent-versions');
      return res.data.data;
    },
    staleTime: 30 * 1000,
  });

  const knownTypes = useMemo(() => {
    const set = new Set<string>();
    (versionsQuery.data?.summaries ?? []).forEach((s) => set.add(s.consentType));
    (versionsQuery.data?.published ?? []).forEach((p) => { if (p.consentType) set.add(p.consentType); });
    return Array.from(set).sort();
  }, [versionsQuery.data]);

  const publishMutation = useMutation({
    mutationFn: async (input: {
      consentType: string;
      version: string;
      effectiveAt: string;
      changeSummary: string;
      material: boolean;
    }) => {
      await api.post('/api/v1/admin/compliance/consent-versions', {
        consentType: input.consentType,
        version: input.version,
        effectiveAt: input.effectiveAt,
        changeSummary: input.changeSummary,
        material: input.material,
      });
    },
    onSuccess: () => {
      toast.success('Consent version published.');
      void queryClient.invalidateQueries({ queryKey: ['adminConsentVersions'] });
      closePublishDialog();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const closePublishDialog = (): void => {
    setPublishOpen(false);
    setConsentType('');
    setVersionStr('');
    setEffectiveDate(todayLocalIso());
    setChangeSummary('');
    setMaterial(false);
  };

  const publishDisabled = consentType.trim().length === 0
    || versionStr.trim().length === 0
    || changeSummary.trim().length < 30
    || publishMutation.isPending;

  const summaryColumns: Column<ConsentVersionSummary>[] = [
    {
      key: 'consentType',
      header: 'Consent type',
      render: (r) => <span className="font-mono text-xs">{r.consentType}</span>,
    },
    { key: 'version', header: 'Version', render: (r) => r.version },
    { key: 'effective', header: 'First seen', render: (r) => fmtDate(r.effectiveDate) },
    {
      key: 'activeUsers',
      header: 'Active users',
      render: (r) => <span className="font-medium">{r.activeUsers.toLocaleString('en-PH')}</span>,
    },
    {
      key: 'total',
      header: 'Total records',
      render: (r) => r.totalRecords.toLocaleString('en-PH'),
    },
    { key: 'lastUpdated', header: 'Last updated', render: (r) => fmtDate(r.lastUpdated) },
  ];

  const publishedColumns: Column<PublishedConsentVersion>[] = [
    {
      key: 'consentType',
      header: 'Consent type',
      render: (r) => <span className="font-mono text-xs">{r.consentType}</span>,
    },
    { key: 'version', header: 'Version', render: (r) => r.version },
    { key: 'effective', header: 'Effective', render: (r) => fmtDate(r.effectiveAt) },
    {
      key: 'summary',
      header: 'Change summary',
      render: (r) => <span className="text-xs text-slate-700">{r.changeSummary}</span>,
    },
    {
      key: 'material',
      header: 'Material',
      render: (r) => r.material ? (
        <span
          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
          aria-label="Material change requiring re-consent"
        >Material</span>
      ) : (
        <span className="text-xs text-slate-400">—</span>
      ),
    },
    {
      key: 'publishedBy',
      header: 'Published by',
      render: (r) => r.publishedBy ? <span className="font-mono text-xs">{r.publishedBy.slice(0, 8)}</span> : '—',
    },
    { key: 'publishedAt', header: 'Published at', render: (r) => fmtDate(r.publishedAt) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield size={22} className="text-[var(--color-secondary)]" />
            Consent Versions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track NPC-relevant consent surfaces and publish new versions when policies change.
          </p>
        </div>
        <Button
          onClick={() => setPublishOpen(true)}
          aria-label="Publish a new consent version"
        >
          Publish new version
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'current' | 'history')}>
        <TabsList>
          <TabsTrigger value="current">Current versions</TabsTrigger>
          <TabsTrigger value="history">Audit trail</TabsTrigger>
        </TabsList>
        <TabsContent value="current">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Versions currently in use</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={summaryColumns}
                data={versionsQuery.data?.summaries ?? []}
                keyExtractor={(r) => `${r.consentType}__${r.version}`}
                isLoading={versionsQuery.isLoading}
                emptyMessage={versionsQuery.isError
                  ? 'Failed to load consent versions.'
                  : 'No consent records have been recorded yet.'}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Published-version audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={publishedColumns}
                data={versionsQuery.data?.published ?? []}
                keyExtractor={(r) => r.id}
                isLoading={versionsQuery.isLoading}
                emptyMessage="No consent versions have been published yet."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Publish dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={publishOpen}
        onOpenChange={(open) => { if (!open) closePublishDialog(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish a new consent version</DialogTitle>
            <DialogDescription>
              Records a new policy version for NPC traceability. Tick the
              "material change" box only when the change is significant
              enough that every user with a prior grant must re-acknowledge
              before continuing — that flag is what drives the customer
              re-consent prompt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cv-type">Consent type</Label>
              <Input
                id="cv-type"
                list="cv-known-types"
                value={consentType}
                onChange={(e) => setConsentType(e.target.value)}
                placeholder="e.g., privacy_policy"
                aria-required="true"
                aria-describedby="cv-type-help"
                maxLength={50}
              />
              <datalist id="cv-known-types">
                {knownTypes.map((t) => <option key={t} value={t} />)}
              </datalist>
              <p id="cv-type-help" className="text-xs text-slate-500 mt-1">
                Existing types: {knownTypes.length > 0 ? knownTypes.join(', ') : '(none yet)'}.
              </p>
            </div>
            <div>
              <Label htmlFor="cv-version">Version</Label>
              <Input
                id="cv-version"
                value={versionStr}
                onChange={(e) => setVersionStr(e.target.value)}
                placeholder="e.g., 1.2 or 2026-04-28"
                aria-required="true"
                maxLength={20}
              />
            </div>
            <div>
              <Label htmlFor="cv-effective">Effective date</Label>
              <Input
                id="cv-effective"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cv-summary">Change summary</Label>
              <Textarea
                id="cv-summary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="Justify the version bump. What changed? What rights are affected?"
                rows={4}
                aria-required="true"
                aria-describedby="cv-summary-help"
              />
              <p id="cv-summary-help" className="text-xs text-slate-500 mt-1">
                Minimum 30 characters. Will appear in the audit trail.
              </p>
            </div>
            {/* LAUNCH-LIMITATIONS #5 — material flag toggle. */}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  id="cv-material"
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-amber-600"
                  checked={material}
                  onChange={(e) => setMaterial(e.target.checked)}
                  aria-describedby="cv-material-help"
                />
                <span>
                  <span className="block text-sm font-semibold text-amber-900">
                    This is a material change (force re-consent)
                  </span>
                  <span
                    id="cv-material-help"
                    className="block text-xs text-amber-800 mt-1"
                  >
                    Every user with a prior grant of this consent type
                    will see a re-consent prompt at next interaction.
                    Use only for changes large enough to require
                    explicit fresh acknowledgement (new processing
                    purposes, expanded data sharing, etc.).
                  </span>
                </span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePublishDialog} disabled={publishMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                publishMutation.mutate({
                  consentType: consentType.trim(),
                  version: versionStr.trim(),
                  // BUG-PHASE116-01 fix — pre-fix the picked date was
                  // stamped with `T00:00:00Z` (UTC midnight). Admin
                  // selecting "Effective Wednesday May 5" actually
                  // made the consent version come into force at
                  // 2026-05-05T00:00:00 UTC = 2026-05-05T08:00:00
                  // Manila — so customers booking between 00:00 and
                  // 08:00 Manila on May 5 were still bound by the
                  // OLD consent version. For a material consent
                  // change with legal implications (NPC RA 10173),
                  // an 8-hour window of "wrong consent applied" is
                  // not OK. Anchor to +08:00 so the in-force moment
                  // matches the Manila day the admin picked. Same
                  // Manila-tz pattern as Phase 105/113/115.
                  effectiveAt: effectiveDate.length > 0
                    ? new Date(effectiveDate + 'T00:00:00+08:00').toISOString()
                    : new Date().toISOString(),
                  changeSummary: changeSummary.trim(),
                  material,
                });
              }}
              disabled={publishDisabled}
            >
              {publishMutation.isPending ? 'Publishing…' : 'Publish version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
