import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { adminConfig } from '@/config/admin.config';
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  ExternalLink,
  Search,
} from '@/components/icons';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

interface AuditEntry {
  id: string;
  source?: 'audit_log' | 'admin_actions';
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  targetUserRole?: string | null;
  targetProviderId?: string | null;
  targetBookingId?: string | null;
  targetTaxYear?: number | null;
  targetTaxQuarter?: number | null;
  targetTaxMonth?: number | null;
  targetCategoryId?: string | null;
  targetSubcategoryId?: string | null;
  targetConversationId?: string | null;
  targetMessageId?: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  reason?: string | null;
  createdAt: string;
}

interface AuditResponse {
  data: AuditEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

type SourceFilter = 'all' | 'audit_log' | 'admin_actions';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SOURCE_BADGE: Record<NonNullable<AuditEntry['source']>, { label: string; cls: string }> = {
  audit_log: { label: 'System event', cls: 'bg-slate-100 text-slate-700' },
  admin_actions: { label: 'Admin decision', cls: 'bg-amber-100 text-amber-800' },
};

const ACTION_LABELS: Record<string, string> = {
  admin_message_sent: 'Booking support message sent',
  audit_log_exported: 'Audit timeline exported',
  booking_cancelled: 'Booking cancelled',
  booking_force_completed: 'Booking force-completed',
  booking_reassigned: 'Booking reassigned',
  bir_2307_batch_generated: '2307 workpaper batch generated',
  bir_2307_regenerated: '2307 workpaper batch regenerated',
  config_changed: 'Configuration changed',
  consent_search: 'Consent evidence searched',
  consent_version_published: 'Consent version published',
  conversation_viewed: 'Private booking conversation viewed',
  customer_credited: 'Customer wallet adjusted',
  customer_flagged_fraud: 'Customer flagged for fraud review',
  customer_reactivated: 'Customer reactivated',
  customer_suspended: 'Customer suspended',
  dispute_assigned: 'Dispute assigned',
  dispute_escalated: 'Dispute escalated',
  dispute_message_sent: 'Dispute message sent',
  dispute_reopened: 'Dispute reopened',
  dispute_resolved: 'Dispute resolved',
  'dsr.created': 'Data subject request created',
  'dsr.status_changed': 'Data subject request status changed',
  dsr_escalated_to_npc: 'NPC case reference recorded',
  dsr_marked_complete: 'Data subject request completed',
  dsr_more_info_requested: 'More information requested for data subject request',
  dsr_rejected: 'Data subject request rejected',
  dsr_review_started: 'Data subject request review started',
  feedback_submission_updated: 'Tester feedback triage updated',
  message_flag_reviewed: 'Reported message reviewed',
  message_redacted: 'Message redacted',
  or_cancelled: 'Official receipt cancelled',
  or_issued: 'Official receipt issued',
  payout_approved: 'Payout approved',
  payout_completed: 'Payout marked transferred',
  payout_rejected: 'Payout rejected',
  pii_reveal: 'Private information revealed',
  provider_approved: 'Provider approved',
  provider_application_approved: 'Provider application approved',
  provider_application_rejected: 'Provider application rejected',
  provider_application_sent_back: 'Provider application sent back',
  provider_application_submitted: 'Provider application submitted',
  provider_certification_unverified: 'Provider certification unverified',
  provider_certification_verified: 'Provider certification verified',
  provider_document_approved: 'Provider document approved',
  provider_document_rejected: 'Provider document rejected',
  provider_note_added: 'Provider support note added',
  provider_note_deleted: 'Provider support note deleted',
  provider_note_updated: 'Provider support note updated',
  provider_reactivated: 'Provider reactivated',
  provider_rejected: 'Provider rejected',
  provider_staff_approved: 'Provider staff approved',
  provider_staff_reactivated: 'Provider staff reactivated',
  provider_staff_rejected: 'Provider staff rejected',
  provider_staff_sent_back: 'Provider staff sent back',
  provider_staff_suspended: 'Provider staff suspended',
  provider_suspended: 'Provider suspended',
  provider_tier_changed: 'Provider tier changed',
  recurring_booking_cancelled: 'Recurring booking cancelled',
  reconciliation_alert_acknowledged: 'Reconciliation alert acknowledged',
  reconciliation_run: 'Reconciliation snapshot created',
  refund_issued: 'Refund issued',
  review_response_updated: 'Provider review response updated',
  review_visibility_changed: 'Provider review visibility changed',
  service_addon_created: 'Service add-on created',
  service_addon_deleted: 'Service add-on deactivated',
  service_addon_updated: 'Service add-on updated',
  service_area_created: 'Service area created',
  service_area_deleted: 'Service area deleted',
  service_area_updated: 'Service area updated',
  service_category_created: 'Service category created',
  service_category_updated: 'Service category updated',
  service_subcategory_created: 'Customer service created',
  service_subcategory_deleted: 'Customer service deactivated',
  service_subcategory_updated: 'Customer service updated',
  staff_added: 'Staff member added',
  staff_removed: 'Staff member removed',
  staff_role_changed: 'Staff role changed',
  staff_role_demoted_from_dpo: 'DPO access removed',
  staff_role_promoted_dpo: 'DPO access granted',
  support_ticket_status_updated: 'Support case status updated',
  support_ticket_status_resumed_by_reply: 'Support case resumed by participant reply',
  support_ticket_priority_updated: 'Support case priority updated',
  user_profile_updated: 'Profile name updated',
  vat_report_finalized: 'VAT workpaper locked',
  vat_report_generated: 'VAT workpaper generated',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  super_admin: 'bg-red-100 text-red-700',
  dpo: 'bg-indigo-100 text-indigo-700',
  customer: 'bg-blue-100 text-blue-700',
  provider: 'bg-green-100 text-green-700',
  provider_staff: 'bg-emerald-100 text-emerald-700',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  });
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseSource(value: string | null): SourceFilter {
  return value === 'audit_log' || value === 'admin_actions' ? value : 'all';
}

