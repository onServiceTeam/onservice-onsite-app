import React, { useCallback, useEffect, useId, useState } from 'react';
import { ProviderSubmissionForDecision } from '@/components/ProviderSubmissionHistory';
import { VettingChecklist, type VettingState } from '@/components/VettingChecklist';
import { Textarea } from '@/components/ui/Textarea';

export function ProviderApprovalReview({ providerId, onChange, decision = 'approve' }: {
  providerId: string; onChange: (state: VettingState) => void; decision?: 'approve' | 'reject';
}): React.ReactElement {
  const review = useCallback((revisionId: string) => <SubmissionDecisionFields key={revisionId}
    revisionId={revisionId} onChange={onChange} decision={decision} />, [onChange, decision]);
  return <ProviderSubmissionForDecision key={providerId} providerId={providerId} review={review} />;
}

function SubmissionDecisionFields({ revisionId, onChange, decision }: {
  revisionId: string; onChange: (state: VettingState) => void; decision: 'approve' | 'reject';
}): React.ReactElement {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const receiveChecklist = useCallback((state: VettingState) => {
    onChange({ ...state, expectedRevisionId: state.isComplete ? revisionId : undefined });
  }, [onChange, revisionId]);
  useEffect(() => () => onChange({ isComplete: false, rationale: '' }), [onChange]);
  useEffect(() => {
    if (decision !== 'reject') return;
    const rationale = reason.trim();
    const isComplete = rationale.length >= 10 && rationale.length <= 1000;
    onChange({ isComplete, rationale, expectedRevisionId: isComplete ? revisionId : undefined });
  }, [decision, reason, revisionId, onChange]);
  return <section aria-label="Decision on displayed submission" className="space-y-3 border-t border-[var(--color-border)] pt-4">
    <p className="text-sm font-semibold">Your decision applies to the submission displayed above.</p>
    <p className="text-sm text-[var(--color-text-secondary)]">Read its answers and open its original documents. A saved document reference is not verification. If a newer submission arrives, the server will refuse this decision and require a new review.</p>
    {decision === 'approve' ? <VettingChecklist onChange={receiveChecklist} /> : <>
      <p className="text-sm">Rejection closes the pending application and sends your reason to the applicant. It does not delete evidence or request corrections. Do not reject merely to ask for edits.</p>
      <label htmlFor={reasonId} className="block text-sm font-medium">Rejection reason</label>
      <Textarea id={reasonId} value={reason} onChange={event => setReason(event.target.value)} rows={3} minLength={10} maxLength={1000} />
      <p className="text-xs text-[var(--color-text-secondary)]">Use 10 to 1000 characters, excluding surrounding spaces.</p>
    </>}
  </section>;
}
