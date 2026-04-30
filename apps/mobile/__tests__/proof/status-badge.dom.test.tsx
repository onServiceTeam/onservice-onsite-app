/**
 * Phase 14 R5b — DOM-based render test using @testing-library/react.
 *
 * Renders StatusBadge in jsdom (RN mocks emit lowercase custom elements
 * that jsdom treats as HTML unknown elements). This is the working
 * harness for D11/D12 component tests + the F#7 surfaces.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { StatusBadge } from '@/components/ui';

describe('StatusBadge — real DOM render (R5b proof)', () => {
  it('renders the canonical "Cancelled" label for cancelled_by_customer', () => {
    const { container } = render(<StatusBadge status="cancelled_by_customer" />);
    expect(container.textContent).toContain('Cancelled');
  });

  it('renders "On the way" for provider_en_route', () => {
    const { container } = render(<StatusBadge status="provider_en_route" />);
    expect(container.textContent).toContain('On the way');
  });

  it('renders "Completed" for confirmed status', () => {
    const { container } = render(<StatusBadge status="confirmed" />);
    expect(container.textContent).toContain('Completed');
  });

  it('falls back to the raw status string for unknown statuses', () => {
    const { container } = render(<StatusBadge status="unknown_future_state" />);
    expect(container.textContent).toContain('unknown_future_state');
  });

  it('exposes accessibilityLabel containing the rendered status', () => {
    const { container } = render(<StatusBadge status="paid" />);
    const labeled = container.querySelector('[accessibilitylabel]');
    expect(labeled).not.toBeNull();
    expect(labeled?.getAttribute('accessibilitylabel')).toContain('Confirmed');
  });
});
