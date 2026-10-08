import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import type { VettingAnswers } from './provider-admin.service';
import { isKycDocType, type KycDocType } from './kyc-document.service';
import * as uploads from './upload.service';

/** Read-only E35/E74 projection. Current status is operational context, never
 * evidence of which revision was approved. No mutable-profile fallback, role
 * grant, decision, resubmission, historical reconstruction or presigned URL.
 */
function requireReviewer(role: string): void {
  if (role !== 'admin' && role !== 'super_admin') throw createAppError('Admin access required.', 403);
}

async function readEvidence<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error
      && ['42P01', '42703'].includes(String(error.code))) {
      const unavailable = createAppError('Submitted application evidence is temporarily unavailable. Please try again later.', 503);
      unavailable.code = 'provider_application_schema_unavailable';
      throw unavailable;
    }
    throw error;
  }
}

interface RevisionSummaryRow {
  current_status: string;
  has_evidence: boolean;
  id: string | null;
  revision_number: number;
  submitted_at: Date;
}

export async function listApplicationRevisions(input: {
  providerId: string; requesterRole: string; limit?: number; beforeRevision?: number;
}): Promise<{
  providerId: string;
  currentStatus: string;
  historyState: 'recorded' | 'not_recorded';
  revisions: Array<{ id: string; revisionNumber: number; submittedAt: string }>;
  nextBeforeRevision: number | null;
  decisionContractVersion: 1;
}> {
  requireReviewer(input.requesterRole);
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw createAppError('limit must be between 1 and 100.', 400);
  }
  if (input.beforeRevision !== undefined && (!Number.isInteger(input.beforeRevision)
    || input.beforeRevision < 1 || input.beforeRevision > 2_147_483_647)) {
    throw createAppError('beforeRevision must be a positive revision number.', 400);
  }
  return readEvidence(async () => {
    // One statement keeps status, presence and page on one database snapshot.
    // The (provider_id, revision_number) unique index supports both reads.
    const result = await db.query<RevisionSummaryRow>(
      `SELECT p.status AS current_status,
              EXISTS (SELECT 1 FROM provider_application_revisions e WHERE e.provider_id=p.id) AS has_evidence,
              r.id, r.revision_number, r.submitted_at
         FROM providers p
         LEFT JOIN LATERAL (
           SELECT id, revision_number, submitted_at FROM provider_application_revisions
            WHERE provider_id=p.id AND ($2::integer IS NULL OR revision_number < $2)
            ORDER BY revision_number DESC LIMIT $3
         ) r ON TRUE
        WHERE p.id=$1 ORDER BY r.revision_number DESC`,
      [input.providerId, input.beforeRevision ?? null, limit + 1],
    );
    const context = result.rows[0];
    if (!context) throw createAppError('Provider not found.', 404);
    const rows = result.rows.filter(row => row.id !== null);
    const revisions = rows.slice(0, limit).map(row => ({
      id: row.id!, revisionNumber: row.revision_number, submittedAt: row.submitted_at.toISOString(),
    }));
    return {
      providerId: input.providerId,
      decisionContractVersion: 1,
      currentStatus: context.current_status,
      historyState: context.has_evidence ? 'recorded' as const : 'not_recorded' as const,
      revisions,
      nextBeforeRevision: rows.length > limit ? revisions[revisions.length - 1]!.revisionNumber : null,
    };
  });
}

interface RevisionDetailRow {
  decision_id: string | null;
  decision: 'approved' | 'rejected' | null;
  decided_by: string | null;
  decision_reason: string | null;
  checklist_summary: string | null;
  decided_at: Date | null;
  current_status: string;
  id: string;
  revision_number: number;
  previous_revision_number: number | null;
  schema_version: number;
  business_name: string;
  service_radius_km: number;
  latitude: string;
  longitude: string;
  city: string;
  province: string;
  service_area_id: string;
  service_area_name: string;
  category_ids: string[];
  category_names: string[];
  nbi_expiry_date: string | null;
  government_id_number: string | null;
  years_experience: number | null;
  vetting_answers: VettingAnswers | null;
  agreement_accepted_at: Date;
  submitted_at: Date;
  recorded_at: Date;
}

export interface ApplicationRevisionEvidence {
  id: string;
  revisionNumber: number;
  previousRevisionNumber: number | null;
  schemaVersion: number;
  businessName: string;
  serviceRadiusKm: number;
  latitude: number;
  longitude: number;
  city: string;
  province: string;
  serviceArea: { id: string; name: string };
  categories: Array<{ id: string; name: string }>;
  nbiExpiryDate: string | null;
  governmentIdNumber: string | null;
  yearsExperience: number | null;
  vettingAnswers: VettingAnswers | null;
  agreementAcceptedAt: string;
  submittedAt: string;
  recordedAt: string;
  documents: Record<KycDocType, string>;
}