function humanizeSlug(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return /^[a-z][a-z0-9_]*$/.test(action) ? humanizeSlug(action) : action;
}

function shortId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

function linkedBusinessAccountId(entry: AuditEntry): string | null {
  for (const values of [entry.newValues, entry.oldValues]) {
    const accountId = values?.businessAccountId;
    if (typeof accountId === 'string' && UUID_REGEX.test(accountId)) return accountId;
  }
  return null;
}

function linkedProviderId(entry: AuditEntry): string | null {
  if (entry.targetProviderId && UUID_REGEX.test(entry.targetProviderId)) {
    return entry.targetProviderId;
  }
  for (const values of [entry.newValues, entry.oldValues]) {
    const providerId = values?.providerId;
    if (typeof providerId === 'string' && UUID_REGEX.test(providerId)) return providerId;
  }
  return null;
}

function linkedBookingId(entry: AuditEntry): string | null {
  if (entry.targetBookingId && UUID_REGEX.test(entry.targetBookingId)) {
    return entry.targetBookingId;
  }
  for (const values of [entry.newValues, entry.oldValues]) {
    const bookingId = values?.bookingId;
    if (typeof bookingId === 'string' && UUID_REGEX.test(bookingId)) return bookingId;
  }
  return null;
}

function linkedTaxNumber(
  entry: AuditEntry,
  canonical: number | null | undefined,
  detailKey: 'taxYear' | 'taxQuarter' | 'periodYear' | 'periodMonth',
): number | null {
  if (Number.isInteger(canonical)) return canonical ?? null;
  for (const values of [entry.newValues, entry.oldValues]) {
    const value = values?.[detailKey];
    if (typeof value === 'number' && Number.isInteger(value)) return value;
  }
  return null;
}

function linkedCatalogId(
  entry: AuditEntry,
  canonical: string | null | undefined,
  detailKey: 'categoryId' | 'subcategoryId',
): string | null {
  if (canonical && UUID_REGEX.test(canonical)) return canonical;
  for (const values of [entry.newValues, entry.oldValues]) {
    const value = values?.[detailKey];
    if (typeof value === 'string' && UUID_REGEX.test(value)) return value;
  }
  return null;
}

function linkedCommunicationId(
  entry: AuditEntry,
  canonical: string | null | undefined,
  detailKey: 'conversationId' | 'messageId',
): string | null {
  if (canonical && UUID_REGEX.test(canonical)) return canonical;
  for (const values of [entry.newValues, entry.oldValues]) {
    const value = values?.[detailKey];
    if (typeof value === 'string' && UUID_REGEX.test(value)) return value;
  }
  return null;
}

function marketingConfigRecord(entry: AuditEntry): 'promo_code' | 'campaign' | null {
  for (const values of [entry.newValues, entry.oldValues]) {
    const kind = values?.kind;
    if (typeof kind !== 'string') continue;
    if (kind.startsWith('promo_')) return 'promo_code';
    if (kind.startsWith('campaign_')) return 'campaign';
  }
  return null;
}

