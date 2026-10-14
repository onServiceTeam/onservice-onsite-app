import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Button } from '../Button';

// Bug UX-1390: Button used to append the caller's className after the
// variant classes without resolving conflicts. Two text colour utilities
// on one element are decided by Tailwind's stylesheet order (alphabetical
// for colours), not by class order, so text-red-700 lost to the ghost
// variant's text-slate-900 and red Delete buttons rendered dark slate.

it('Bug UX-1390 — a ghost button given text-red-700 keeps the red and drops the variant text-slate-900', () => {
  render(
    <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50">
      Delete
    </Button>,
  );

  const button = screen.getByRole('button', { name: 'Delete' });
  expect(button).toHaveClass('text-red-700');
  expect(button).not.toHaveClass('text-slate-900');
});

it('Bug UX-1390 — a ghost button given only a text size keeps the variant text-slate-900', () => {
  render(
    <Button variant="ghost" className="text-sm">
      More
    </Button>,
  );

  const button = screen.getByRole('button', { name: 'More' });
  expect(button).toHaveClass('text-sm');
  expect(button).toHaveClass('text-slate-900');
});

it('Bug UX-1390 — an outline button given an arbitrary text colour drops the variant text-slate-900', () => {
  render(
    <Button variant="outline" className="text-[var(--color-primary)]">
      Open
    </Button>,
  );

  const button = screen.getByRole('button', { name: 'Open' });
  expect(button).toHaveClass('text-[var(--color-primary)]');
  expect(button).not.toHaveClass('text-slate-900');
});

it('Bug UX-1390 — a default button with no className keeps the variant text-white', () => {
  render(<Button>Save</Button>);

  expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('text-white');
});
