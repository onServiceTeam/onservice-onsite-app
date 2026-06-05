/**
 * A2 / C2 — top-level mobile error boundary.
 *
 * Real DOM-render tests (jsdom + @testing-library/react, the project's
 * working harness). Renders the real ErrorBoundary, makes a child throw, and
 * asserts on the actual rendered output — no source-text matching.
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { captureException } from '@sentry/core';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// A component that throws during render, to trip the boundary.
function Boom(): React.ReactElement {
  throw new Error('kaboom');
}

describe('A2 — top-level error boundary', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.mocked(captureException).mockClear();
    // React logs caught render errors to console.error; silence the noise.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('A2 — renders children normally when nothing throws', () => {
    const { container } = render(
      <ErrorBoundary>
        <span>healthy-screen</span>
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('healthy-screen');
    expect(container.textContent).not.toContain('Something went wrong');
  });

  it('A2 — shows the fallback (not a blank screen) when a child throws', () => {
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('Something went wrong');
    // The fallback exposes a recovery action.
    expect(container.textContent).toContain('Try again');
  });

  it('A2 — reports the caught error to Sentry', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(jest.mocked(captureException).mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('A2 — "Try again" resets the boundary and re-renders the recovered subtree', () => {
    let shouldThrow = true;
    function Maybe(): React.ReactElement {
      if (shouldThrow) throw new Error('boom');
      return <span>recovered-screen</span>;
    }

    const { container, getByRole } = render(
      <ErrorBoundary>
        <Maybe />
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('Something went wrong');

    // Simulate the underlying issue being resolved, then tap "Try again".
    shouldThrow = false;
    const tryAgain = getByRole('button', { name: 'Try again' });
    act(() => {
      tryAgain.click();
    });

    expect(container.textContent).toContain('recovered-screen');
    expect(container.textContent).not.toContain('Something went wrong');
  });
});