function notificationTemplateOperation(entry: AuditEntry): string | null {
  for (const values of [entry.newValues, entry.oldValues]) {
    const operation = values?.op;
    if (typeof operation === 'string') return operation;
  }
  return null;
}

function searchedConsentUserId(entry: AuditEntry): string | null {
  if (entry.action !== 'consent_search') return null;
  for (const values of [entry.newValues, entry.oldValues]) {
    const filters = values?.filters;
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) continue;
    const userId = (filters as Record<string, unknown>).userId;
    if (typeof userId === 'string' && UUID_REGEX.test(userId)) return userId;
  }
  return null;
}

function targetAccountRole(entry: AuditEntry): string | null {
  if (entry.entityType !== 'user' && entry.entityType !== 'users') return null;
  if (entry.targetUserRole) return entry.targetUserRole;

  for (const values of [entry.newValues, entry.oldValues]) {
    const accountType = values?.accountType;
    if (typeof accountType === 'string') return accountType;
  }

  // Legacy self-authored system events used `users` and exposed only the
  // actor role. It is target evidence only when actor and target are the same
  // account; never use an unrelated operator's role to classify the target.
  if (entry.entityType === 'users' && entry.entityId === entry.userId) {
    return entry.userRole;
  }
  return null;
}

function entityDestination(entry: AuditEntry): { to: string; label: string } | null {
  if (entry.action === 'consent_search') {
    const searchedUserId = searchedConsentUserId(entry);
    return searchedUserId
      ? {
          to: `/privacy?consentUserId=${encodeURIComponent(searchedUserId)}`,
          label: 'Open exact consent evidence lookup',
        }
      : { to: '/privacy', label: 'Open consent evidence lookup' };
  }
  if (
    entry.action === 'conversation_viewed'
    || entry.action === 'message_redacted'
    || entry.action === 'message_flag_reviewed'
    || entry.action === 'admin_message_sent'
  ) {
    const conversationId = linkedCommunicationId(
      entry,
      entry.targetConversationId,
      'conversationId',
    );
    const messageId = linkedCommunicationId(entry, entry.targetMessageId, 'messageId');
    if (conversationId) {
      const params = new URLSearchParams({ conversationId });
      if (entry.entityType === 'booking' && entry.entityId && UUID_REGEX.test(entry.entityId)) {
        params.set('bookingId', entry.entityId);
      }
      if (messageId) params.set('messageId', messageId);
      return {
        to: `/communications?${params.toString()}`,
        label: messageId ? 'Open exact conversation message' : 'Open exact conversation',
      };
    }
  }
  if (!entry.entityId) return null;
  const id = encodeURIComponent(entry.entityId);
  switch (entry.entityType) {
    case 'booking':
      return { to: `/bookings/${id}`, label: 'Open Booking 360' };
    case 'official_receipt': {
      const bookingId = linkedBookingId(entry);
      return bookingId
        ? {
            to: `/bookings/${encodeURIComponent(bookingId)}`,
            label: 'Open Booking 360 receipt evidence',
          }
        : null;
    }
    case 'bir_2307_batch': {
      const year = linkedTaxNumber(entry, entry.targetTaxYear, 'taxYear');
      const quarter = linkedTaxNumber(entry, entry.targetTaxQuarter, 'taxQuarter');
      if (!UUID_REGEX.test(entry.entityId) || year === null || quarter === null) return null;
      const params = new URLSearchParams({
        tab: 'bir',
        taxYear: String(year),
        taxQuarter: String(quarter),
        batchId: entry.entityId,
      });
      return {
        to: `/financials?${params.toString()}`,
        label: 'Open exact 2307 workpaper evidence',
      };
    }
    case 'vat_report': {
      const year = linkedTaxNumber(entry, entry.targetTaxYear, 'periodYear');
      const month = linkedTaxNumber(entry, entry.targetTaxMonth, 'periodMonth');
      if (!UUID_REGEX.test(entry.entityId) || year === null || month === null) return null;
      const params = new URLSearchParams({
        tab: 'bir',
        taxYear: String(year),
        vatMonth: String(month),
        vatReportId: entry.entityId,
      });
      return {
        to: `/financials?${params.toString()}`,
        label: 'Open exact VAT workpaper evidence',
      };
    }
    case 'service_category':
      return UUID_REGEX.test(entry.entityId)
        ? {
            to: `/catalog?categoryId=${id}`,
            label: 'Open exact service category',
          }
        : null;
    case 'service_subcategory': {
      const categoryId = linkedCatalogId(entry, entry.targetCategoryId, 'categoryId');
      if (!UUID_REGEX.test(entry.entityId) || !categoryId) return null;
      const params = new URLSearchParams({ categoryId, subcategoryId: entry.entityId });
      return { to: `/catalog?${params.toString()}`, label: 'Open exact customer service' };
    }
    case 'service_addon': {
      const categoryId = linkedCatalogId(entry, entry.targetCategoryId, 'categoryId');
      const subcategoryId = linkedCatalogId(
        entry,
        entry.targetSubcategoryId,
        'subcategoryId',
      );
      if (!UUID_REGEX.test(entry.entityId) || !categoryId || !subcategoryId) return null;
      const params = new URLSearchParams({
        categoryId,
        subcategoryId,
        addonId: entry.entityId,
      });
      return { to: `/catalog?${params.toString()}`, label: 'Open exact service add-on' };
    }
    case 'recurring_booking':
      return UUID_REGEX.test(entry.entityId)
        ? { to: `/recurring?seriesId=${id}`, label: 'Open exact recurring series' }
        : null;
    case 'customer':
      return { to: `/customers/${id}`, label: 'Open Customer 360' };
    case 'provider':
      return { to: `/providers/${id}`, label: 'Open Provider 360' };
    case 'provider_application':
    case 'provider_document': {
      const providerId = linkedProviderId(entry);
      return providerId
        ? { to: `/providers/${encodeURIComponent(providerId)}`, label: 'Open Provider 360' }
        : null;
    }
    case 'provider_certification': {
      const providerId = linkedProviderId(entry);
      return providerId
        ? {
            to: `/providers/${encodeURIComponent(providerId)}?tab=certifications`,
            label: 'Open provider certifications',
          }
        : null;
    }
    case 'provider_note': {
      const providerId = linkedProviderId(entry);
      return providerId
        ? {
            to: `/providers/${encodeURIComponent(providerId)}?tab=notes`,
            label: 'Open provider support notes',
          }
        : null;
    }
    case 'provider_staff': {
      const providerId = linkedProviderId(entry);
      return providerId
        ? {
            to: `/providers/${encodeURIComponent(providerId)}?tab=staff`,
            label: 'Open provider staff',
          }
        : null;
    }
    case 'review': {
      const providerId = linkedProviderId(entry);
      return providerId
        ? {
            to: `/providers/${encodeURIComponent(providerId)}?tab=reviews`,
            label: 'Open provider reviews',
          }
        : null;
    }
    case 'user':
    case 'users': {
      const targetRole = targetAccountRole(entry);
      if (targetRole === 'customer') {
        return { to: `/customers/${id}`, label: 'Open Customer 360' };
      }
      if (targetRole === 'provider') {
        if (entry.targetProviderId && UUID_REGEX.test(entry.targetProviderId)) {
          return {
            to: `/providers/${encodeURIComponent(entry.targetProviderId)}`,
            label: 'Open Provider 360',
          };
        }
        return { to: `/providers?search=${id}`, label: 'Find Provider 360' };
      }
      if (targetRole === 'provider_staff') {
        return {
          to: `/support-tickets?userId=${id}&userRole=provider_staff`,
          label: 'Open provider staff support history',
        };
      }
      if (targetRole === 'admin' || targetRole === 'super_admin' || targetRole === 'dpo') {
        return { to: `/staff?search=${id}`, label: 'Find exact staff account' };
      }
      return { to: `/support-tickets?userId=${id}`, label: 'Open participant support history' };
    }
    case 'dispute':
      return { to: `/disputes/${id}`, label: 'Open Dispute 360' };
    case 'feedback_submission':
      return UUID_REGEX.test(entry.entityId)
        ? { to: `/feedback?feedbackId=${id}`, label: 'Open exact tester feedback' }
        : null;
    case 'payout':
      return { to: `/payouts?payoutId=${id}`, label: 'Open exact payout' };
    case 'reconciliation':
      return UUID_REGEX.test(entry.entityId)
        ? {
            to: `/financials?tab=reconciliation&snapshotId=${id}`,
            label: 'Open exact reconciliation snapshot',
          }
        : null;
    case 'support_ticket':
      return { to: `/support-tickets?ticketId=${id}`, label: 'Open support case' };
    case 'dsr_request':
    case 'data_subject_request':
      return UUID_REGEX.test(entry.entityId)
        ? {
            to: `/data-protection-log?dsrId=${id}`,
            label: 'Open exact privacy case',
          }
        : null;
    case 'consent_version':
      return UUID_REGEX.test(entry.entityId)
        ? {
            to: `/consent-versions?tab=history&publicationId=${id}`,
            label: 'Open exact consent publication',
          }
        : null;
    case 'business':
    case 'business_account':
      return { to: `/business-accounts/${id}`, label: 'Open business account' };
    case 'business_contract': {
      const accountId = linkedBusinessAccountId(entry);
      return accountId
        ? {
            to: `/business-accounts/${encodeURIComponent(accountId)}?tab=contracts&contractId=${id}`,
            label: 'Open exact business contract evidence',
          }
        : null;
    }
    case 'business_invoice': {
      const accountId = linkedBusinessAccountId(entry);
      return accountId
        ? {
            to: `/business-accounts/${encodeURIComponent(accountId)}?tab=invoices&invoiceId=${encodeURIComponent(id)}`,
            label: 'Open exact business statement evidence',
          }
        : null;
    }
    case 'service_area':
      return UUID_REGEX.test(entry.entityId)
        ? { to: `/service-areas?areaId=${id}`, label: 'Open exact service area' }
        : null;
    case 'service_area_change_request':
      return UUID_REGEX.test(entry.entityId)
        ? {
            to: `/service-areas?changeRequestId=${id}`,
            label: 'Open exact provider area-change decision',
          }
        : null;
    case 'pricing_rule':
      return UUID_REGEX.test(entry.entityId)
        ? { to: `/pricing-rules?ruleId=${id}`, label: 'Open exact pricing rule' }
        : null;
    case 'promotion':
      return UUID_REGEX.test(entry.entityId)
        ? { to: `/marketing?tab=banners&promotionId=${id}`, label: 'Open exact home banner' }
        : null;
    case 'notification_template':
      return notificationTemplateOperation(entry) !== 'delete' && UUID_REGEX.test(entry.entityId)
        ? {
            to: `/notification-templates?templateId=${id}`,
            label: 'Open current notification template record',
          }
        : null;
    case 'admin_staff':
      return { to: `/staff?search=${id}`, label: 'Find exact staff directory profile' };
    case 'admin_role':
      return UUID_REGEX.test(entry.entityId)
        ? {
            to: `/staff?tab=roles&roleProfileId=${id}`,
            label: 'Open exact role profile',
          }
        : null;
    case 'config': {
      const marketingRecord = marketingConfigRecord(entry);
      if (marketingRecord === 'promo_code') {
        return UUID_REGEX.test(entry.entityId)
          ? { to: `/marketing?tab=promos&promoCodeId=${id}`, label: 'Open exact promo code' }
          : null;
      }
      if (marketingRecord === 'campaign') {
        return UUID_REGEX.test(entry.entityId)
          ? { to: `/marketing?tab=campaigns&campaignId=${id}`, label: 'Open exact campaign' }
          : null;
      }
      return { to: '/settings', label: 'Open System Settings' };
    }
    case 'system':
      return { to: '/settings', label: 'Open System Settings' };
    default:
      return null;
  }
}

