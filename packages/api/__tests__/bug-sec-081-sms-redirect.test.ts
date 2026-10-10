jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { sendOtpSms } from '../src/services/sms.service';
import { openSmsEndpoint, withSmsProvider, smsPhone, smsCode, smsKey, smsReceipt } from './helpers/sms-http';

it('Bug SEC-081 - a provider redirect cannot forward an SMS credential or code to another destination', async () => {
  const receiver = await openSmsEndpoint(response => response.end(JSON.stringify([smsReceipt])));
  const results: boolean[] = [];
  try {
    for (const status of [301, 302, 303, 307, 308]) {
      await withSmsProvider(response => response.writeHead(status, { Location: `${receiver.origin}/redirect` }).end(), async endpoint => {
        results.push(await sendOtpSms(smsPhone, smsCode));
        expect(endpoint.requests).toHaveLength(1);
        expect(JSON.parse(endpoint.requests[0]!.body)).toMatchObject({ apikey: smsKey, number: smsPhone.slice(1) });
      });
    }
    // Inspect all outcomes/requests together, so the original failure preserves
    // the real redirected POST body as well as the false success results.
    expect({ results, forwarded: receiver.requests }).toEqual({ results: [false, false, false, false, false], forwarded: [] });
  } finally {
    await receiver.close();
  }
});
