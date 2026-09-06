import type { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Called ONLY inside initial submission, after owner/catalog locks and the
 * canonical provider + market/category inserts, before consuming the draft.
 * Capture persisted values rather than reconstructing evidence from a later
 * profile or filling absent optional answers with defaults. No legacy caller,
 * approval authority, document URL generation, or generic audit payload.
 */
export async function captureInitialApplicationRevision(
  client: TransactionClient, providerId: string, userId: string,
): Promise<void> {
  try {
    const result = await client.query(
      `INSERT INTO provider_application_revisions (
         provider_id, submitted_by, revision_number, business_name,
         service_radius_km, latitude, longitude, city, province,
         service_area_id, service_area_name, category_ids, category_names,
         government_id_front_key, government_id_back_key, nbi_clearance_key, selfie_key,
         nbi_expiry_date, government_id_number, years_experience, vetting_answers,
         agreement_accepted_at, submitted_at
       )
       SELECT p.id, p.user_id, 1, p.business_name,
              p.service_radius_km, p.latitude, p.longitude, p.city, p.province,
              a.id, a.name, categories.ids, categories.names,
              p.government_id_front_url, p.government_id_back_url, p.nbi_clearance_url, p.selfie_url,
              p.nbi_expiry_date, p.government_id_number, p.years_experience, p.vetting_answers,
              p.ic_agreement_accepted_at, p.applied_at
         FROM providers p
         JOIN provider_service_areas pa ON pa.provider_id=p.id AND pa.is_primary=TRUE
         JOIN service_areas a ON a.id=pa.service_area_id
         CROSS JOIN LATERAL (
           SELECT array_agg(c.id ORDER BY c.id) AS ids, array_agg(c.name ORDER BY c.id) AS names
           FROM (
             SELECT DISTINCT sc.id, sc.name FROM provider_services ps
             JOIN service_categories sc ON sc.id=ps.category_id
             WHERE ps.provider_id=p.id AND ps.is_active=TRUE
           ) c
         ) categories
        WHERE p.id=$1 AND p.user_id=$2 AND p.status='pending'`,
      [providerId, userId],
    );
    if (result.rowCount !== 1) {
      throw createAppError('Application evidence could not be recorded. Your application was not submitted.', 503);
    }
  } catch (error) {
    // No fallback or ON CONFLICT success. Losing a snapshot must roll back the
    // provider and leave the saved draft intact. Do not expose SQL/PII details.
    if (typeof error === 'object' && error !== null && 'code' in error
      && ['42P01', '42703'].includes(String(error.code))) {
      const unavailable = createAppError(
        'Provider applications are temporarily unavailable. Your application was not submitted. Please try again later.', 503,
      );
      unavailable.code = 'provider_application_schema_unavailable';
      throw unavailable;
    }
    throw error;
  }
}