function entityLabel(entry: AuditEntry): string {
  if (entry.action === 'consent_search') return 'Consent evidence lookup';
  if (entry.entityType === 'admin_staff') return 'Staff directory profile';
  if (entry.entityType === 'dsr_request' || entry.entityType === 'data_subject_request') {
    return 'Data subject request';
  }
  if (entry.entityType === 'consent_version') return 'Consent publication';
  if (entry.entityType === 'promotion') return 'Home banner';
  if (
    entry.entityType === 'notification_template'
    && notificationTemplateOperation(entry) === 'delete'
  ) return 'Deleted notification template';
  if (entry.entityType === 'config') {
    const marketingRecord = marketingConfigRecord(entry);
    if (marketingRecord === 'promo_code') return 'Promo code';
    if (marketingRecord === 'campaign') return 'Marketing campaign';
  }
  if (entry.entityType !== 'user' && entry.entityType !== 'users') return humanizeSlug(entry.entityType);
  const targetRole = targetAccountRole(entry);
  if (targetRole === 'customer') return 'Customer account';
  if (targetRole === 'provider') return 'Provider account';
  if (targetRole === 'provider_staff') return 'Provider staff account';
  if (targetRole === 'admin' || targetRole === 'super_admin' || targetRole === 'dpo') {
    return 'Staff account';
  }
  return 'User account';
}

