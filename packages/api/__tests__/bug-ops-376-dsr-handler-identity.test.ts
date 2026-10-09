const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listDsrs } from '../src/services/compliance.service';

it('Bug OPS-376 — DSR operations return the human identity of the current handler', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ cnt: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'dsr-1',
        user_id: 'customer-1',
        user_email: 'customer@example.test',
        user_role: 'customer',
        provider_profile_id: null,
        request_type: 'correction',
        status: 'in_progress',
        received_at: new Date('2026-09-01T00:00:00.000Z'),
        due_at: new Date('2026-09-16T00:00:00.000Z'),
        completed_at: null,
        handled_by: 'dpo-1',
        handler_name: 'Maria Santos',
        handler_email: 'maria@onservice.ph',
        user_message: 'Please correct my surname.',
        admin_notes: null,
        response_payload_url: null,
        rejection_reason: null,
      }],
      rowCount: 1,
    });

  const result = await listDsrs({ limit: 25, offset: 0 });

  expect(result.rows[0]).toMatchObject({
    handledBy: 'dpo-1',
    handledByName: 'Maria Santos',
    handledByEmail: 'maria@onservice.ph',
  });
  const rowSql = queryMock.mock.calls[1][0] as string;
  expect(rowSql).toMatch(/LEFT JOIN users handler ON handler\.id = dsr\.handled_by/);
});
