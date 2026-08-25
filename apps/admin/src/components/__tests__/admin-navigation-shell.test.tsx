import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';
import Header from '../Header';

describe('admin operations shell', () => {
  it('Bug UX-003 — groups the full super-admin workspace by operational purpose', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: 'Admin workspace' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Operations' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Support & Trust' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Money' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Support Queue' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cancellation Policy' })).toBeTruthy();
  });

  it('Bug UX-004 — command search exposes real page destinations and its scope', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

    const search = screen.getByRole('textbox', { name: 'Jump to an admin page' });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'support' } });

    expect(screen.getByRole('button', { name: /Support Queue/i })).toBeTruthy();
    expect(
      screen.getByText(/Page search only\. Record search by booking, person, ticket, dispute, or payout/i),
    ).toBeTruthy();
  });
});
