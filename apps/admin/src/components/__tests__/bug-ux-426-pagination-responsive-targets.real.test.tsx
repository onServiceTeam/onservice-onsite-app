import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import Pagination from '../ui/Pagination';

it('Bug UX-426 — shared admin pagination wraps on narrow screens and keeps 44-pixel action targets', () => {
  const { container } = render(
    <Pagination page={2} totalPages={4} total={76} pageSize={25} onPageChange={vi.fn()} />,
  );

  expect(container.firstElementChild).toHaveClass('flex-col', 'sm:flex-row');
  expect(screen.getByRole('button', { name: 'Previous' })).toHaveClass('min-h-11');
  expect(screen.getByRole('button', { name: 'Page 2' })).toHaveClass('h-11', 'min-w-11');
  expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Next' })).toHaveClass('min-h-11');
});
