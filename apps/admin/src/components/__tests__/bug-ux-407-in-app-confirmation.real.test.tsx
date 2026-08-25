import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../ui/Button';
import { useConfirmationDialog } from '../ui/ConfirmationDialog';

function ConfirmationHarness(): React.ReactElement {
  const [result, setResult] = useState('Not decided');
  const { confirm, confirmationDialog } = useConfirmationDialog();

  async function requestDecision(): Promise<void> {
    const accepted = await confirm({
      title: 'Deactivate template?',
      description: 'Customer and provider messages will stop using this template.',
      confirmLabel: 'Deactivate',
      tone: 'destructive',
    });
    setResult(accepted ? 'Confirmed' : 'Cancelled');
  }

  return (
    <>
      <Button type="button" onClick={() => void requestDecision()}>
        Request decision
      </Button>
      <p>{result}</p>
      {confirmationDialog}
    </>
  );
}

describe('admin action confirmation', () => {
  it('Bug UX-407 — consequential actions use an accessible in-app decision dialog', async () => {
    render(<ConfirmationHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Request decision' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Customer and provider messages will stop/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('Confirmed')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
