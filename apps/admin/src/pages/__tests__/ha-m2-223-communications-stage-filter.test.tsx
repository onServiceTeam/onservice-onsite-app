// HA-M2-223 (Milestone 2, P6-M2): the Communications stage filter asks the
// admin conversation list for one stage (GET /api/v1/admin/conversations
// accepts stage=request|booking; messaging-admin.validators). "All stages"
// sends no stage at all, so older API builds keep working.
import { expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { mockCommunicationsApi, renderCommunicationsPage } from './communications-test-fixtures';

it('HA-M2-223: choosing a thread stage sends stage=request to the admin conversation list', async () => {
  mockCommunicationsApi();
  renderCommunicationsPage();

  fireEvent.click(await screen.findByRole('button', { name: 'All conversations' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/admin/conversations', {
    params: { filter: 'all', search: undefined, page: 1, pageSize: 25 },
  }));
  const listCalls = (): Array<Record<string, unknown>> => vi.mocked(api.get).mock.calls
    .filter(([url]) => url === '/api/v1/admin/conversations')
    .map(([, options]) => (options as { params: Record<string, unknown> }).params);
  expect(listCalls().every((params) => !('stage' in params))).toBe(true);

  fireEvent.change(screen.getByRole('combobox', { name: 'Filter conversations by thread stage' }), {
    target: { value: 'request' },
  });

  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/admin/conversations', {
    params: { filter: 'all', search: undefined, page: 1, pageSize: 25, stage: 'request' },
  }));
});
