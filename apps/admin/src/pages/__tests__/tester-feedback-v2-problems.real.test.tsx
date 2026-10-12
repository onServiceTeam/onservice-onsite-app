// Tester feedback v2 (Ken, 2026-10-12): the Problems tab shows each report
// with its question labels and its own private screenshots, filters through
// the API, and saves triage with the version check the API enforces.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  PROBLEM_1, PROBLEM_2, SHOT, V2, apiError, installIntersectionObserver, mockV2Api, problem, problemList,
  renderTesterFeedback,
} from './tester-feedback-v2-fixtures';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const createObjectURL = vi.fn(() => 'blob:tester-shot');
const revokeObjectURL = vi.fn();

function problemsCalls() {
  return vi.mocked(api.get).mock.calls.filter(([url]) => url === `${V2}/problems`);
}

async function firstCard(): Promise<HTMLElement> {
  const heading = (await screen.findAllByRole('heading', { name: 'Choosing a booking time' }))[0]!;
  return heading.closest('li')!;
}

async function openTriage(): Promise<HTMLElement> {
  const card = await firstCard();
  fireEvent.click(within(card).getByRole('button', { name: 'Triage this problem' }));
  return within(card).getByRole('form', { name: 'Triage this problem' });
}

describe('Tester feedback v2 problems', () => {
  beforeEach(() => {
    mockV2Api();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('shows each report with its severity, screen, route, tester, Manila time and labelled answers', async () => {
    renderTesterFeedback('/feedback?tab=problems');
    const card = await firstCard();
    expect(within(card).getByText('It stopped me')).toBeVisible();
    expect(within(card).getByText('/customer/booking/new')).toBeVisible();
    // 02:30 UTC is 10:30 in Manila.
    expect(card).toHaveTextContent(/Tester a1b2c3 · Customer side · .*10:30/);
    const answers = within(card).getByText('What were you trying to do?').closest('dl')!;
    expect(within(answers).getByText('Pick Saturday morning')).toBeVisible();
    expect(within(answers).getByText('What happened?').nextSibling).toHaveTextContent('The time list stayed empty');
    expect(within(answers).getByText('What did you expect to happen?').nextSibling).toHaveTextContent('A list of times');
    expect(within(card).getByText('No note yet')).toBeVisible();
    expect(screen.getByText((_, element) => element?.tagName === 'P'
      && element.textContent === '2 problem reports, most serious first.')).toBeVisible();
  });

  it('shows the app version each tester was using on each problem', async () => {
    renderTesterFeedback('/feedback?tab=problems');
    const cards = await screen.findAllByRole('region', { name: 'Choosing a booking time' });
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByTestId('fb2-problem-app-version')).toHaveTextContent('App version 1.0.1');
    expect(within(cards[1]!).getByTestId('fb2-problem-app-version')).toHaveTextContent('App version not given');
  });

  it('makes each problem a page region named by its screen heading', async () => {
    renderTesterFeedback('/feedback?tab=problems');
    const card = await firstCard();
    const region = within(card).getByRole('region', { name: 'Choosing a booking time' });
    expect(region.tagName).toBe('SECTION');
  });

  it('sends the chosen status, severity and screen filters to the API and resets to page 1', async () => {
    renderTesterFeedback('/feedback?tab=problems&problemPage=2');
    await firstCard();
    expect(problemsCalls()[0]![1]).toEqual({ params: { status: undefined, severity: undefined, screenKey: undefined, page: 2, pageSize: 25 } });

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'planned' } });
    fireEvent.change(screen.getByLabelText('How bad'), { target: { value: 'stopped' } });
    fireEvent.change(screen.getByLabelText('Screen'), { target: { value: 'booking_time' } });

    await waitFor(() => expect(problemsCalls().at(-1)![1]).toEqual({
      params: { status: 'planned', severity: 'stopped', screenKey: 'booking_time', page: 1, pageSize: 25 },
    }));
    expect(screen.getByTestId('location')).toHaveTextContent('tab=problems&problemStatus=planned&severity=stopped&screen=booking_time');
  });

  it('waits to fetch a screenshot until it scrolls near the screen', async () => {
    const observer = installIntersectionObserver();
    try {
      renderTesterFeedback('/feedback?tab=problems');
      const card = await firstCard();
      expect(within(card).getByText('Screenshot 1 loads when you scroll to it.')).toBeVisible();
      expect(vi.mocked(api.get).mock.calls.filter(([url]) => String(url).includes('/screenshots/'))).toHaveLength(0);

      act(() => observer.reveal());
      expect(await within(card).findByRole('img', { name: 'Screenshot 1' })).toHaveAttribute('src', 'blob:tester-shot');
      expect(vi.mocked(api.get).mock.calls.filter(([url]) => String(url).includes('/screenshots/'))).toHaveLength(1);
    } finally {
      observer.restore();
    }
  });

  it('fetches each screenshot through the signed-in admin route and releases it when the view closes', async () => {
    const view = renderTesterFeedback('/feedback?tab=problems');
    const card = await firstCard();
    const image = await within(card).findByRole('img', { name: 'Screenshot 1' });
    expect(image).toHaveAttribute('src', 'blob:tester-shot');
    expect(api.get).toHaveBeenCalledWith(
      `${V2}/entries/${PROBLEM_1}/screenshots/${SHOT}`,
      expect.objectContaining({ responseType: 'blob' }),
    );
    // The second report has no screenshots, so only one was fetched.
    expect(vi.mocked(api.get).mock.calls.filter(([url]) => String(url).includes('/screenshots/'))).toHaveLength(1);
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:tester-shot');
  });

  it('shows a screenshot that fails to load as a message with its own retry', async () => {
    let calls = 0;
    mockV2Api({
      [`${V2}/entries/${PROBLEM_1}/screenshots/${SHOT}`]: () => {
        calls += 1;
        if (calls === 1) throw apiError(404, 'Feedback screenshot not found.');
        return { data: new Blob(['png'], { type: 'image/png' }) };
      },
    });
    renderTesterFeedback('/feedback?tab=problems');
    expect(await screen.findByText('Screenshot 1 could not be loaded.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry screenshot 1' }));
    expect(await screen.findByRole('img', { name: 'Screenshot 1' })).toBeVisible();
  });

  it('will not save a duplicate until the original report is picked, then sends it with the version check', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true, data: problemList.problems[0] } } as never);
    renderTesterFeedback('/feedback?tab=problems');
    const form = await openTriage();
    fireEvent.change(within(form).getByLabelText('Problem status'), { target: { value: 'duplicate' } });
    fireEvent.change(within(form).getByLabelText('Triage note'), { target: { value: 'Same Saturday time list bug as the other report.' } });

    expect(within(form).getByText('Pick the original report before saving.')).toBeVisible();
    expect(within(form).getByRole('button', { name: 'Save triage' })).toBeDisabled();

    const picker = within(form).getByLabelText('Same as another report');
    await waitFor(() => expect(picker).toBeEnabled());
    const options = within(picker).getAllByRole('option').map((option) => option.getAttribute('value'));
    expect(options).toEqual(['', PROBLEM_2]); // never itself
    expect(within(form).queryByText(/marked as the same as this one/)).toBeNull();
    expect(vi.mocked(api.get)).toHaveBeenCalledWith(`${V2}/problems`, { params: { page: 1, pageSize: 100 } });

    fireEvent.change(picker, { target: { value: PROBLEM_2 } });
    expect(within(form).queryByText('Pick the original report before saving.')).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Save triage' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`${V2}/problems/${PROBLEM_1}`, {
      status: 'duplicate',
      assignedAdminId: null,
      duplicateOf: PROBLEM_2,
      note: 'Same Saturday time list bug as the other report.',
      expectedUpdatedAt: '2026-10-12T02:30:00.000Z',
    }));
    expect(await within(form).findByText('Triage saved.')).toBeVisible();
  });

  it('requires an owner before a problem moves to triaged', async () => {
    renderTesterFeedback('/feedback?tab=problems');
    const form = await openTriage();
    fireEvent.change(within(form).getByLabelText('Problem status'), { target: { value: 'triaged' } });
    fireEvent.change(within(form).getByLabelText('Triage note'), { target: { value: 'Checked on a phone, it happens every time.' } });
    expect(within(form).getByText('Choose an owner for triaged, planned or done.')).toBeVisible();
    expect(within(form).getByRole('button', { name: 'Save triage' })).toBeDisabled();

    const owner = within(form).getByLabelText('Problem owner');
    await waitFor(() => expect(owner).toBeEnabled());
    expect(owner).not.toHaveAccessibleDescription();
    expect(within(form).queryByText(/A report at New has no owner/)).toBeNull();
    fireEvent.change(owner, { target: { value: 'agent-1' } });
    expect(within(form).getByRole('button', { name: 'Save triage' })).toBeEnabled();

    // Back to New: the owner is cleared and locked, as in the version 1 queue.
    fireEvent.change(within(form).getByLabelText('Problem status'), { target: { value: 'new' } });
    expect(owner).toHaveValue('');
    expect(owner).toBeDisabled();
    // The reason it is locked is on screen and read out with the picker.
    expect(within(form).getByText('A report at New has no owner. Choose another status to pick one.')).toBeVisible();
    expect(owner).toHaveAccessibleDescription('A report at New has no owner. Choose another status to pick one.');
  });

  it('starts the note box empty and shows the current note read-only, so a hidden copy is never saved back', async () => {
    const maskedNote = 'Called the tester on 0917***4567 to confirm.';
    mockV2Api({
      [`${V2}/problems`]: () => ({ data: { success: true, data: {
        ...problemList,
        problems: [problem({ status: 'dismissed', triageNote: maskedNote, updatedAt: '2026-10-12T05:00:00.000Z' }), problemList.problems[1]],
      } } }),
    });
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true, data: problemList.problems[0] } } as never);
    renderTesterFeedback('/feedback?tab=problems');
    const form = await openTriage();
    const box = within(form).getByLabelText('Triage note');
    expect(box).toHaveValue('');
    expect(within(form).getByTestId('fb2-current-note')).toHaveTextContent(maskedNote);

    // Changing only the status cannot save without a new note of its own.
    fireEvent.change(within(form).getByLabelText('Problem status'), { target: { value: 'new' } });
    expect(within(form).getByRole('button', { name: 'Save triage' })).toBeDisabled();
    fireEvent.change(box, { target: { value: 'Reopened: it happens again on 1.0.1.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save triage' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.patch).mock.calls[0]![1] as { note: string };
    expect(body.note).toBe('Reopened: it happens again on 1.0.1.');
    expect(body.note).not.toContain('***');
    expect(await within(form).findByText('Triage saved.')).toBeVisible();
    expect(box).toHaveValue('');
  });

  it('keeps the saved original selected even when it is not among the loaded reports', async () => {
    const elsewhere = '33333333-cccc-4ccc-8ccc-000000000003';
    mockV2Api({
      [`${V2}/problems`]: () => ({ data: { success: true, data: {
        ...problemList,
        problems: [problem({ status: 'duplicate', duplicateOf: elsewhere, triageNote: 'Same as the older report.' }), problemList.problems[1]],
      } } }),
    });
    renderTesterFeedback('/feedback?tab=problems');
    const form = await openTriage();
    const picker = within(form).getByLabelText('Same as another report');
    await waitFor(() => expect(picker).toBeEnabled());
    expect(picker).toHaveValue(elsewhere);
    expect(within(picker).getByRole('option', { name: 'Saved original: Report 33333333' })).toBeInTheDocument();
    expect(within(form).queryByText('Pick the original report before saving.')).toBeNull();
  });

  it('warns when other reports already point to this one before it is marked as a duplicate', async () => {
    mockV2Api({
      [`${V2}/problems`]: () => ({ data: { success: true, data: {
        ...problemList,
        problems: [
          problem(),
          problemList.problems[1],
          problem({ id: '44444444-dddd-4ddd-8ddd-000000000004', status: 'duplicate', duplicateOf: PROBLEM_1, screenshots: [] }),
        ],
        total: 3,
      } } }),
    });
    renderTesterFeedback('/feedback?tab=problems');
    const form = await openTriage();
    fireEvent.change(within(form).getByLabelText('Problem status'), { target: { value: 'duplicate' } });
    expect(await within(form).findByText(/1 other report is marked as the same as this one\./)).toBeVisible();
  });

  it('moves a page number past the end back to the last page that has reports', async () => {
    mockV2Api({
      [`${V2}/problems`]: (_url, init) => {
        const page = Number(init?.params?.page ?? 1);
        return { data: { success: true, data: page > 1 ? { total: 2, page, pageSize: 25, problems: [] } : problemList } };
      },
    });
    renderTesterFeedback('/feedback?tab=problems&problemPage=5');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/feedback?tab=problems'));
    expect(await firstCard()).toBeVisible();
    expect(screen.queryByText(/Page 5 of/)).toBeNull();
    expect(problemsCalls().at(-1)![1]).toEqual({ params: { status: undefined, severity: undefined, screenKey: undefined, page: 1, pageSize: 25 } });
  });

  it('the automatic move off a page past the end does not trap the Back button', async () => {
    mockV2Api({
      [`${V2}/problems`]: (_url, init) => {
        const page = Number(init?.params?.page ?? 1);
        return { data: { success: true, data: page > 1 ? { total: 2, page, pageSize: 25, problems: [] } : problemList } };
      },
    });
    renderTesterFeedback('/feedback?tab=problems&problemPage=5', ['/feedback?tab=testers']);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/feedback?tab=problems'));
    fireEvent.click(screen.getByTestId('browser-back'));
    // Back goes to where the admin came from, not to page 5 (which would move forward again).
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/feedback?tab=testers'));
  });

  it('shows the triage history with Manila times and who decided, naming "An admin" when the name is unknown', async () => {
    let calls = 0;
    mockV2Api({
      [`${V2}/problems/${PROBLEM_1}/history`]: () => {
        calls += 1;
        if (calls === 1) throw apiError(500, 'History is down.');
        return { data: { success: true, data: [
          {
            at: '2026-10-12T03:15:00.000Z', adminId: 'agent-1', adminName: 'Ana Reyes',
            from: { status: 'new', assignedAdminId: null, triageNote: null, duplicateOf: null },
            to: { status: 'triaged', assignedAdminId: 'agent-1', triageNote: 'Checked on Android 14, it happens every time.', duplicateOf: null },
          },
          {
            at: '2026-10-12T07:45:00.000Z', adminId: null, adminName: null,
            from: { status: 'triaged', assignedAdminId: 'agent-1', triageNote: 'Checked on Android 14, it happens every time.', duplicateOf: null },
            to: { status: 'duplicate', assignedAdminId: 'agent-1', triageNote: 'Same as the Saturday report.', duplicateOf: PROBLEM_2 },
          },
        ] } };
      },
    });
    renderTesterFeedback('/feedback?tab=problems');
    const card = await firstCard();
    const toggle = within(card).getByRole('button', { name: 'Show history' });
    expect(api.get).not.toHaveBeenCalledWith(`${V2}/problems/${PROBLEM_1}/history`);
    fireEvent.click(toggle);
    expect(within(card).getByRole('button', { name: 'Hide history' })).toHaveAttribute('aria-expanded', 'true');

    const history = within(card).getByRole('region', { name: 'History' });
    expect(within(history).getByText('Loading history…')).toBeVisible();
    expect(await within(history).findByText(/The history could not be loaded\. History is down\./)).toBeVisible();
    fireEvent.click(within(history).getByRole('button', { name: 'Retry history' }));

    const list = await within(history).findByRole('list', { name: 'Triage history, oldest first' });
    const items = within(list).getAllByRole('listitem').filter((item) => item.parentElement === list);
    expect(items).toHaveLength(2);
    // 03:15 UTC is 11:15 in Manila; 07:45 UTC is 3:45 PM in Manila.
    expect(items[0]).toHaveTextContent(/Ana Reyes, .*11:15.*\(Manila time\)/);
    expect(items[0]).toHaveTextContent('Status: New to Triaged');
    expect(items[0]).toHaveTextContent('Owner: Unassigned to Ana Reyes');
    expect(items[0]).toHaveTextContent('Note: Checked on Android 14, it happens every time.');
    expect(items[1]).toHaveTextContent(/An admin, .*3:45/);
    expect(items[1]).toHaveTextContent('Status: Triaged to Same as another report');
    expect(items[1]).toHaveTextContent('Marked as the same as Report 22222222');
  });

  it('says so when a problem has no triage history yet', async () => {
    mockV2Api({ [`${V2}/problems/${PROBLEM_1}/history`]: () => ({ data: { success: true, data: [] } }) });
    renderTesterFeedback('/feedback?tab=problems');
    const card = await firstCard();
    fireEvent.click(within(card).getByRole('button', { name: 'Show history' }));
    expect(await within(card).findByText('No triage changes yet.')).toBeVisible();
  });

  it('keeps the typed note after a 409 reload while showing the newer decision', async () => {
    let changedElsewhere = false;
    mockV2Api({
      [`${V2}/problems`]: () => ({ data: { success: true, data: changedElsewhere
        ? { ...problemList, problems: [problem({ status: 'triaged', assignedAdminId: 'agent-1', triageNote: 'Ana checked it on Android.', updatedAt: '2026-10-12T04:00:00.000Z' }), problemList.problems[1]] }
        : problemList } }),
    });
    vi.mocked(api.patch).mockImplementation((async () => {
      changedElsewhere = true;
      throw apiError(409, 'This problem changed after you opened it. Reload it to see the newer decision.');
    }) as never);
    renderTesterFeedback('/feedback?tab=problems');
    const form = await openTriage();
    fireEvent.change(within(form).getByLabelText('Problem status'), { target: { value: 'dismissed' } });
    fireEvent.change(within(form).getByLabelText('Triage note'), { target: { value: 'Not reproducible on the current build.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save triage' }));
    fireEvent.click(await within(form).findByRole('button', { name: 'Reload problems' }));

    await waitFor(() => expect(within(form).getByTestId('fb2-current-note')).toHaveTextContent('Ana checked it on Android.'));
    expect(within(form).getByLabelText('Problem status')).toHaveValue('triaged');
    expect(within(form).getByLabelText('Triage note')).toHaveValue('Not reproducible on the current build.');
    expect(within(form).getByText('The newer decision is shown above. Your note is still in the box. Check it, then save again.')).toBeVisible();
  });

  it('explains a 409 conflict and reloads the problems on request', async () => {
    vi.mocked(api.patch).mockRejectedValue(apiError(409, 'This problem changed after you opened it. Reload it to see the newer decision.'));
    renderTesterFeedback('/feedback?tab=problems');
    const form = await openTriage();
    fireEvent.change(within(form).getByLabelText('Problem status'), { target: { value: 'dismissed' } });
    fireEvent.change(within(form).getByLabelText('Triage note'), { target: { value: 'Not reproducible on the current build.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save triage' }));

    expect(await within(form).findByText('Someone changed this problem after you opened it. Reload to see their decision, then try again.')).toBeVisible();
    const before = problemsCalls().length;
    fireEvent.click(within(form).getByRole('button', { name: 'Reload problems' }));
    await waitFor(() => expect(problemsCalls().length).toBeGreaterThan(before));
    await waitFor(() => expect(within(form).queryByText(/Someone changed this problem/)).toBeNull());
  });

  it('shows a filtered empty state, and an error with Retry', async () => {
    let calls = 0;
    mockV2Api({
      [`${V2}/problems`]: () => {
        calls += 1;
        if (calls === 1) throw apiError(500, 'Database unavailable.');
        return { data: { success: true, data: { total: 0, page: 1, pageSize: 25, problems: [] } } };
      },
    });
    renderTesterFeedback('/feedback?tab=problems&severity=annoyed');
    expect(await screen.findByText('Problem reports unavailable')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No problems match these filters.')).toBeVisible();
  });
});
