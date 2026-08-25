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

export interface ConfirmationRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
}

interface ConfirmationDialogProps extends ConfirmationRequest {
  open: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Working...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useConfirmationDialog(): {
  confirm: (request: ConfirmationRequest) => Promise<boolean>;
  confirmationDialog: React.ReactElement | null;
} {
  const [request, setRequest] = React.useState<ConfirmationRequest | null>(null);
  const resolverRef = React.useRef<((confirmed: boolean) => void) | null>(null);

  React.useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    [],
  );

  const resolve = React.useCallback((confirmed: boolean): void => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const confirm = React.useCallback(
    (nextRequest: ConfirmationRequest): Promise<boolean> => {
      resolverRef.current?.(false);
      return new Promise<boolean>((resolver) => {
        resolverRef.current = resolver;
        setRequest(nextRequest);
      });
    },
    [],
  );

  return {
    confirm,
    confirmationDialog: request ? (
      <ConfirmationDialog
        {...request}
        open
        onCancel={() => resolve(false)}
        onConfirm={() => resolve(true)}
      />
    ) : null,
  };
}
