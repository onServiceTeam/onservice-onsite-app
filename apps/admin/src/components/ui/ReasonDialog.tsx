import * as React from 'react';
import { Button } from './Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog';
import { Label } from './Label';
import { Textarea } from './Textarea';

export interface ReasonRequest {
  title: string;
  description: string;
  confirmLabel: string;
  reasonLabel?: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  tone?: 'default' | 'destructive';
}

interface ReasonDialogProps extends ReasonRequest {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  reasonLabel = 'Reason',
  placeholder = 'Record what you checked and why this action is needed.',
  minLength = 10,
  maxLength = 2000,
  tone = 'destructive',
  onCancel,
  onConfirm,
}: ReasonDialogProps): React.ReactElement {
  const [reason, setReason] = React.useState('');
  const trimmedLength = reason.trim().length;

  React.useEffect(() => {
    if (open) setReason('');
  }, [open, title]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="admin-action-reason">{reasonLabel}</Label>
          <Textarea
            id="admin-action-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={placeholder}
            minLength={minLength}
            maxLength={maxLength}
            aria-describedby="admin-action-reason-guidance"
            autoFocus
          />
          <p
            id="admin-action-reason-guidance"
            className="mt-1 flex justify-between gap-3 text-xs text-[var(--color-text-secondary)]"
          >
            <span>Minimum {minLength} characters. Saved to the audit record.</span>
            <span>{reason.length}/{maxLength}</span>
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            onClick={() => onConfirm(reason.trim())}
            disabled={trimmedLength < minLength}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useReasonDialog(): {
  requestReason: (request: ReasonRequest) => Promise<string | null>;
  reasonDialog: React.ReactElement | null;
} {
  const [request, setRequest] = React.useState<ReasonRequest | null>(null);
  const resolverRef = React.useRef<((reason: string | null) => void) | null>(null);

  React.useEffect(
    () => () => {
      resolverRef.current?.(null);
      resolverRef.current = null;
    },
    [],
  );

  const resolve = React.useCallback((reason: string | null): void => {
    resolverRef.current?.(reason);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const requestReason = React.useCallback(
    (nextRequest: ReasonRequest): Promise<string | null> => {
      resolverRef.current?.(null);
      return new Promise<string | null>((resolver) => {
        resolverRef.current = resolver;
        setRequest(nextRequest);
      });
    },
    [],
  );

  return {
    requestReason,
    reasonDialog: request ? (
      <ReasonDialog
        {...request}
        open
        onCancel={() => resolve(null)}
        onConfirm={(reason) => resolve(reason)}
      />
    ) : null,
  };
}
