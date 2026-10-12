// Tester feedback v2 (Ken, 2026-10-12): the Overview tab renders the
// study numbers from GET /overview, flags weak missions in words, explains
// the usability score, and opens Problems filtered to a screen.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  V2, apiError, mockV2Api, overview, renderTesterFeedback,
} from './tester-feedback-v2-fixtures';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

function overviewWith(changes: Record<string, unknown>) {
  return () => ({ data: { success: true, data: { ...overview, ...changes } } });
}

describe('Tester feedback v2 overview', () => {
  beforeEach(() => mockV2Api());

  it('opens on the Overview tab inside a keyboard tab list of four views', async () => {
    renderTesterFeedback();
    const tablist = screen.getByRole('tablist', { name: 'Tester feedback views' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Problems', 'Testers', 'Earlier feedback']);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('3 of 7 finished')).toBeVisible();
  });

  it('renders testers, mission results and problem screens from the overview numbers', async () => {
    renderTesterFeedback();
    expect(await screen.findByText('3 of 7 finished')).toBeVisible();
    const testers = screen.getByRole('region', { name: 'Testers so far' });
    expect(within(testers).getByText('Customer side').nextSibling).toHaveTextContent('4');
    expect(within(testers).getByText('Provider side').nextSibling).toHaveTextContent('2');
    expect(within(testers).getByText('Both sides').nextSibling).toHaveTextContent('1');

    const aircon = screen.getByTestId('fb2-mission-c_aircon');
    expect(within(aircon).getByRole('rowheader')).toHaveTextContent('Aircon cleaning');
    expect(aircon).toHaveTextContent('50% (2 of 4)');
    expect(aircon).toHaveTextContent('4.2 / 7 (from 4 answers)');
    const unanswered = screen.getByTestId('fb2-mission-p_hours');
    expect(within(unanswered).getAllByText('No answers yet')).toHaveLength(2);

    const rows = within(screen.getByRole('table', { name: 'Problem reports grouped by screen' })).getAllByRole('row').slice(1);
    // Most different testers first, whatever order the API used.
    expect(rows[0]).toHaveTextContent('Choosing a booking time');
    expect(within(rows[0]!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['3', '3', '2', '1', '0', '0']);
    expect(rows[1]).toHaveTextContent('Somewhere else / not sure');
    expect(screen.getByRole('columnheader', { name: 'It stopped me' })).toBeVisible();
  });

  it('makes each overview card a page region named by its heading', async () => {
    renderTesterFeedback();
    await screen.findByText('3 of 7 finished');
    for (const name of ['Testers so far', 'Missions', 'Usability score', 'Problems by screen']) {
      const region = screen.getByRole('region', { name });
      expect(region.tagName).toBe('SECTION');
      expect(within(region).getByRole('heading', { name, level: 2 })).toBeVisible();
    }
  });

  it('flags low ease and low completion in words, and leaves healthy missions unflagged', async () => {
    renderTesterFeedback();
    const aircon = await screen.findByTestId('fb2-mission-c_aircon');
    expect(within(aircon).getByText('Low ease')).toBeVisible();
    expect(within(aircon).getByText('Low completion')).toBeVisible();
    const leak = screen.getByTestId('fb2-mission-c_leak');
    expect(within(leak).queryByText('Low ease')).toBeNull();
    expect(within(leak).queryByText('Low completion')).toBeNull();
  });

  it('shows the usability score with how to read it, and warns it is not reliable under 5 answers', async () => {
    renderTesterFeedback();
    expect(await screen.findByTestId('fb2-sus-average')).toHaveTextContent('61.7 out of 100');
    expect(screen.getByText('From 3 testers. Lowest 45, highest 77.5.')).toBeVisible();
    expect(screen.getByText('How to read it: 68 is about average for apps. Above 80 is good. Below 50 means serious problems.')).toBeVisible();
    expect(screen.getByText('Fewer than 5 testers have answered, so this number is not reliable yet.')).toBeVisible();
  });

  it('drops the reliability warning at 5 answers and hides the reading guide when nobody has answered', async () => {
    mockV2Api({ [`${V2}/overview`]: overviewWith({ sus: { responses: 5, average: 70, lowest: 50, highest: 85 } }) });
    const first = renderTesterFeedback();
    expect(await screen.findByTestId('fb2-sus-average')).toHaveTextContent('70 out of 100');
    expect(screen.queryByText(/not reliable yet/)).toBeNull();
    first.unmount();

    mockV2Api({ [`${V2}/overview`]: overviewWith({ sus: { responses: 0, average: null, lowest: null, highest: null } }) });
    renderTesterFeedback();
    expect(await screen.findByText('No tester has finished the wrap-up yet.')).toBeVisible();
    expect(screen.queryByText(/How to read it/)).toBeNull();
  });

  it('opens the Problems tab filtered to a screen when that screen is clicked', async () => {
    renderTesterFeedback();
    fireEvent.click(await screen.findByRole('button', { name: /Choosing a booking time/ }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Problems' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByTestId('location')).toHaveTextContent('/feedback?tab=problems&screen=booking_time');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`${V2}/problems`, {
      params: { status: undefined, severity: undefined, screenKey: 'booking_time', page: 1, pageSize: 25 },
    }));
    expect(screen.getByLabelText('Screen')).toHaveValue('booking_time');
  });

  it('shows the empty message with the link to send testers when nobody has answered', async () => {
    mockV2Api({
      [`${V2}/overview`]: overviewWith({
        sessions: { total: 0, completed: 0, byRole: { customer: 0, provider: 0, both: 0 } },
        missions: [], problemsByScreen: [], sus: { responses: 0, average: null, lowest: null, highest: null },
      }),
      [`${V2}/sessions`]: () => ({ data: { success: true, data: { total: 0, page: 1, pageSize: 1, sessions: [] } } }),
    });
    renderTesterFeedback();
    expect(await screen.findByText('No tester answers yet.')).toBeVisible();
    expect(screen.getByText('Send testers app.onservice.ph/feedback.')).toBeVisible();
    expect(screen.queryByText(/marked as junk/)).toBeNull();
  });

  it('says every tester is marked as junk when the Overview is empty only because of junk', async () => {
    mockV2Api({
      [`${V2}/overview`]: overviewWith({
        sessions: { total: 0, completed: 0, byRole: { customer: 0, provider: 0, both: 0 } },
        missions: [], problemsByScreen: [], sus: { responses: 0, average: null, lowest: null, highest: null },
      }),
      [`${V2}/sessions`]: () => ({ data: { success: true, data: { total: 2, page: 1, pageSize: 1, sessions: [] } } }),
    });
    renderTesterFeedback();
    expect(await screen.findByText('Every tester so far is marked as junk.')).toBeVisible();
    expect(screen.getByText('2 testers are marked as junk, so the Overview has no numbers to show. Open the Testers tab to review them or restore one.')).toBeVisible();
    expect(screen.queryByText('No tester answers yet.')).toBeNull();
    expect(api.get).toHaveBeenCalledWith(`${V2}/sessions`, { params: { page: 1, pageSize: 1 } });
  });

  it('shows an error with Retry, and Retry loads the numbers', async () => {
    let calls = 0;
    mockV2Api({
      [`${V2}/overview`]: () => {
        calls += 1;
        if (calls === 1) throw apiError(500, 'The server had a problem.');
        return { data: { success: true, data: overview } };
      },
    });
    renderTesterFeedback();
    expect(await screen.findByText('Tester results unavailable')).toBeVisible();
    expect(screen.getByText('The server had a problem.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('3 of 7 finished')).toBeVisible();
  });
});
