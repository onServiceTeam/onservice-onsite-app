jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { markNpcNotified } from '../src/services/breach-log.service';
import {
  getTxCalls,
  makeRouter,
  resetDbMock,
  setTxQueryImpl,
} from './helpers/d06-tx-mock';

it('Bug UX-812 — a breach record preserves the exact NPC reference issued for the notification', async () => {
  const now = new Date('2026-08-31T00:00:00.000Z');
  const breachId = '11111111-1111-1111-1111-111111111111';
  const adminUserId = '22222222-2222-2222-2222-222222222222';
  const reference = 'NPC BN 18-146';
  resetDbMock();
  setTxQueryImpl(makeRouter([
    {
      match: /SELECT \* FROM breach_log WHERE id = \$1 FOR UPDATE/,
      rows: [{
        id: breachId,
        type: 'data_exposure',
        scope: 'Exposure under regulator review',
        affected_user_count: 4,
        occurred_at: now,
        discovered_at: now,
        npc_notified_at: null,
        npc_reference: null,
        status: 'investigating',
        reported_by: adminUserId,
        remediation_summary: null,
        created_at: now,
        updated_at: now,
      }],
    },
    {
      match: /UPDATE breach_log/,
      rows: [{
        id: breachId,
        type: 'data_exposure',
        scope: 'Exposure under regulator review',
        affected_user_count: 4,
        occurred_at: now,
        discovered_at: now,
        npc_notified_at: now,
        npc_reference: reference,
        status: 'reported',
        reported_by: adminUserId,
        remediation_summary: null,
        created_at: now,
        updated_at: now,
      }],
    },
    { match: /INSERT INTO admin_actions/, rows: [] },
  ]));

  const result = await markNpcNotified({ breachId, adminUserId, npcReference: reference });

  expect(result.npcReference).toBe(reference);
  const update = getTxCalls().find((call) => /UPDATE breach_log/.test(call.sql));
  expect(update?.params).toEqual([breachId, reference]);
  const audit = getTxCalls().find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(String(audit?.params[2])).toContain(reference);
});