export interface ApplicationRevisionDecision {
  id: string; decision: 'approved' | 'rejected'; decidedBy: string;
  reason: string; checklistSummary: string | null; decidedAt: string;
}

export async function getApplicationRevision(input: {
  providerId: string; revisionId: string; requesterRole: string;
}): Promise<{ providerId: string; currentStatus: string; revision: ApplicationRevisionEvidence;
  decisionContractVersion: 1; decision: ApplicationRevisionDecision | null }> {
  requireReviewer(input.requesterRole);
  return readEvidence(async () => {
    // Explicit historical columns: future columns and current contacts cannot
    // accidentally enter this private response. Date-only metadata stays a date.
    const result = await db.query<RevisionDetailRow>(
      `SELECT p.status AS current_status, r.id, r.revision_number, r.previous_revision_number,
              r.schema_version, r.business_name, r.service_radius_km, r.latitude, r.longitude,
              r.city, r.province, r.service_area_id, r.service_area_name, r.category_ids, r.category_names,
              r.nbi_expiry_date::text AS nbi_expiry_date, r.government_id_number, r.years_experience,
              r.vetting_answers, r.agreement_accepted_at, r.submitted_at, r.recorded_at,
              d.id AS decision_id, d.decision, d.decided_by, d.reason AS decision_reason, d.checklist_summary, d.decided_at
         FROM provider_application_revisions r JOIN providers p ON p.id=r.provider_id
         LEFT JOIN provider_application_decisions d ON d.provider_id=r.provider_id AND d.revision_id=r.id
        WHERE r.provider_id=$1 AND r.id=$2`,
      [input.providerId, input.revisionId],
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Submitted application revision not found.', 404);
    const documentBase = `/api/v1/admin/providers/${input.providerId}/application-revisions/${row.id}/kyc`;
    return {
      providerId: input.providerId,
      currentStatus: row.current_status,
      decisionContractVersion: 1,
      decision: row.decision_id === null ? null : {
        id: row.decision_id, decision: row.decision!, decidedBy: row.decided_by!,
        reason: row.decision_reason!, checklistSummary: row.checklist_summary, decidedAt: row.decided_at!.toISOString(),
      },
      revision: {
        id: row.id, revisionNumber: row.revision_number, previousRevisionNumber: row.previous_revision_number,
        schemaVersion: row.schema_version, businessName: row.business_name, serviceRadiusKm: row.service_radius_km,
        latitude: Number(row.latitude), longitude: Number(row.longitude), city: row.city, province: row.province,
        serviceArea: { id: row.service_area_id, name: row.service_area_name },
        categories: row.category_ids.map((id, index) => ({ id, name: row.category_names[index]! })),
        nbiExpiryDate: row.nbi_expiry_date, governmentIdNumber: row.government_id_number,
        yearsExperience: row.years_experience, vettingAnswers: row.vetting_answers,
        agreementAcceptedAt: row.agreement_accepted_at.toISOString(), submittedAt: row.submitted_at.toISOString(),
        recordedAt: row.recorded_at.toISOString(),
        // References are mandatory in a captured revision, but do NOT prove
        // that bytes still exist or that a reviewer verified their contents.
        documents: {
          government_id_front: `${documentBase}/government_id_front`,
          government_id_back: `${documentBase}/government_id_back`,
          nbi_clearance: `${documentBase}/nbi_clearance`,
          selfie: `${documentBase}/selfie`,
        },
      },
    };
  });
}

const DOCUMENT_COLUMNS: Record<KycDocType, string> = {
  government_id_front: 'government_id_front_key', government_id_back: 'government_id_back_key',
  nbi_clearance: 'nbi_clearance_key', selfie: 'selfie_key',
};

export async function getApplicationRevisionDocument(input: {
  providerId: string; revisionId: string; docType: KycDocType; requesterRole: string;
}): Promise<uploads.ObjectStream> {
  requireReviewer(input.requesterRole);
  if (!isKycDocType(input.docType)) throw createAppError('Invalid document type.', 400);
  return readEvidence(async () => {
    // Column interpolation is exclusively from the checked constant map.
    // Both identity parameters are mandatory. Never use the current KYC row.
    const result = await db.query<{ submitted_by: string; object_key: string }>(
      `SELECT submitted_by, ${DOCUMENT_COLUMNS[input.docType]} AS object_key
         FROM provider_application_revisions WHERE provider_id=$1 AND id=$2`,
      [input.providerId, input.revisionId],
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Submitted application revision not found.', 404);
    const key = uploads.extractObjectKey(row.object_key);
    if (!key || key !== row.object_key || key.includes('\\')
      || !key.startsWith(`onboarding/${row.submitted_by}/`)) {
      throw createAppError('Submitted application document is unavailable.', 404);
    }
    return uploads.getObjectStream(key);
  });
}