function exactEntityTimeline(entry: AuditEntry): string | null {
  if (!entry.entityId || !UUID_REGEX.test(entry.entityId)) return null;
  const params = new URLSearchParams({ entityType: entry.entityType, entityId: entry.entityId });
  return `/audit-log?${params.toString()}`;
}

function SourceBadge({ entry }: { entry: AuditEntry }): React.ReactElement {
  const source = entry.source ?? 'audit_log';
  const badge = SOURCE_BADGE[source];
  return (
    <span className={`inline-flex rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function EntityLink({ entry }: { entry: AuditEntry }): React.ReactElement {
  const destination = entityDestination(entry);
  if (!destination) {
    return (
      <span className="text-[var(--color-text-secondary)]">
        {entityLabel(entry)}{entry.entityId ? ` · ${shortId(entry.entityId)}` : ''}
      </span>
    );
  }
  return (
    <Link
      to={destination.to}
      className="inline-flex min-h-11 items-center gap-1 font-medium text-[var(--color-secondary)] hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {entityLabel(entry)} · {shortId(entry.entityId!)}
      <ExternalLink size={14} aria-hidden="true" />
      <span className="sr-only">{destination.label}</span>
    </Link>
  );
}

export default function AuditLogPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const actionFilter = searchParams.get('action')?.trim() ?? '';
  const entityTypeFilter = searchParams.get('entityType')?.trim() ?? '';
  const entityIdFilter = searchParams.get('entityId')?.trim() ?? '';
  const userIdFilter = searchParams.get('userId')?.trim() ?? '';
  const sourceFilter = parseSource(searchParams.get('source'));
  const fromDate = searchParams.get('from') ?? '';
  const toDate = searchParams.get('to') ?? '';

  const [draftAction, setDraftAction] = useState(actionFilter);
  const [draftEntityType, setDraftEntityType] = useState(entityTypeFilter);
  const [draftEntityId, setDraftEntityId] = useState(entityIdFilter);
  const [draftUserId, setDraftUserId] = useState(userIdFilter);
  const [draftSource, setDraftSource] = useState<SourceFilter>(sourceFilter);
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const pageSize = adminConfig.defaultPageSize;

  useEffect(() => {
    setDraftAction(actionFilter);
    setDraftEntityType(entityTypeFilter);
    setDraftEntityId(entityIdFilter);
    setDraftUserId(userIdFilter);
    setDraftSource(sourceFilter);
    setDraftFrom(fromDate);
    setDraftTo(toDate);
  }, [actionFilter, entityIdFilter, entityTypeFilter, fromDate, sourceFilter, toDate, userIdFilter]);

  const dateError = fromDate && toDate && fromDate > toDate
    ? 'From date must be before or equal to To date.'
    : '';
  const entityIdError = entityIdFilter && !UUID_REGEX.test(entityIdFilter)
    ? 'Record ID must be a complete UUID.'
    : '';
  const userIdError = userIdFilter && !UUID_REGEX.test(userIdFilter)
    ? 'Actor ID must be a complete UUID.'
    : '';
  const filterError = dateError || entityIdError || userIdError;
  const hasFilters = Boolean(
    actionFilter || entityTypeFilter || entityIdFilter || userIdFilter
    || sourceFilter !== 'all' || fromDate || toDate,
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'admin', 'audit-log', page, actionFilter, entityTypeFilter, entityIdFilter,
      userIdFilter, sourceFilter, fromDate, toDate,
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      if (actionFilter) params.action = actionFilter;
      if (entityTypeFilter) params.entityType = entityTypeFilter;
      if (entityIdFilter) params.entityId = entityIdFilter;
      if (userIdFilter) params.userId = userIdFilter;
      if (sourceFilter !== 'all') params.source = sourceFilter;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const response = await api.get<AuditResponse>('/api/v1/admin/audit-log', { params });
      return response.data;
    },
    placeholderData: (previous) => previous,
    enabled: !filterError,
  });

  const entries = data?.data ?? [];
  const pagination = data?.pagination;

  function applyFilters(event: React.FormEvent): void {
    event.preventDefault();
    const params = new URLSearchParams();
    if (draftAction.trim()) params.set('action', draftAction.trim());
    if (draftEntityType.trim()) params.set('entityType', draftEntityType.trim().toLowerCase());
    if (draftEntityId.trim()) params.set('entityId', draftEntityId.trim());
    if (draftUserId.trim()) params.set('userId', draftUserId.trim());
    if (draftSource !== 'all') params.set('source', draftSource);
    if (draftFrom) params.set('from', draftFrom);
    if (draftTo) params.set('to', draftTo);
    setSearchParams(params);
    setSelectedEntry(null);
    setExportError('');
    setExportNotice('');
  }

  function clearFilters(): void {
    setSearchParams(new URLSearchParams());
    setSelectedEntry(null);
    setExportError('');
    setExportNotice('');
  }

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
      return params;
    });
    setSelectedEntry(null);
  }

  async function exportCsv(): Promise<void> {
    setExporting(true);
    setExportError('');
    setExportNotice('');
    try {
      const params: Record<string, string | number> = { limit: 10_000 };
      if (actionFilter) params.action = actionFilter;
      if (entityTypeFilter) params.entityType = entityTypeFilter;
      if (entityIdFilter) params.entityId = entityIdFilter;
      if (userIdFilter) params.userId = userIdFilter;
      if (sourceFilter !== 'all') params.source = sourceFilter;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const response = await api.get<Blob>('/api/v1/admin/compliance/audit-log/export.csv', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `audit-log-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setExportNotice('Masked CSV downloaded. The export itself was recorded in the audit timeline.');
    } catch (exportFailure) {
      setExportError(getErrorMessage(exportFailure));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-secondary)]">
            Governance · operator accountability
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-text)]">Audit Log</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-secondary)]">
            Reconstruct recorded admin decisions and selected system events, then open the customer,
            provider, booking, support, dispute, payout, reconciliation, or company record that owns the event.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          {pagination && (
            <span className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-secondary)]">
              {pagination.total.toLocaleString()} matching records
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void exportCsv()}
            disabled={exporting || Boolean(filterError)}
          >
            <Download size={16} aria-hidden="true" />
            {exporting ? 'Preparing CSV…' : 'Export filtered CSV'}
          </Button>
        </div>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong>Coverage boundary:</strong> this timeline combines privileged admin actions and explicitly
        recorded system events. It is not a complete HTTP request trace while E37 remains open. CSV exports
        use the same two sources and filters, mask contact/network/free-text PII, cap at 10,000 rows, and are audited.
      </div>

      <Card className="p-4 md:p-5">
        <form onSubmit={applyFilters} className="space-y-4" aria-label="Audit timeline filters">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-[var(--color-secondary)]" aria-hidden="true" />
            <h2 className="font-semibold text-[var(--color-text)]">Find one incident or record trail</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-xs font-medium text-[var(--color-text-secondary)]">
              Action contains
              <Input
                value={draftAction}
                onChange={(event) => setDraftAction(event.target.value)}
                placeholder="provider_approved or POST"
                maxLength={100}
                aria-label="Filter audit log by action"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[var(--color-text-secondary)]">
              Record type
              <Input
                value={draftEntityType}
                onChange={(event) => setDraftEntityType(event.target.value)}
                placeholder="booking, customer, provider"
                maxLength={50}
                aria-label="Filter audit log by entity type"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[var(--color-text-secondary)]">
              Exact record ID
              <Input
                value={draftEntityId}
                onChange={(event) => setDraftEntityId(event.target.value)}
                placeholder="Full UUID"
                maxLength={36}
                aria-label="Filter audit log by entity ID"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[var(--color-text-secondary)]">
              Exact actor ID
              <Input
                value={draftUserId}
                onChange={(event) => setDraftUserId(event.target.value)}
                placeholder="Full UUID"
                maxLength={36}
                aria-label="Filter audit log by actor ID"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[var(--color-text-secondary)]">
              Source
              <select
                value={draftSource}
                onChange={(event) => setDraftSource(event.target.value as SourceFilter)}
                aria-label="Filter audit log by source stream"
                className="min-h-11 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              >
                <option value="all">Both recorded sources</option>
                <option value="admin_actions">Admin decisions</option>
                <option value="audit_log">Selected system events</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-[var(--color-text-secondary)]">
              From · Manila date
              <Input
                type="date"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
                aria-label="Filter audit log from date"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[var(--color-text-secondary)]">
              To · Manila date
              <Input
                type="date"
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
                aria-label="Filter audit log to date"
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1">Apply filters</Button>
              {hasFilters && (
                <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
              )}
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Filters apply only when submitted, preventing a new server query for every typed character.
            Record and actor IDs must be complete UUIDs.
          </p>
        </form>
      </Card>

      {filterError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{filterError}</p>}
      {exportError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Export failed: {exportError}</p>}
      {exportNotice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{exportNotice}</p>}

      {isLoading && !data ? (
        <LoadingState label="Loading recorded events…" />
      ) : isError ? (
        <ErrorState title="Failed to load audit timeline" description={getErrorMessage(error)} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No matching recorded events"
          description={hasFilters
            ? 'No event matches the submitted filters. Clear or broaden one filter.'
            : 'No admin decision or selected system event has been recorded yet.'}
          icon={<ClipboardList size={30} className="text-slate-400" />}
          action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
        />
      ) : (
        <>
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">Manila time</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">Actor</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">Recorded action</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">Source record</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">Network</th>
                  <th className="w-12 px-4 py-3"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const expanded = selectedEntry?.id === entry.id;
                  return (
                    <tr
                      key={`${entry.source ?? 'audit_log'}-${entry.id}`}
                      tabIndex={0}
                      aria-expanded={expanded}
                      className="cursor-pointer border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg)]"
                      onClick={() => setSelectedEntry(expanded ? null : entry)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedEntry(expanded ? null : entry);
                        }
                      }}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--color-text)]">{formatDate(entry.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[var(--color-text)]">{entry.userEmail || 'System'}</span>
                          {entry.userRole && (
                            <span className={`rounded px-2 py-1 text-xs font-medium ${ROLE_COLORS[entry.userRole] ?? 'bg-gray-100 text-gray-600'}`}>
                              {humanizeSlug(entry.userRole)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-2">
                          <SourceBadge entry={entry} />
                          <span className="font-medium text-[var(--color-text)]">{actionLabel(entry.action)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><EntityLink entry={entry} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">{entry.ipAddress || 'Not recorded'}</td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-3 lg:hidden">
            {entries.map((entry) => {
              const expanded = selectedEntry?.id === entry.id;
              return (
                <button
                  key={`${entry.source ?? 'audit_log'}-${entry.id}`}
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setSelectedEntry(expanded ? null : entry)}
                  className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <SourceBadge entry={entry} />
                      <p className="font-semibold text-[var(--color-text)]">{actionLabel(entry.action)}</p>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {entityLabel(entry)}{entry.entityId ? ` · ${shortId(entry.entityId)}` : ''}
                      </p>
                    </div>
                    {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-secondary)]">
                    <span>{entry.userEmail || 'System'}</span>
                    <span>{formatDate(entry.createdAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedEntry && <EntryDetails entry={selectedEntry} />}

          {pagination && pagination.totalPages > 1 && (
            <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Audit timeline pages">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button type="button" variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function EntryDetails({ entry }: { entry: AuditEntry }): React.ReactElement {
  const destination = entityDestination(entry);
  const exactTimeline = exactEntityTimeline(entry);
  const outlineLink = buttonVariants({ variant: 'outline' });
  return (
    <Card className="p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-secondary)]">Selected event</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--color-text)]">{actionLabel(entry.action)}</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{formatDate(entry.createdAt)} · Manila time</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {destination && (
            <Link to={destination.to} className={outlineLink}>
              {destination.label} <ExternalLink size={15} aria-hidden="true" />
            </Link>
          )}
          {exactTimeline && (
            <Link to={exactTimeline} className={outlineLink}>Only this record</Link>
          )}
          {entry.userId && UUID_REGEX.test(entry.userId) && (
            <Link to={`/audit-log?userId=${encodeURIComponent(entry.userId)}`} className={outlineLink}>
              Only this actor
            </Link>
          )}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
        <DetailField label="Entry ID" value={entry.id} mono />
        <DetailField label="Actor ID" value={entry.userId || 'System'} mono={Boolean(entry.userId)} />
        <DetailField label="Full action" value={entry.action} mono />
        <DetailField label="Source" value={SOURCE_BADGE[entry.source ?? 'audit_log'].label} />
        <DetailField label="Record type" value={entityLabel(entry)} />
        <DetailField label="Record ID" value={entry.entityId || 'Not recorded'} mono={Boolean(entry.entityId)} />
        <DetailField label="Masked network" value={entry.ipAddress || 'Not recorded'} mono />
        <DetailField label="Client" value={entry.userAgent || 'Not recorded'} />
      </dl>

      {entry.reason && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Recorded reason</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{entry.reason}</p>
        </div>
      )}

      {(entry.oldValues || entry.newValues) && (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {entry.oldValues && <JsonPanel label="Before" value={entry.oldValues} />}
          {entry.newValues && <JsonPanel label="After / details" value={entry.newValues} />}
        </div>
      )}
    </Card>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</dt>
      <dd className={`mt-1 break-all text-[var(--color-text)] ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function JsonPanel({ label, value }: { label: string; value: Record<string, unknown> }): React.ReactElement {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</p>
      <pre className="mt-1 max-h-72 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-xs text-[var(--color-text)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
