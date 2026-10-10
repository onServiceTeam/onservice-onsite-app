import { base, index, providerId, revision, revisionId } from './provider-submission-fixture';
export { base, providerId, revisionId };
export const decisionIndex = { ...index, currentStatus: 'pending' };
export const decisionDetail = { providerId, currentStatus: 'pending', revision, decisionContractVersion: 1, decision: null };
export function decisionResponse(path: string, selectedProviderId = providerId, selectedRevisionId = revisionId) {
  const selectedBase = `/api/v1/admin/providers/${selectedProviderId}/application-revisions`;
  if (path === `${selectedBase}?limit=20`) return { data: { success: true, data: { ...decisionIndex,
    providerId: selectedProviderId, revisions: [{ ...decisionIndex.revisions[0]!, id: selectedRevisionId }] } } };
  if (path === `${selectedBase}/${selectedRevisionId}`) return { data: { success: true, data: { ...decisionDetail,
    providerId: selectedProviderId, revision: { ...revision, id: selectedRevisionId,
      documents: Object.fromEntries(Object.keys(revision.documents).map(key => [key, `${selectedBase}/${selectedRevisionId}/kyc/${key}`])) } } } };
  throw new Error(`Unexpected synthetic evidence request: ${path}`);
}
