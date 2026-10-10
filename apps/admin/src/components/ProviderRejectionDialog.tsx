import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { ProviderApprovalReview } from '@/components/ProviderApprovalReview';
import type { VettingState } from '@/components/VettingChecklist';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/Dialog';

export function ProviderRejectionDialog({ providerId }: { providerId: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [review, setReview] = useState<VettingState>({ isComplete: false, rationale: '' });
  const queryClient = useQueryClient();
  const reject = useMutation({
    mutationFn: async () => {
      if (!review.isComplete || !review.expectedRevisionId) throw new Error('Review the displayed submission before rejecting.');
      await api.put(`/api/v1/admin/providers/${providerId}/reject`, {
        reason: review.rationale, expectedRevisionId: review.expectedRevisionId,
      });
    },
    onSuccess: async () => {
      await Promise.all([['admin-provider-profile', providerId], ['adminProviders'], ['admin-provider-activity', providerId]]
        .map(queryKey => queryClient.invalidateQueries({ queryKey })));
      setOpen(false);
    },
  });
  const requestClose = (): void => { if (!reject.isPending) setDiscard(true); };
  return <>
    <Button variant="destructive" size="sm" onClick={() => {
      setReview({ isComplete: false, rationale: '' }); setDiscard(false); reject.reset(); setOpen(true);
    }}>Reject application</Button>
    {open && <Dialog open onOpenChange={next => { if (!next) requestClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogTitle className="pr-8">Review application rejection</DialogTitle>
        <DialogDescription className="pr-8">Review the preserved submission and explain your decision to the applicant.</DialogDescription>
        {reject.isError && <p role="alert">{getErrorMessage(reject.error)}</p>}
        {reject.isPending && <p role="status">Saving the decision. Closing is not cancellation.</p>}
        {discard && <section aria-label="Discard unsaved rejection" className="space-y-3">
          <p>Discard this unsaved review?</p>
          <Button variant="outline" onClick={() => setDiscard(false)}>Keep reviewing</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Discard review</Button>
        </section>}
        <fieldset disabled={reject.isPending || discard} className="min-w-0 border-0 p-0">
          <ProviderApprovalReview providerId={providerId} decision="reject" onChange={setReview} />
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={reject.isPending} onClick={requestClose}>Cancel</Button>
          <Button variant="destructive" disabled={reject.isPending || discard || !review.isComplete || !review.expectedRevisionId}
            onClick={() => reject.mutate()}>Reject reviewed submission</Button>
        </div>
      </DialogContent>
    </Dialog>}
  </>;
}
