// Small shared pieces for the tester feedback version 2 admin views.

import React, { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { AlertTriangle } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { FEEDBACK_V2_BASE, answerText, type StudyQuestion } from './feedback-v2';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type ShotState = { status: 'waiting' } | { status: 'loading' } | { status: 'ready'; objectUrl: string } | { status: 'failed' };

/** Start loading a little before the screenshot scrolls into view. */
const SCREENSHOT_ROOT_MARGIN = '200px';

function canWatchScrolling(): boolean {
  return typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
}

/**
 * One tester screenshot, fetched through the signed-in admin proxy and shown
 * from a temporary object URL that is released when the view closes. It is
 * only fetched once it comes near the screen, so a page of 25 reports does not
 * download every screenshot at once. Browsers without IntersectionObserver
 * (and the test DOM) load it straight away.
 */
export function ProtectedScreenshot({ entryId, filename, index }: {
  entryId: string;
  filename: string;
  index: number;
}): React.ReactElement {
  const url = `${FEEDBACK_V2_BASE}/entries/${encodeURIComponent(entryId)}/screenshots/${encodeURIComponent(filename)}`;
  const [attempt, setAttempt] = useState(0);
  const [nearScreen, setNearScreen] = useState(() => !canWatchScrolling());
  const [state, setState] = useState<ShotState>(() => (nearScreen ? { status: 'loading' } : { status: 'waiting' }));
  const placeholderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (nearScreen) return undefined;
    const element = placeholderRef.current;
    if (!element || !canWatchScrolling()) {
      setNearScreen(true);
      return undefined;
    }
    const observer = new window.IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) {
        setNearScreen(true);
        observer.disconnect();
      }
    }, { rootMargin: SCREENSHOT_ROOT_MARGIN });
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearScreen]);

  useEffect(() => {
    if (!nearScreen) return undefined;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const response = await api.get<Blob>(url, { responseType: 'blob', signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!IMAGE_TYPES.includes(response.data.type)) throw new Error('Unsupported screenshot type.');
        objectUrl = URL.createObjectURL(response.data);
        setState({ status: 'ready', objectUrl });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'failed' });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, attempt, nearScreen]);

  const alt = `Screenshot ${index + 1}`;
  if (state.status === 'waiting') {
    return (
      <div
        ref={placeholderRef}
        data-testid="fb2-screenshot-waiting"
        className="flex h-40 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text-secondary)]"
      >
        {alt} loads when you scroll to it.
      </div>
    );
  }
  if (state.status === 'loading') {
    return (
      <div role="status" className="flex h-40 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text-secondary)]">
        Loading {alt.toLowerCase()}…
      </div>
    );
  }
  if (state.status === 'failed') {
    return (
      <div role="alert" className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs text-red-800">
        <span>{alt} could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>Retry {alt.toLowerCase()}</Button>
      </div>
    );
  }
  return (
    <a
      href={state.objectUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]"
    >
      <img src={state.objectUrl} alt={alt} className="h-40 w-full object-contain" />
      <span className="block px-3 py-2 text-xs font-medium text-[var(--color-secondary)] group-hover:underline">Open full size</span>
    </a>
  );
}

export function ScreenshotGrid({ entryId, screenshots }: { entryId: string; screenshots: string[] }): React.ReactElement | null {
  if (!screenshots.length) return null;
  return (
    <section aria-label={`Screenshots (${screenshots.length})`} className="mt-3">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Screenshots ({screenshots.length})</h4>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {screenshots.map((filename, index) => (
          <ProtectedScreenshot key={filename} entryId={entryId} filename={filename} index={index} />
        ))}
      </div>
    </section>
  );
}

/**
 * Answers labelled with the study's own question wording. Keys the study does
 * not know (an older study version) are still shown, under their raw key.
 */
export function AnswerList({ questions, answers, showMissing = false }: {
  questions: StudyQuestion[];
  answers: Record<string, unknown>;
  showMissing?: boolean;
}): React.ReactElement {
  const known = new Set(questions.map((question) => question.key));
  const rows: Array<{ key: string; label: string; value: string | null }> = [
    ...questions.map((question) => ({ key: question.key, label: question.label, value: answerText(answers[question.key]) })),
    ...Object.keys(answers).filter((key) => !known.has(key)).map((key) => ({ key, label: key, value: answerText(answers[key]) })),
  ].filter((row) => showMissing || row.value !== null);

  if (!rows.length) return <p className="text-sm text-[var(--color-text-secondary)]">No written answers.</p>;
  return (
    <dl className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
      {rows.map((row) => (
        <div key={row.key} className="p-3">
          <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">{row.label}</dt>
          <dd className={`mt-1 whitespace-pre-wrap break-words text-sm leading-6 ${row.value ? 'text-[var(--color-text)]' : 'italic text-[var(--color-text-tertiary)]'}`}>
            {row.value ?? 'Not answered'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A muted warning marker that always carries words, never colour alone. */
export function WarningFlag({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
      <AlertTriangle size={12} aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * A white card that is also a named page region: a <section> labelled by its
 * own heading (aria-labelledby does nothing on a plain div).
 */
export function SectionCard({ labelledBy, className = '', children }: {
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section aria-labelledby={labelledBy} className={`rounded-lg border border-[var(--color-border)] bg-white ${className}`}>
      {children}
    </section>
  );
}

export function Meta({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
