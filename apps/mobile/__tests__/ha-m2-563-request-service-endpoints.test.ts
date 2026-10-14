// HA-M2-563 (D38 Milestone 2, package P5b): src/services/request.service.ts
// (merged plan 2.6) calls the committed endpoints with the methods and
// bodies the API routes expect, and reads each response shape (including the
// job-requests list, which the route returns without a data wrapper).
import api from '@/services/api';
import {
  acceptQuote,
  declineQuote,
  getBookingQuotes,
  getConfirmPreview,
  getCustomerRequestSummary,
  getMyQuotes,
  getProviderJobRequest,
  getProviderJobRequests,
  getProviderRequestSummary,
  getRequestStatus,
  submitQuote,
  withdrawQuote,
} from '@/services/request.service';

it('HA-M2-563: every request.service function hits its committed endpoint and reads its response shape', async () => {
  const get = jest.mocked(api.get);
  const post = jest.mocked(api.post);
  get.mockReset();
  post.mockReset();
  get.mockImplementation((async (url: string) => {
    if (url === '/api/v1/providers/me/job-requests') {
      return { data: { success: true, requests: [{ id: 'r-1' }], total: 1, page: 1, pageSize: 50 } };
    }
    if (url === '/api/v1/providers/me/quotes') {
      return { data: { success: true, data: [{ quoteId: 'q-1' }], meta: { page: 1, pageSize: 50, total: 7 } } };
    }
    if (url === '/api/v1/bookings/requests/summary') return { data: { success: true, data: { awaitingDecisionCount: 2 } } };
    if (url === '/api/v1/providers/me/job-requests/summary') {
      return { data: { success: true, data: { openCount: 4, unseenCount: 3, quotesWaitingCount: 1, isAvailable: false } } };
    }
    return { data: { success: true, data: { url } } };
  }) as never);
  post.mockImplementation((async (url: string) => ({ data: { success: true, data: { url } } })) as never);

  expect(await getRequestStatus('b 1')).toEqual({ url: '/api/v1/bookings/b%201/request-status' });
  expect(await getCustomerRequestSummary()).toEqual({ awaitingDecisionCount: 2 });
  expect(await getConfirmPreview('b1', 'q1')).toEqual({ url: '/api/v1/bookings/b1/quotes/q1/confirm-preview' });
  expect(await getProviderJobRequest('b1')).toEqual({ url: '/api/v1/providers/me/job-requests/b1' });
  expect(await getProviderRequestSummary()).toEqual({ openCount: 4, unseenCount: 3, quotesWaitingCount: 1, isAvailable: false });
  expect(await getProviderJobRequests(2)).toEqual({ requests: [{ id: 'r-1' }], total: 1, page: 1, pageSize: 50 });
  expect(get).toHaveBeenCalledWith('/api/v1/providers/me/job-requests', { params: { page: 2, pageSize: 50 } });
  expect(await getMyQuotes('declined', 1)).toEqual({ quotes: [{ quoteId: 'q-1' }], total: 7, page: 1, pageSize: 50 });
  expect(get).toHaveBeenCalledWith('/api/v1/providers/me/quotes', { params: { status: 'declined', page: 1, pageSize: 50 } });
  // A non-array answer reads as no quotes rather than crashing a screen.
  expect(await getBookingQuotes('b1')).toEqual([]);

  await acceptQuote('b1', 'q1');
  expect(post).toHaveBeenLastCalledWith('/api/v1/bookings/b1/quotes/q1/accept', {});
  await declineQuote('b1', 'q1', { reason: 'other', note: '  ' });
  expect(post).toHaveBeenLastCalledWith('/api/v1/bookings/b1/quotes/q1/decline', { reason: 'other' });
  await declineQuote('b1', 'q1', { reason: 'too_expensive', note: ' Too much for one unit. ' });
  expect(post).toHaveBeenLastCalledWith('/api/v1/bookings/b1/quotes/q1/decline', { reason: 'too_expensive', note: 'Too much for one unit.' });
  await withdrawQuote('b1', 'q1');
  expect(post).toHaveBeenLastCalledWith('/api/v1/bookings/b1/quotes/q1/withdraw', {});
  const payload = { quotedPrice: 150000, description: 'Clean one unit and the drain line.', earliestDate: '2026-10-15', earliestTimeWindow: 'evening' as const };
  await submitQuote('b1', payload);
  expect(post).toHaveBeenLastCalledWith('/api/v1/bookings/b1/quotes', payload);
});
