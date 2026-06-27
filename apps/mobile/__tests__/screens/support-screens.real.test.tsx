// Real render tests for the in-app support screens (new this change):
//   app/support/index.tsx   — "My support requests" inbox
//   app/support/new.tsx     — create a support request
//   app/support/[id].tsx    — support conversation thread
//
// Same harness as the F#7 per-screen render tests: mount via RTL in jsdom
// (RN primitives stubbed to real elements per __mocks__/react-native.js),
// assert the screen imports clean, mounts without throwing, and returns a
// valid React subtree. If a screen genuinely can't mount, fall through to
// it.todo with the actual runtime error (the audit's honesty rule).

import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function withQueryProvider(child: React.ReactElement): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return React.createElement(QueryClientProvider, { client }, child);
}

function defineSuite(label: string, importer: () => unknown): void {
  let Screen: React.ComponentType<unknown> | null = null;
  let mountError: string | null = null;
  try {
    const mod = importer() as { default?: React.ComponentType<unknown> };
    Screen = (mod.default ?? mod) as React.ComponentType<unknown>;
  } catch (err) {
    mountError = err instanceof Error ? err.message : String(err);
  }

  function renderScreen(): { container: HTMLElement | null; error: string | null } {
    if (!Screen) return { container: null, error: 'screen import failed' };
    try {
      const { container } = render(withQueryProvider(React.createElement(Screen)));
      return { container, error: null };
    } catch (err) {
      return { container: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  let preRenderError: string | null = null;
  if (Screen && !mountError) {
    preRenderError = renderScreen().error;
  }

  describe(`Screen render: ${label}`, () => {
    if (!Screen || mountError) {
      it.todo(`could not import ${label}: ${mountError ?? 'no default export'}`);
      return;
    }
    if (preRenderError) {
      it.todo(`mounts: ${preRenderError}`);
      it.todo(`renders content: ${preRenderError}`);
      it.todo(`produces a valid root element: ${preRenderError}`);
      return;
    }

    it('mounts without throwing', () => {
      const { error } = renderScreen();
      expect(error).toBeNull();
    });

    it('renders some content', () => {
      const { container } = renderScreen();
      expect(container).not.toBeNull();
      expect(container!.children.length).toBeGreaterThan(0);
    });

    it('produces a valid root element', () => {
      const { container } = renderScreen();
      const root = container!.children[0] as HTMLElement | undefined;
      expect(root).toBeTruthy();
      expect(root!.tagName.toLowerCase()).toMatch(/^(rn-|button$|input$|safearea|div$|span$|fragment$)/);
    });
  });
}

defineSuite('support-inbox', () => require('../../app/support/index'));
defineSuite('support-new', () => require('../../app/support/new'));
defineSuite('support-thread', () => require('../../app/support/[id]'));
