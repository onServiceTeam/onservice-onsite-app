// Tester feedback v2 (Ken, 2026-10-12): the /feedback route is now tabs.
// "Earlier feedback" must still render the version 1 queue, and the tabs must
// work from the mouse and the keyboard and survive a reload through the URL.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { V2, mockV2Api, renderTesterFeedback } from './tester-feedback-v2-fixtures';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

describe('Tester feedback v2 tabs', () => {
  beforeEach(() => mockV2Api());

  it('renders the version 1 queue under Earlier feedback, with one page heading', async () => {
    renderTesterFeedback('/feedback?tab=earlier');
    expect(screen.getByRole('tab', { name: 'Earlier feedback' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Earlier feedback (old form)', level: 2 })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await screen.findByText('Payment redirect left the customer stuck.', { selector: 'p.line-clamp-2' })).toBeVisible();
    expect(screen.getByRole('button', { name: /^New/ })).toBeVisible();
    expect(api.get).toHaveBeenCalledWith('/api/v1/admin/feedback', expect.objectContaining({
      params: expect.objectContaining({ status: 'new', page: 1, pageSize: 25 }),
    }));
    // The version 2 numbers are not fetched while the old queue is open.
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url === `${V2}/overview`)).toBe(false);
  });

  it('switches tabs with the mouse and records the tab in the URL', async () => {
    renderTesterFeedback();
    await screen.findByText('3 of 7 finished');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Earlier feedback' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/feedback?tab=earlier'));
    expect(await screen.findByRole('heading', { name: 'Earlier feedback (old form)' })).toBeVisible();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }), { button: 0, ctrlKey: false });
    // The tab is always written out. The old queue's own selection stays, so
    // going back to Earlier feedback reopens the same report; without an
    // explicit tab, that feedbackId would reopen Earlier feedback on reload.
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/feedback?tab=overview&feedbackId=feedback-1'));
    expect(await screen.findByText('3 of 7 finished')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reloading the URL left by choosing Overview stays on Overview', async () => {
    renderTesterFeedback('/feedback?tab=overview&feedbackId=feedback-1');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('3 of 7 finished')).toBeVisible();
  });

  it('opens Earlier feedback and that exact report for an old link with a feedbackId and no tab', async () => {
    renderTesterFeedback('/feedback?feedbackId=feedback-1');
    expect(screen.getByRole('tab', { name: 'Earlier feedback' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: 'Customer tester', level: 2 })).toBeVisible();
    expect(api.get).toHaveBeenCalledWith('/api/v1/admin/feedback/feedback-1');
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url === `${V2}/overview`)).toBe(false);
    // The tab is written into the URL, so a reload stays on Earlier feedback.
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/feedback?feedbackId=feedback-1&tab=earlier'));
  });

  it('opens Earlier feedback for an old queue link with its own filters and page', async () => {
    renderTesterFeedback('/feedback?status=triaged&page=2');
    expect(screen.getByRole('tab', { name: 'Earlier feedback' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/admin/feedback', expect.objectContaining({
      params: expect.objectContaining({ status: 'triaged', page: 2 }),
    })));
  });

  it('still opens Overview for a plain link, and an explicit tab wins over old queue parameters', async () => {
    const first = renderTesterFeedback('/feedback');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    first.unmount();
    renderTesterFeedback('/feedback?tab=problems&feedbackId=feedback-1');
    expect(screen.getByRole('tab', { name: 'Problems' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves between tabs with the arrow keys', async () => {
    renderTesterFeedback();
    const overview = screen.getByRole('tab', { name: 'Overview' });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    const problems = screen.getByRole('tab', { name: 'Problems' });
    await waitFor(() => expect(problems).toHaveFocus());
    await waitFor(() => expect(problems).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByLabelText('How bad')).toBeVisible();
  });
});
