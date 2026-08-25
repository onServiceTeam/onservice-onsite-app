import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../ui/Button';
import { useReasonDialog } from '../ui/ReasonDialog';

function ReasonHarness(): React.ReactElement {
  const [result, setResult] = useState('No reason');
  const { requestReason, reasonDialog } = useReasonDialog();

  async function request(): Promise<void> {
    const reason = await requestReason({
      title: 'Deactivate service?',
      description: 'The service will stop appearing in customer booking.',
      confirmLabel: 'Deactivate service',
    });
    setResult(reason ?? 'Cancelled');
  }

  return (
    <>
      <Button type="button" onClick={() => void request()}>Open reason</Button>
      <p>{result}</p>
      {reasonDialog}
    </>
  );
}

describe('audited admin reason', () => {
  it('Bug UX-411 — consequential action stays disabled until a durable reason is supplied', async () => {
    render(<ReasonHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Open reason' }));
    const confirm = screen.getByRole('button', { name: 'Deactivate service' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Customer scope is no longer offered.' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByText('Customer scope is no longer offered.')).toBeTruthy();
  });
});
