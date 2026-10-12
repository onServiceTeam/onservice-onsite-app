// Tester feedback v2 (Ken, 2026-10-12): the Testers tab lists sessions and
// shows one tester's whole session in order. Only super admins see a
// tester's name and contact; anyone can mark a session as junk with a reason;
// only super admins can delete a tester's answers.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  SESSION_A, V2, apiError, mockV2Api, renderTesterFeedback, sessionDetail, sessionList,
} from './tester-feedback-v2-fixtures';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const auth = vi.hoisted(() => ({ role: 'super_admin' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = { isAuthenticated: true, user: { id: 'admin-1', role: auth.role } };
    return selector ? selector(state) : state;
  },
}));

describe('Tester feedback v2 testers', () => {
  beforeEach(() => {
    auth.role = 'super_admin';
    mockV2Api();
  });

  it('lists tester sessions and opens one in place', async () => {
    renderTesterFeedback('/feedback?tab=testers');
    const table = await screen.findByRole('table', { name: 'Tester sessions' });
    const row = within(table).getAllByRole('row')[1]!;
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Customer side', 'Phone, Android app', '1.0.1', '1', '1', 'Yes', 'Finished',
    ]);
    expect(api.get).toHaveBeenCalledWith(`${V2}/sessions`, { params: { page: 1, pageSize: 25 } });

    fireEvent.click(within(row).getByRole('button', { name: 'Tester a1b2c3' }));
    expect(await screen.findByRole('heading', { name: 'Tester a1b2c3', level: 2 })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(`tab=testers&tester=${SESSION_A}`);
  });

  it('shows the whole session in order with labelled answers, usability answers, score and prices', async () => {
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    await screen.findByRole('heading', { name: 'Tester a1b2c3', level: 2 });
    const sections = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(sections.filter((name) => ['First impression', 'Missions (1)', 'Problems (1)', 'Wrap-up'].includes(name ?? '')))
      .toEqual(['First impression', 'Missions (1)', 'Problems (1)', 'Wrap-up']);

    const first = screen.getByRole('region', { name: 'First impression' });
    expect(within(first).getByText('What do you think this app is for?').nextSibling).toHaveTextContent('Booking cleaners and repairs');

    const missions = screen.getByRole('region', { name: 'Missions (1)' });
    expect(within(missions).getByRole('heading', { name: 'Aircon cleaning' })).toBeVisible();
    expect(within(missions).getByText('Did they manage it?').nextSibling).toHaveTextContent('Partly');
    expect(within(missions).getByText('Ease').nextSibling).toHaveTextContent('3 / 7');
    expect(within(missions).getByText('Why did you give that score?').nextSibling).toHaveTextContent('Saturday was hard to find');

    const problems = screen.getByRole('region', { name: 'Problems (1)' });
    expect(within(problems).getByText('It stopped me')).toBeVisible();
    expect(within(problems).getByText('The time list stayed empty')).toBeVisible();

    const wrapup = screen.getByRole('region', { name: 'Wrap-up' });
    expect(within(wrapup).getByText('72.5 out of 100')).toBeVisible();
    const sus = within(wrapup).getByRole('table', { name: "Usability statements and this tester's answers" });
    const susRows = within(sus).getAllByRole('row').slice(1);
    expect(susRows).toHaveLength(10);
    expect(susRows[1]).toHaveTextContent('I found the app more complicated than it needs to be.2');
    expect(within(wrapup).getByText('Would you use this instead of how you get help today? Why or why not?').nextSibling)
      .toHaveTextContent('Maybe, if workers are checked');
    expect(within(wrapup).getByText('A good deal').nextSibling).toHaveTextContent('₱600');
  });

  it('hides the tester name and contact from an ordinary admin, showing only that a name or contact was given', async () => {
    auth.role = 'admin';
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    await screen.findByRole('heading', { name: 'Tester a1b2c3', level: 2 });
    expect(screen.queryByText('Maria Santos')).toBeNull();
    expect(screen.queryByText('09171234567')).toBeNull();
    // The API sets hasContact when a name OR a contact was given.
    expect(screen.getByText('Name or contact').nextSibling).toHaveTextContent('Name or contact given');
    expect(screen.getByText(/Only super admins can see names and contact details/)).toBeVisible();
  });

  it('shows the tester name and contact to a super admin', async () => {
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    await screen.findByRole('heading', { name: 'Tester a1b2c3', level: 2 });
    expect(screen.getByText('Name').nextSibling).toHaveTextContent('Maria Santos');
    expect(screen.getByText('Contact').nextSibling).toHaveTextContent('09171234567');
    expect(screen.queryByText('Name or contact given')).toBeNull();
  });

  it('says no name or contact was given when the tester gave neither', async () => {
    auth.role = 'admin';
    mockV2Api({
      [`${V2}/sessions/${SESSION_A}`]: () => ({
        data: { success: true, data: { ...sessionDetail, session: { ...sessionDetail.session, testerName: null, testerContact: null, hasContact: false } } },
      }),
    });
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    await screen.findByRole('heading', { name: 'Tester a1b2c3', level: 2 });
    expect(screen.getByText('Name or contact').nextSibling).toHaveTextContent('No name or contact given');
  });

  it('shows the app version on each problem in a tester session', async () => {
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    const problems = await screen.findByRole('region', { name: 'Problems (1)' });
    expect(within(problems).getByText(/App version 1\.0\.1/)).toBeVisible();
  });

  it('makes the tester summary a page region named by the tester label', async () => {
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    const region = await screen.findByRole('region', { name: 'Tester a1b2c3' });
    expect(region.tagName).toBe('SECTION');
  });

  it('does not offer an ordinary admin the button to delete a tester\'s answers', async () => {
    auth.role = 'admin';
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    await screen.findByRole('heading', { name: 'Tester a1b2c3', level: 2 });
    expect(screen.getByRole('button', { name: 'Mark as junk' })).toBeVisible();
    expect(screen.queryByRole('button', { name: "Delete this tester's answers" })).toBeNull();
  });

  it('lets a super admin delete a tester\'s answers after naming what goes and a required reason, then returns to the list', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true, data: { entries: 4, screenshots: 1 } } } as never);
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    await screen.findByRole('heading', { name: 'Tester a1b2c3', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: "Delete this tester's answers" }));

    const dialog = await screen.findByRole('dialog', { name: "Delete Tester a1b2c3's answers?" });
    const items = within(within(dialog).getByRole('list', { name: 'What will be deleted' })).getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual([
      '4 saved answers (first impression, 1 mission, 1 problem report, wrap-up)',
      '1 screenshot',
      'their device details, and any name or contact they gave',
    ]);
    expect(within(dialog).getByText(/It cannot be undone\./)).toBeVisible();
    const confirm = within(dialog).getByRole('button', { name: 'Delete for good' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Reason for deleting'), { target: { value: 'short' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Reason for deleting'), { target: { value: 'The tester emailed asking us to delete their answers.' } });
    fireEvent.click(confirm);

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(`${V2}/sessions/${SESSION_A}`, {
      body: { note: 'The tester emailed asking us to delete their answers.' },
    }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/feedback?tab=testers'));
    expect(await screen.findByText("Tester a1b2c3's answers were deleted: 4 saved answers and 1 screenshot.")).toBeVisible();
    expect(await screen.findByRole('table', { name: 'Tester sessions' })).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the delete dialog open and shows the reason when the delete is refused', async () => {
    vi.mocked(api.delete).mockRejectedValue(apiError(403, 'Only super admins can delete tester answers.'));
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    await screen.findByRole('heading', { name: 'Tester a1b2c3', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: "Delete this tester's answers" }));
    const dialog = await screen.findByRole('dialog', { name: "Delete Tester a1b2c3's answers?" });
    fireEvent.change(within(dialog).getByLabelText('Reason for deleting'), { target: { value: 'The tester asked by email on 12 October.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete for good' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Only super admins can delete tester answers.');
    expect(screen.getByTestId('location').textContent).toContain(`tester=${SESSION_A}`);
  });

  it('moves a tester page number past the end back to the last page', async () => {
    mockV2Api({
      [`${V2}/sessions`]: (_url, init) => {
        const page = Number(init?.params?.page ?? 1);
        return { data: { success: true, data: page > 1 ? { total: 1, page, pageSize: 25, sessions: [] } : sessionList } };
      },
    });
    renderTesterFeedback('/feedback?tab=testers&testerPage=4');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/feedback?tab=testers'));
    const table = await screen.findByRole('table', { name: 'Tester sessions' });
    expect(within(table).getByRole('button', { name: 'Tester a1b2c3' })).toBeVisible();
  });

  it('marks a session as junk only after a confirmed reason, then reloads it', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true } } as never);
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    await screen.findByRole('heading', { name: 'Tester a1b2c3', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as junk' }));

    const dialog = await screen.findByRole('dialog', { name: 'Mark this tester as junk?' });
    // Junk testers drop out of the Overview only; their problems stay listed.
    expect(within(dialog).getByText('Their answers will be left out of the Overview numbers. Their problem reports stay on the Problems tab. You can restore them later.')).toBeVisible();
    expect(within(dialog).queryByText(/every number/)).toBeNull();
    const confirm = within(dialog).getByRole('button', { name: 'Mark as junk' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Reason for this change'), { target: { value: 'Typed random letters in every box.' } });
    const detailCalls = () => vi.mocked(api.get).mock.calls.filter(([url]) => url === `${V2}/sessions/${SESSION_A}`).length;
    const before = detailCalls();
    fireEvent.click(confirm);

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`${V2}/sessions/${SESSION_A}`, {
      dismissed: true,
      note: 'Typed random letters in every box.',
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(detailCalls()).toBeGreaterThan(before));
  });

  it('offers Restore for a session already marked as junk', async () => {
    mockV2Api({
      [`${V2}/sessions/${SESSION_A}`]: () => ({
        data: { success: true, data: { ...sessionDetail, session: { ...sessionDetail.session, status: 'dismissed' } } },
      }),
    });
    renderTesterFeedback(`/feedback?tab=testers&tester=${SESSION_A}`);
    expect(await screen.findByText('Marked as junk')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restore this tester?' });
    expect(within(dialog).getByText('Their answers will count in the Overview numbers again.')).toBeVisible();
  });
});
