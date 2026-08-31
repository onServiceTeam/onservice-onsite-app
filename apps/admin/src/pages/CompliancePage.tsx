import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  FileText,
  Lock,
  Shield,
} from '@/components/icons';
import { useAuthStore } from '@/stores/auth.store';

type HoldTone = 'blocked' | 'held' | 'partial';

interface GovernanceItem {
  code: string;
  title: string;
  status: string;
  tone: HoldTone;
  summary: string;
  operatorRule: string;
}

const GOVERNANCE_ITEMS: GovernanceItem[] = [
  {
    code: 'E22',
    title: 'BIR document issuance',
    status: 'Held',
    tone: 'held',
    summary: 'The app retains internal tax workpapers and legacy sales records, but no accountant-approved principal-document design is in force.',
    operatorRule: 'Do not issue, finalize, or describe an app record as a BIR filing or authorized invoice.',
  },
  {
    code: 'E14',
    title: 'External checkout',
    status: 'Blocked',
    tone: 'blocked',
    summary: 'The internal payment state machine exists, but the current PayMongo hosted-authorization entry is not launch-ready.',
    operatorRule: 'An awaiting-payment row or browser redirect is not proof that money was collected.',
  },
  {
    code: 'E09',
    title: 'Cancellation authority',
    status: 'Held',
    tone: 'held',
    summary: 'The live refund engine and customer-displayed cancellation policy remain two different sources.',
    operatorRule: 'Use the case-specific server-calculated outcome and escalate any conflict with customer wording.',
  },
  {
    code: 'E40',
    title: 'Privacy deadline and breach contract',
    status: 'Counsel hold',
    tone: 'held',
    summary: 'The stored 15-day DSR date is an internal target. Breach notification still lacks a counsel-approved classification workflow.',
    operatorRule: 'Do not call the target an NPC-mandated completion SLA or classify every incident as reportable.',
  },
  {
    code: 'E37',
    title: 'Audit coverage',
    status: 'Partial evidence',
    tone: 'partial',
    summary: 'The evidence workspace combines selected admin decisions and selected system events. It is not a global request or mutation trail.',
    operatorRule: 'Use it as an evidence index and verify the underlying customer, provider, booking, support, or money record.',
  },
];

const TONE_CLASS: Record<HoldTone, string> = {
  blocked: 'border-red-200 bg-red-50 text-red-800',
  held: 'border-amber-200 bg-amber-50 text-amber-900',
  partial: 'border-sky-200 bg-sky-50 text-sky-900',
};

interface WorkspaceLink {
  to: string;
  title: string;
  description: string;
  Icon: typeof FileText;
}

const OPERATIONS_LINKS: WorkspaceLink[] = [
  {
    to: '/audit-log',
    title: 'Audit evidence',
    description: 'Search the two recorded evidence sources, open the exact record context, and export the same masked filter scope.',
    Icon: FileText,
  },
  {
    to: '/financials?tab=bir',
    title: 'Tax workpapers (held)',
    description: 'Review retained VAT workpapers, 2307 records, and legacy evidence without presenting them as approved filings.',
    Icon: Calendar,
  },
  {
    to: '/financials?tab=payments',
    title: 'Payments and refunds',
    description: 'Trace payment-attempt truth, unresolved gateway retries, customer outcomes, and the related booking record.',
    Icon: FileText,
  },
  {
    to: '/settings/cancellation-policy',
    title: 'Cancellation comparison',
    description: 'Compare the live refund settings with the customer-displayed policy while both mutation surfaces remain frozen.',
    Icon: AlertTriangle,
  },
];

function GovernanceCard({ item }: { item: GovernanceItem }): React.ReactElement {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{item.code}</p>
          <h2 className="mt-1 font-semibold text-[var(--color-text)]">{item.title}</h2>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${TONE_CLASS[item.tone]}`}>
          {item.status}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">{item.summary}</p>
      <div className="mt-4 rounded-lg bg-[var(--color-surface-hover)] p-3 text-sm leading-5 text-[var(--color-text)]">
        <span className="font-semibold">Operator rule: </span>{item.operatorRule}
      </div>
    </article>
  );
}

export default function CompliancePage(): React.ReactElement {
  const role = useAuthStore((state) => state.user?.role);
  const canOpenPrivacy = role === 'super_admin' || role === 'dpo';

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-[var(--color-primary)] px-5 py-6 text-white shadow-sm sm:px-7 lg:px-8">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <Shield size={18} /> Company governance boundary
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Compliance Control Center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85 sm:text-base">
            See what the platform can prove, what remains held, and which canonical workspace owns the underlying evidence.
            This screen does not file with an agency or certify legal compliance.
          </p>
        </div>
      </section>

      <section aria-labelledby="governance-status-heading">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Current operating boundary</p>
          <h2 id="governance-status-heading" className="mt-1 text-xl font-semibold text-[var(--color-text)]">Open holds and evidence limits</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {GOVERNANCE_ITEMS.map((item) => <GovernanceCard key={item.code} item={item} />)}
        </div>
      </section>

      <section aria-labelledby="canonical-workspaces-heading">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Canonical records</p>
          <h2 id="canonical-workspaces-heading" className="mt-1 text-xl font-semibold text-[var(--color-text)]">Continue the investigation</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {OPERATIONS_LINKS.map(({ to, title, description, Icon }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition hover:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <Icon size={22} className="text-[var(--color-primary)]" />
              <h3 className="mt-4 font-semibold text-[var(--color-text)]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{description}</p>
              <span className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
                Open workspace <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Lock size={21} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0">
            <h2 className="font-semibold text-[var(--color-text)]">Privacy segregation</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
              Data-subject requests and consent records belong to the appointed DPO. Plain operations admins do not receive those records from this page.
            </p>
            {canOpenPrivacy ? (
              <Link to="/privacy" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
                Open Privacy Workspace <ArrowRight size={16} />
              </Link>
            ) : (
              <p className="mt-3 text-sm font-medium text-amber-800">
                Escalate privacy cases to the DPO or super-admin fallback; do not copy personal data into a general support note.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
