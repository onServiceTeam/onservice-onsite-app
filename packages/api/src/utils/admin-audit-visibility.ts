/**
 * D34 privacy segregation for the general Admin Audit Log.
 *
 * The general timeline is available to operations admins and super admins,
 * while privacy records belong to the DPO/super-admin workspace. Keep this
 * predicate shared by the paginated list and both CSV export paths so an
 * ordinary admin cannot recover a hidden privacy record through export or an
 * exact filter. Unknown/missing roles receive the least-privileged view.
 */
export function generalAuditVisibilityClause(
  viewerRole: string | null | undefined,
): string | null {
  if (viewerRole === 'super_admin') return null;

  return `NOT (
    combined.entity_type IN ('dsr_request', 'data_subject_request', 'consent_version', 'breach')
    OR LEFT(combined.action, 4) IN ('dsr.', 'dsr_')
    OR LEFT(combined.action, 7) = 'breach_'
    OR combined.action IN ('consent_search', 'consent_version_published')
  )`;
}
