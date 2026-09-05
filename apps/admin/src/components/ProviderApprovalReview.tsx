import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { VettingChecklist, type VettingState } from '@/components/VettingChecklist';

export const REQUIRED_APPROVAL_DOCUMENTS = [
  { key: 'governmentIdUrl', label: 'Government ID (front)' },
  { key: 'governmentIdBackUrl', label: 'Government ID (back)' },
  { key: 'selfieUrl', label: 'Selfie' },
  { key: 'nbiClearanceUrl', label: 'NBI clearance' },
] as const;

interface ApprovalEvidence {
  id: string;
  status: string;
  documents?: Partial<Record<(typeof REQUIRED_APPROVAL_DOCUMENTS)[number]['key'], string | null>> | null;
}

/** Presence is not verification. The server separately locks and rechecks approval. */
export function ProviderApprovalReview({ providerId, onChange }: {
  providerId: string;
  onChange: (state: VettingState) => void;
}): React.ReactElement {
  const query = useQuery({
    queryKey: ['admin-provider-approval-evidence', providerId],
    queryFn: async () => {
      const response = await api.get<{ success: true; data: ApprovalEvidence }>(
        `/api/v1/admin/providers/${providerId}/profile`,
      );
      if (response.data.success !== true) throw new Error('Application check did not succeed.');
      return response.data.data;
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const [review, setReview] = useState<VettingState & { fetchedAt: number }>({
    isComplete: false, rationale: '', fetchedAt: 0,
  });
  const receiveChecklist = useCallback((state: VettingState) => {
    setReview({ ...state, fetchedAt: query.dataUpdatedAt });
  }, [query.dataUpdatedAt]);
  const present = REQUIRED_APPROVAL_DOCUMENTS.map((document) => {
    const value = query.data?.documents?.[document.key];
    return typeof value === 'string' && value.trim().length > 0;
  });
  const loading = query.isPending || query.isFetching;
  const correctRecord = query.data?.id === providerId;
  const pending = query.data?.status === 'pending';
  const ready = !loading && !query.isError && correctRecord && pending && present.every(Boolean);
  const isComplete = ready && review.fetchedAt === query.dataUpdatedAt && review.isComplete;

  useEffect(() => {
    onChange({ isComplete, rationale: isComplete ? review.rationale : '' });
  }, [isComplete, review.rationale, onChange]);

  return (
    <div className="space-y-4">
      <section aria-label="Required application documents" className="rounded-lg border border-[var(--color-border)] p-4">
        <h4 className="text-sm font-semibold text-[var(--color-text)]">Required application documents</h4>
        {loading ? (
          <div role="status" aria-busy="true" className="mt-3 space-y-2">
            <p className="text-sm text-[var(--color-text-secondary)]">Checking current application documents...</p>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : query.isError ? (
          <div role="alert" className="mt-3 space-y-3">
            <p className="text-sm text-[var(--color-text)]">Application documents could not be checked. Approval is blocked until this check succeeds.</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry document check</Button>
          </div>
        ) : !correctRecord || !pending ? (
          <p role="alert" className="mt-3 text-sm text-[var(--color-text)]">
            {!correctRecord
              ? 'The application response does not match this provider. Approval is blocked.'
              : 'This application is no longer pending. Refresh the provider record before taking another action.'}
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {REQUIRED_APPROVAL_DOCUMENTS.map((document, index) => (
                <li key={document.key} className="flex flex-wrap justify-between gap-2 text-sm text-[var(--color-text)]">
                  <span>{document.label}</span>
                  <span className="font-medium">{present[index] ? 'On file' : 'Missing'}</span>
                </li>
              ))}
            </ul>
            {!ready && <p role="alert" className="mt-3 text-sm text-[var(--color-text)]">Approval is blocked. All four required documents must be on file before you can complete the review.</p>}
            <p className="mt-3 text-sm text-[var(--color-text-secondary)]">On file does not mean verified. Open the full application, inspect the documents and answers, then confirm the checklist.</p>
          </>
        )}
        <Link className="mt-3 inline-flex min-h-11 items-center text-sm text-[var(--color-primary)] underline" to={`/providers/${encodeURIComponent(providerId)}?tab=profile`}>
          Open full application and documents
        </Link>
        {!loading && !query.isError && (
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Recheck application</Button>
          </div>
        )}
      </section>
      {ready && <VettingChecklist key={query.dataUpdatedAt} onChange={receiveChecklist} />}
    </div>
  );
}
