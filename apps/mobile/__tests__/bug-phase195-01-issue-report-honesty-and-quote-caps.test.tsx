// BUG-PHASE195-01 — provider checklist "Report Issue" used to POST to a
// non-existent endpoint and fake a "saved locally" success. Escalation E05
// documents the backend build still owed; until it lands the screen must be
// HONEST: a failed report surfaces the real error, never a fabricated success.
//
// This is a REAL render test (replaces the prior source-regex checks, which
// the A7 migration broke when the modal Alert became a non-blocking toast).
// It drives the actual Report-Issue flow and asserts on observed behavior:
//   - failed report  -> error toast, and NO success toast (no fabrication)
//   - successful report -> success toast
//   - the issue input is capped to the server max (2000)
//   - quote line-item description/unit inputs are capped (500 / 30)

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// --- shared mocks -----------------------------------------------------------
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
jest.mock('@/services/api', () => ({
  __esModule: true,
  // getErrorMessage (src/utils/errors.ts) does `err instanceof ApiError`,
  // so the mock must still export the real class shape or that check throws.
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

const mockShowToast = jest.fn();
jest.mock('@/lib/toast', () => ({
  showToast: (...a: unknown[]) => mockShowToast(...a),
  showRetryableToast: (...a: unknown[]) => mockShowToast(...a),
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
import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

const CHECKLIST_RESPONSE = {
  data: {
    success: true,
    data: {
      sections: [
        {
          id: 's1',
          title: 'General',
          items: [
            { id: 'i1', title: 'Inspect the area', isCompleted: false, completedAt: null, photoId: null },
          ],
        },
      ],
    },
  },
};

function renderChecklist(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    React.createElement(QueryClientProvider, { client }, React.createElement(JobChecklistScreen)),
  );
}

function renderQuote(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    React.createElement(QueryClientProvider, { client }, React.createElement(QuoteBuilderScreen)),
  );
}

// Open the Report-Issue modal, type a description, and tap Send Report.
async function submitAnIssue(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(container.textContent).toContain('Inspect the area'));

  const reportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes('Report Issue'),
  );
  expect(reportBtn).toBeTruthy();
  fireEvent.click(reportBtn!);

  // The modal is now visible; it owns the only text input on the screen.
  await waitFor(() => expect(container.querySelector('input')).toBeTruthy());
  const input = container.querySelector('input')!;
  fireEvent.change(input, { target: { value: 'Customer was not home; could not access the unit.' } });

  const sendBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes('Send Report'),
  );
  expect(sendBtn).toBeTruthy();
  fireEvent.click(sendBtn!);
}

describe('BUG-PHASE195-01 — checklist Report-Issue honesty (real render)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(CHECKLIST_RESPONSE);
  });

  it('Bug PHASE195-01 — a failed issue report shows an honest error toast and never a fabricated success', async () => {
    mockPost.mockRejectedValue(new Error('Issue endpoint not available'));
    const { container } = renderChecklist();

    await submitAnIssue(container);

    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    const types = mockShowToast.mock.calls.map((c) => c[1]);
    // Honest failure: an error toast fired...
    expect(types).toContain('error');
    // ...and we did NOT fake a success.
    expect(types).not.toContain('success');
  });

  it('Bug PHASE195-01 — a successful issue report shows a success toast', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const { container } = renderChecklist();

    await submitAnIssue(container);

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('sent to the customer'),
        'success',
      ),
    );
  });

  it('Bug PHASE195-01 — the issue description input is capped to the server max of 2000', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const { container } = renderChecklist();

    await waitFor(() => expect(container.textContent).toContain('Inspect the area'));
    const reportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Report Issue'),
    );
    fireEvent.click(reportBtn!);

    await waitFor(() => expect(container.querySelector('input')).toBeTruthy());
    const input = container.querySelector('input')!;
    expect(input.getAttribute('maxlength')).toBe('2000');
  });
});

describe('BUG-PHASE195-01 — quote line-item inputs match server caps (real render)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: { tier: 'new' } } });
  });

  it('Bug PHASE195-01 — the line-item description input is capped to 500', async () => {
    const { container } = renderQuote();
    await waitFor(() => {
      const descInput = container.querySelector('input[placeholder="Item description"]');
      expect(descInput).toBeTruthy();
    });
    const descInput = container.querySelector('input[placeholder="Item description"]')!;
    expect(descInput.getAttribute('maxlength')).toBe('500');
  });

  it('Bug PHASE195-01 — the line-item unit input is capped to 30', async () => {
    const { container } = renderQuote();
    await waitFor(() => {
      const unitInput = container.querySelector('input[placeholder="unit"]');
      expect(unitInput).toBeTruthy();
    });
    const unitInput = container.querySelector('input[placeholder="unit"]')!;
    expect(unitInput.getAttribute('maxlength')).toBe('30');
  });
});
