import React from 'react';
import { render } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';

jest.mock('@/components/icons', () => ({
  Inbox: (): React.ReactElement => <span data-testid="vector-icon" />,
}));

describe('shared empty-state iconography', () => {
  it('Bug UX-017 — renders a vector icon without leaking emoji text', () => {
    const { container } = render(
      <EmptyState title="Nothing here" description="Items will appear here later." />,
    );

    expect(container.querySelector('[data-testid="vector-icon"]')).not.toBeNull();
    expect(container.textContent).toBe('Nothing hereItems will appear here later.');
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/u);
  });
});
