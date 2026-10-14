// R-PRV-11 (the part that needs no decision): the provider checklist "Report
// Issue" box told the provider "The customer will be notified." That was
// false. The report address POST /api/v1/bookings/:id/issues does not exist
// yet (E05, waiting on Ken), so nothing is saved and nobody is notified. The
// box must not promise something the app does not do.
//
// Real render test: it mounts the real checklist screen, opens the real
// Report Issue box, and reads the text the provider would see. The E05
// endpoint, table and notification are NOT built here, and the interim error
// handling (covered by bug-phase195-01) is unchanged.
//
// Left open on purpose: the success toast "Your issue has been sent to the
// customer." only shows if the missing endpoint answers 2xx, so no provider
// can see it today. Its wording is part of the E05 decision (true under
// option A, which notifies the customer) and bug-phase195-01 checks it.

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
jest.mock('@/services/api', () => ({
  __esModule: true,
  // getErrorMessage (src/utils/errors.ts) does `err instanceof ApiError`,
  // so the mock must still export a real class or that check throws.
  ApiError: class ApiError extends Error {
    body?: unknown;
    status?: number;
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
  default: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    patch: (...a: unknown[]) => mockPatch(...a),
  },
}));

jest.mock('@/lib/toast', () => ({
  showToast: jest.fn(),
  showRetryableToast: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'job-1' }),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));

jest.mock('@/services/booking-photo.service', () => ({
  uploadBookingPhoto: jest.fn(),
  listBookingPhotos: jest.fn().mockResolvedValue([]),
}));

import JobChecklistScreen from '../app/provider/job/[id]/checklist';

const CHECKLIST_RESPONSE = {
  data: {
    success: true,
    data: {
      sections: [
        {
          id: 's1',
          title: 'General',
          items: [
            {
              id: 'i1',
              title: 'Inspect the area',
              description: null,
              isCompleted: false,
              completedAt: null,
              photoId: null,
              photoUrl: null,
              photoRequired: false,
            },
          ],
        },
      ],
    },
  },
};

// Mount the screen and open the Report Issue box for the one checklist item.
// Returns the open box so each test reads only what is really on screen.
async function openReportIssueBox(): Promise<{ container: HTMLElement; box: Element }> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <JobChecklistScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(container.textContent).toContain('Inspect the area'));
  // The box is closed until the provider taps Report Issue.
  expect(container.querySelector('rn-modal')).toBeNull();

  const reportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes('Report Issue'),
  );
  expect(reportBtn).toBeTruthy();
  fireEvent.click(reportBtn!);

  await waitFor(() => expect(container.querySelector('rn-modal')).toBeTruthy());
  const box = container.querySelector('rn-modal')!;
  // Guard against a vacuous pass: the box really is open, with its input and
  // its Send Report button.
  expect(box.querySelector('input')).toBeTruthy();
  expect(box.textContent).toContain('Send Report');
  return { container, box };
}

describe('R-PRV-11 — checklist Report Issue box makes no false customer promise (real render)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(CHECKLIST_RESPONSE);
  });

  it('Bug R-PRV-11 — the Report Issue hint says only "Describe what went wrong." with no customer-notified sentence', async () => {
    const { box } = await openReportIssueBox();

    // Exact match on the hint line, so any extra sentence added to it (the old
    // "The customer will be notified." or a reworded promise) fails here.
    const hint = Array.from(box.querySelectorAll('rn-text')).find((el) =>
      (el.textContent ?? '').trim().startsWith('Describe'),
    );
    expect(hint).toBeTruthy();
    expect((hint!.textContent ?? '').trim()).toBe('Describe what went wrong.');
  });

  it('Bug R-PRV-11 — no text on the checklist screen with the Report Issue box open uses notify or customer-is-told wording', async () => {
    const { container, box } = await openReportIssueBox();

    const placeholder = box.querySelector('input')?.getAttribute('placeholder') ?? '';
    const shownText = `${container.textContent ?? ''} ${placeholder}`;

    // Any form of notify: notify, notified, notifies, notification(s).
    expect(shownText).not.toMatch(/\bnotif\w*/i);
    // "the customer will be told / was sent / gets informed ..."
    expect(shownText).not.toMatch(/customer[^.]*\b(told|informed|alerted|sent|messaged|emailed|texted)\b/i);
    // "the customer will see / receive / hear about / know about your report"
    expect(shownText).not.toMatch(/customer\s+(will|would|can|gets?|is going to)\b[^.]*\b(see|receive|get|hear|know)\b/i);
    // "we tell / message / update the customer", "let the customer know"
    expect(shownText).not.toMatch(/\b(tell|inform|alert|message|email|text|update)s? the customer\b/i);
    expect(shownText).not.toMatch(/\blet the customer know\b/i);
    // "sent / forwarded / passed on / shared to the customer"
    expect(shownText).not.toMatch(/\b(sent|forwarded|passed|shared)\s+(on\s+)?(to|with)\s+the\s+customer\b/i);
  });
});
