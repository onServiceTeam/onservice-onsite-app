// Bug 1271 verified — sms.service uses native fetch (CRIT-N14 fix).
//
// Pre-fix: import axios from 'axios'; axios.post(SEMAPHORE_API_URL, ...).
// Post-fix: globalThis.fetch(SEMAPHORE_API_URL, { method: 'POST', ... }).
//
// These tests exercise the sendSms function with a mocked global fetch
// and assert on the actual request shape.

const fetchMock = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = fetchMock;

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { sendSms } from '../src/services/sms.service';
import { logger } from '../src/utils/logger';

const loggerMock = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
};

beforeEach(() => {
  fetchMock.mockReset();
  loggerMock.info.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();
  delete process.env.SEMAPHORE_API_KEY;
  delete process.env.SEMAPHORE_SENDER_NAME;
  delete process.env.NODE_ENV;
});

describe('Bug 1271 + CRIT-N14 — sms.service uses native fetch', () => {
  it('Bug 1271 — POSTs to Semaphore via globalThis.fetch (not axios)', async () => {
    process.env.SEMAPHORE_API_KEY = 'test-key';
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{
        message_id: 12345,
        user_id: 1,
        user: 'test',
        account_id: 1,
        account: 'test',
        recipient: '639171234567',
        message: 'hello',
        sender_name: 'onService',
        network: 'globe',
        status: 'sent',
        type: 'sms',
        source: 'api',
        created_at: '2026-05-02',
        updated_at: '2026-05-02',
      }]), { status: 200 }));

    const result = await sendSms('+639171234567', 'hello');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.semaphore.co/api/v4/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      apikey: 'test-key',
      number: '639171234567',
      message: 'hello',
      sendername: 'onService',
    });
  });

  it('CRIT-N14 — returns false on non-2xx response (does not throw)', async () => {
    process.env.SEMAPHORE_API_KEY = 'test-key';
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => [],
    });

    const result = await sendSms('+639171234567', 'hello');

    expect(result).toBe(false);
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Semaphore returned non-2xx status',
      expect.objectContaining({ status: 500 }),
    );
  });

  it('CRIT-N14 — returns false on fetch network error', async () => {
    process.env.SEMAPHORE_API_KEY = 'test-key';
    fetchMock.mockRejectedValueOnce(new Error('Network down'));

    const result = await sendSms('+639171234567', 'hello');

    expect(result).toBe(false);
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Failed to send SMS via Semaphore',
      expect.objectContaining({ error: 'transport_or_receipt_error' }),
    );
  });

  it('CRIT-N12 + MED-N143 — dev-mode log does NOT include OTP message body', async () => {
    // No SEMAPHORE_API_KEY → falls into dev-mode log path.
    process.env.NODE_ENV = 'development';

    const result = await sendSms('+639171234567', 'Your code is 123456');

    expect(result).toBe(true);
    // The dev log MUST NOT contain the literal "123456" — that was the
    // pre-fix leak (full message body in logs).
    const allLogCalls = loggerMock.info.mock.calls.flat();
    const stringified = JSON.stringify(allLogCalls);
    expect(stringified).not.toContain('123456');
    expect(stringified).not.toContain('Your code is');
    // But the log should still record the send for ops visibility.
    expect(loggerMock.info).toHaveBeenCalledWith(
      '[DEV SMS] sent',
      expect.objectContaining({
        phoneSuffix: '4567',
        messageLength: 19,
      }),
    );
  });

  it('CRIT-N14 — returns false in non-dev when SEMAPHORE_API_KEY is missing', async () => {
    process.env.NODE_ENV = 'production';

    const result = await sendSms('+639171234567', 'hello');

    expect(result).toBe(false);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'SEMAPHORE_API_KEY not set — SMS not sent',
      expect.objectContaining({ phone: '4567' }),
    );
  });
});
