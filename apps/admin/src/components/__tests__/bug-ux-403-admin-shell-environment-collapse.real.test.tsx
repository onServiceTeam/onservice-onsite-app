import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

describe('admin navigation context', () => {
  it('Bug UX-403 — identifies the real environment and exposes desktop navigation collapse', () => {
    const toggle = vi.fn();

    render(
      <MemoryRouter>
        <Sidebar collapsed onToggleCollapsed={toggle} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Development environment')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Command Center' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }));
    expect(toggle).toHaveBeenCalledOnce();
  });
});
