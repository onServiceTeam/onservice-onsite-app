import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Switch } from '../ui/Switch';

describe('admin Stitch control primitives', () => {
  it('Bug UX-406 — shared controls use solid borders and 44px minimum targets without decorative shadows', () => {
    render(
      <Card data-testid="card">
        <Input aria-label="Name" />
        <Textarea aria-label="Notes" />
        <Switch aria-label="Enabled" />
      </Card>,
    );

    expect(screen.getByTestId('card')).not.toHaveClass('shadow-sm');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveClass('min-h-11');
    expect(screen.getByRole('textbox', { name: 'Name' })).not.toHaveClass('shadow-sm');
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveClass('min-h-24');
    expect(screen.getByRole('switch', { name: 'Enabled' })).toHaveClass('h-5');
  });
});
