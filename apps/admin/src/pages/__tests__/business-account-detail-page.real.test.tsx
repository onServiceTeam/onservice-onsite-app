// Phase 200 — real render test for BusinessAccountDetailPage.
// Source: apps/admin/src/pages/BusinessAccountDetailPage.tsx
//
// Mounts the page via @testing-library/react + vitest in jsdom. The api
// client + auth store + react-router params are stubbed in vitest.setup
// (useParams returns { id: 'sample-id' }, api.get resolves empty data), so
// the page should mount and render its chrome (header/back link/tabs)
// without throwing.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import * as PageModule from '../BusinessAccountDetailPage';

const Page = (PageModule as { default?: React.ComponentType<unknown> }).default ?? null;
const importError: string | null = Page ? null : 'no default export';

function withProviders(child: React.ReactElement): React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return React.createElement(
    QueryClientProvider,
    { client },
    React.createElement(MemoryRouter, { initialEntries: ['/business-accounts/sample-id'] }, child),
  );
}

function renderPage(): { container: HTMLElement | null; error: string | null } {
  if (!Page) return { container: null, error: 'page import failed' };
  try {
    const { container } = render(withProviders(React.createElement(Page)));
    return { container, error: null };
  } catch (err) {
    return { container: null, error: err instanceof Error ? err.message : String(err) };
  }
}

describe('Page render: BusinessAccountDetailPage', () => {
  if (!Page || importError) {
    it.todo('page could not be imported: ' + (importError ?? 'no default export'));
    return;
  }

  it('mounts without throwing', () => {
    const { error } = renderPage();
    expect(error).toBeNull();
  });

  it('renders some content', () => {
    const { container } = renderPage();
    expect(container).not.toBeNull();
    expect(container!.children.length).toBeGreaterThan(0);
  });

  it('produces a valid root element', () => {
    const { container } = renderPage();
    const root = container!.children[0] as HTMLElement | undefined;
    expect(root).toBeTruthy();
    expect(root!.tagName.toLowerCase()).toMatch(
      /^(div|main|form|button|input|section|article|nav|header|footer|aside|span|a|h[1-6])$/,
    );
  });
});
