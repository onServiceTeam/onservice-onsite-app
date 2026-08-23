/**
 * D26 step 1 — unit tests for the admin chat-moderation service and the
 * participant-facing reportMessage path. Mocks db.query so each test is
 * hermetic. Covers:
 *   - admin conversation list (mapping, totals)
 *   - admin thread read bypasses the participant filter + writes a
 *     'conversation_viewed' audit row
 *   - moderation queue scope conditions + stats
 *   - redact: reason guard, 404, sets redaction + 'message_redacted' audit
 *   - review flag: 404, 'message_flag_reviewed' audit
 *   - reportMessage: 404, 403 (non-participant), success flags + reopens review
 *   - participant-facing formatMessage hides redacted content
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

import * as adminSvc from '../src/services/messaging-admin.service';
import * as msgSvc from '../src/services/messaging.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  dbTransactionMock.mockImplementation(
    (cb: (client: { query: (...args: unknown[]) => unknown }) => unknown) =>
      cb({ query: (...args: unknown[]) => dbQueryMock(...args) }),
  );
});

function rows<T>(data: T[]): { rows: T[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const ADMIN_ID = '33333333-3333-3333-3333-333333333333';
const CONV_ID = '11111111-1111-1111-1111-111111111111';
const MSG_ID = '22222222-2222-2222-2222-222222222222';
const BOOKING_ID = '44444444-4444-4444-4444-444444444444';
const CUSTOMER_ID = '55555555-5555-5555-5555-555555555555';
const PROVIDER_ID = '66666666-6666-6666-6666-666666666666';

// ─── listConversationsForAdmin ───────────────────────────────────────────────

describe('listConversationsForAdmin', () => {
  it('maps rows, truncates the preview, and returns the total', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '2' }])).mockResolvedValueOnce(
      rows([
        {
          id: CONV_ID,
          booking_id: BOOKING_ID,
          customer_id: CUSTOMER_ID,
          provider_id: PROVIDER_ID,
          is_active: true,
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-02T00:00:00Z'),
          customer_first: 'Joe',
          customer_last: 'Cust',
          provider_first: 'Jane',
          provider_last: 'Pro',
          message_count: '5',
          flagged_open: '1',
          reported_open: '0',
          last_message_at: new Date('2026-01-02T00:00:00Z'),
          last_message_preview: 'x'.repeat(200),
        },
      ]),
    );

    const out = await adminSvc.listConversationsForAdmin({ filter: 'all' });
    expect(out.total).toBe(2);
    expect(out.conversations).toHaveLength(1);
    expect(out.conversations[0]).toMatchObject({
      id: CONV_ID,
      customerName: 'Joe Cust',
      providerName: 'Jane Pro',
      flaggedOpen: 1,
      messageCount: 5,
    });
    // Preview is truncated to 120 chars.
    expect((out.conversations[0]!.lastMessagePreview as string).length).toBe(120);
  });

  it('flagged filter adds an EXISTS clause on unreviewed flagged messages', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '0' }])).mockResolvedValueOnce(rows([]));
    await adminSvc.listConversationsForAdmin({ filter: 'flagged' });
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    expect(countSql).toMatch(/EXISTS/);
    expect(countSql).toMatch(/is_flagged = TRUE AND m\.flag_reviewed_at IS NULL/);
  });
});

// ─── getConversationThreadForAdmin ───────────────────────────────────────────

describe('getConversationThreadForAdmin', () => {
  it('404s when the conversation is missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(adminSvc.getConversationThreadForAdmin(CONV_ID, ADMIN_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('returns the thread (no participant filter) and writes a conversation_viewed audit row', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([
          {
            id: CONV_ID,
            booking_id: BOOKING_ID,
            customer_id: CUSTOMER_ID,
            provider_id: PROVIDER_ID,
            is_active: true,
            created_at: new Date('2026-01-01T00:00:00Z'),
            updated_at: new Date('2026-01-02T00:00:00Z'),
            customer_first: 'Joe',
            customer_last: 'Cust',
            provider_first: 'Jane',
            provider_last: 'Pro',
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: MSG_ID,
            conversation_id: CONV_ID,
            sender_id: CUSTOMER_ID,
            content: 'call me on viber',
            message_type: 'text',
            image_url: null,
            is_read: true,
            is_flagged: true,
            flag_reviewed_at: null,
            reported_at: null,
            report_reason: null,
            redacted_at: null,
            redacted_by: null,
            redaction_reason: null,
            created_at: new Date('2026-01-01T01:00:00Z'),
            sender_first: 'Joe',
            sender_last: 'Cust',
            sender_role: 'customer',
          },
        ]),
      )
      .mockResolvedValueOnce(rows([])); // admin_actions INSERT

    const out = await adminSvc.getConversationThreadForAdmin(CONV_ID, ADMIN_ID);
    expect(out.messages as unknown[]).toHaveLength(1);
    // Admin sees the ORIGINAL (flagged) content, not a masked version.
    expect((out.messages as Record<string, unknown>[])[0]!.content).toBe('call me on viber');
    expect((out.messages as Record<string, unknown>[])[0]!.isFlagged).toBe(true);

    // The conversation thread SELECT had no customer_id/provider_id filter.
    expect(dbQueryMock.mock.calls[0][0] as string).not.toMatch(/customer_id = \$2 OR provider_id/);

    // Last call is the audit insert.
    const auditCall = dbQueryMock.mock.calls[2];
    expect(auditCall[0]).toMatch(/INSERT INTO admin_actions/);
    expect(auditCall[1][1]).toBe('conversation_viewed');
    expect(auditCall[1][2]).toBe(BOOKING_ID);
  });
});

// ─── listModerationQueue + stats ─────────────────────────────────────────────

describe('listModerationQueue', () => {
  it('reported scope filters on reported_at + unreviewed', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '0' }])).mockResolvedValueOnce(rows([]));
    await adminSvc.listModerationQueue({ scope: 'reported' });
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    expect(countSql).toMatch(/reported_at IS NOT NULL AND m\.flag_reviewed_at IS NULL/);
  });

  it('default scope includes both flagged and reported', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '0' }])).mockResolvedValueOnce(rows([]));
    await adminSvc.listModerationQueue({});
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    expect(countSql).toMatch(/is_flagged = TRUE OR m\.reported_at IS NOT NULL/);
  });
});

describe('getModerationStats', () => {
  it('returns open flagged + reported counts as numbers', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ open_flagged: '3', open_reported: '1' }]));
    const out = await adminSvc.getModerationStats();
    expect(out).toEqual({ openFlagged: 3, openReported: 1 });
  });
});

// ─── redactMessage ───────────────────────────────────────────────────────────

describe('redactMessage', () => {
  it('rejects a too-short reason before touching the DB', async () => {
    await expect(adminSvc.redactMessage(MSG_ID, ADMIN_ID, 'x')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('404s when the message is missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(
      adminSvc.redactMessage(MSG_ID, ADMIN_ID, 'abusive language'),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('Bug UX-016 — redacts and audits the moderation action atomically', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ booking_id: BOOKING_ID, already: null }]))
      .mockResolvedValueOnce(
        rows([
          {
            id: MSG_ID,
            conversation_id: CONV_ID,
            sender_id: CUSTOMER_ID,
            content: 'original',
            message_type: 'text',
            image_url: null,
            is_read: true,
            is_flagged: true,
            flag_reviewed_at: new Date('2026-01-03T00:00:00Z'),
            reported_at: null,
            report_reason: null,
            redacted_at: new Date('2026-01-03T00:00:00Z'),
            redacted_by: ADMIN_ID,
            redaction_reason: 'abusive language',
            created_at: new Date('2026-01-01T01:00:00Z'),
            sender_first: '',
            sender_last: '',
            sender_role: '',
          },
        ]),
      )
      .mockResolvedValueOnce(rows([])); // admin_actions INSERT

    const out = await adminSvc.redactMessage(MSG_ID, ADMIN_ID, 'abusive language');
    expect(out.redactedAt).not.toBeNull();
    expect(out.redactionReason).toBe('abusive language');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    const auditCall = dbQueryMock.mock.calls[2];
    expect(auditCall[0]).toMatch(/INSERT INTO admin_actions/);
    expect(auditCall[1][1]).toBe('message_redacted');
  });
});

// ─── reviewFlag ──────────────────────────────────────────────────────────────

describe('reviewFlag', () => {
  it('404s when the message is missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(adminSvc.reviewFlag(MSG_ID, ADMIN_ID, 'no violation')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('marks the flag reviewed and writes a message_flag_reviewed audit row', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ booking_id: BOOKING_ID }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));
    const out = await adminSvc.reviewFlag(MSG_ID, ADMIN_ID, 'no violation found');
    expect(out).toEqual({ reviewed: true });
    const auditCall = dbQueryMock.mock.calls[2];
    expect(auditCall[1][1]).toBe('message_flag_reviewed');
  });
});

// ─── reportMessage (participant-facing) ──────────────────────────────────────

describe('reportMessage', () => {
  it('404s when the message is missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(msgSvc.reportMessage(MSG_ID, CUSTOMER_ID, 'spam')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('403s when the reporter is not a participant', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([{ customer_id: CUSTOMER_ID, provider_id: PROVIDER_ID }]),
    );
    await expect(msgSvc.reportMessage(MSG_ID, 'someone-else', 'spam')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('flags + records the report and reopens review when a participant reports', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ customer_id: CUSTOMER_ID, provider_id: PROVIDER_ID }]))
      .mockResolvedValueOnce(rows([]));
    await msgSvc.reportMessage(MSG_ID, CUSTOMER_ID, 'harassment');
    const updateCall = dbQueryMock.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE messages/);
    expect(updateCall[0]).toMatch(/is_flagged = TRUE/);
    expect(updateCall[0]).toMatch(/flag_reviewed_at = NULL/);
    expect(updateCall[1]).toEqual([MSG_ID, CUSTOMER_ID, 'harassment']);
  });
});

// ─── participant-facing redaction hiding ─────────────────────────────────────

describe('formatMessage redaction', () => {
  it('hides content + image of a redacted message from participants', () => {
    const out = msgSvc.formatMessage({
      id: MSG_ID,
      conversation_id: CONV_ID,
      sender_id: CUSTOMER_ID,
      content: 'the original text',
      message_type: 'text',
      image_url: 'https://x/y.jpg',
      is_read: true,
      is_flagged: true,
      created_at: new Date('2026-01-01T01:00:00Z'),
      redacted_at: new Date('2026-01-03T00:00:00Z'),
    });
    expect(out.content).toBe('This message was removed by a moderator.');
    expect(out.imageUrl).toBeNull();
    expect(out.redacted).toBe(true);
  });

  it('passes through a normal message unchanged', () => {
    const out = msgSvc.formatMessage({
      id: MSG_ID,
      conversation_id: CONV_ID,
      sender_id: CUSTOMER_ID,
      content: 'hello',
      message_type: 'text',
      image_url: null,
      is_read: false,
      is_flagged: false,
      created_at: new Date('2026-01-01T01:00:00Z'),
      redacted_at: null,
    });
    expect(out.content).toBe('hello');
    expect(out.redacted).toBe(false);
  });
});
