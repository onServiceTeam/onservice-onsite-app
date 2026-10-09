jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { sendOtpSms } from '../src/services/sms.service';
import { logger } from '../src/utils/logger';
import { withSmsProvider, smsPhone, smsCode, smsKey } from './helpers/sms-http';

it('Bug SEC-082 - malformed provider JSON cannot leak its echoed credential into SMS error diagnostics', async () => {
  jest.clearAllMocks();
  await withSmsProvider(response => response.end(`${smsKey} ${smsPhone} ${smsCode}`), async endpoint => {
    expect(await sendOtpSms(smsPhone, smsCode)).toBe(false);
    expect(endpoint.requests).toHaveLength(1);
  });
  const diagnostics = JSON.stringify(jest.mocked(logger.error).mock.calls);
  expect(diagnostics).not.toContain('privatekey');
  expect(diagnostics).not.toContain(smsCode);
  expect(diagnostics).not.toContain(smsPhone);
  expect(logger.error).toHaveBeenCalledWith('Failed to send SMS via Semaphore', {
    phone: smsPhone.slice(-4), error: 'transport_or_receipt_error',
  });
});
