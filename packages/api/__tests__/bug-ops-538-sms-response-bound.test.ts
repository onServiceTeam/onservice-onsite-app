jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { setTimeout as delay } from 'node:timers/promises';
import { sendOtpSms } from '../src/services/sms.service';
import { withSmsProvider, smsPhone, smsCode, smsReceipt } from './helpers/sms-http';

it('Bug OPS-538 - phone-code submission stops waiting for missing headers or an unfinished receipt', async () => {
  const outcomes: { phase: string; result: boolean | string; closed: number; sends: number }[] = [];
  for (const phase of ['headers', 'body']) {
    let pending: Promise<boolean> | undefined;
    await withSmsProvider(response => {
      if (phase === 'body') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.write('[');
      }
      // Deliberately never send headers/end for headers, or end the body.
    }, async endpoint => {
      pending = sendOtpSms(smsPhone, smsCode);
      const observer = new AbortController();
      const result = await Promise.race([
        pending,
        delay(12_000, 'observer_deadline', { signal: observer.signal }),
      ]).finally(() => observer.abort());
      // Observe actual peer close, not only the returned false or a signal bit.
      for (let attempt = 0; attempt < 20 && endpoint.closedResponses() === 0; attempt++) await delay(10);
      outcomes.push({ phase, result, closed: endpoint.closedResponses(), sends: endpoint.requests.length });
    });
    await pending; // settle original work after owned fixture shutdown too
  }
  expect(outcomes).toEqual([
    { phase: 'headers', result: false, closed: 1, sends: 1 },
    { phase: 'body', result: false, closed: 1, sends: 1 },
  ]);
}, 30000);

it('bounds actual response bytes when content-length is absent', async () => {
  // A valid-looking receipt padded beyond the cap must not be accepted. No
  // Content-Length header is supplied, so only actual streamed bytes count.
  const results: boolean[] = [];
  for (const body of [JSON.stringify([{ ...smsReceipt, extra: 'x'.repeat(5000) }]), ' '.repeat(5000) + JSON.stringify([smsReceipt])]) {
    await withSmsProvider(response => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write(body);
      response.end();
    }, async endpoint => {
      results.push(await sendOtpSms(smsPhone, smsCode));
      expect(endpoint.requests).toHaveLength(1);
    });
  }
  expect(results).toEqual([false, false]);
});

it('continues to acknowledge a complete matching receipt inside the response bounds', async () => {
  await withSmsProvider(response => response.end(JSON.stringify([smsReceipt])), async endpoint => {
    expect(await sendOtpSms(smsPhone, smsCode)).toBe(true);
    expect(endpoint.requests).toHaveLength(1);
  });
});

it('accepts the exact byte boundary but cancels an oversized unfinished stream', async () => {
  const receipt = JSON.stringify([smsReceipt]);
  await withSmsProvider(response => response.end(receipt.padEnd(4096, ' ')), async () => {
    expect(await sendOtpSms(smsPhone, smsCode)).toBe(true);
  });
  let pending: Promise<boolean> | undefined;
  let observed: boolean | string = 'not_started';
  let closed = 0;
  await withSmsProvider(response => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write(receipt.padEnd(4097, ' '));
    // This stream does not end. The byte bound, not the 10-second deadline,
    // must end consumption and close the peer before the observer fires.
  }, async endpoint => {
    pending = sendOtpSms(smsPhone, smsCode);
    const observer = new AbortController();
    observed = await Promise.race([pending, delay(1500, 'observer_deadline', { signal: observer.signal })])
      .finally(() => observer.abort());
    for (let attempt = 0; attempt < 20 && endpoint.closedResponses() === 0; attempt++) await delay(10);
    closed = endpoint.closedResponses();
    expect(endpoint.requests).toHaveLength(1);
  });
  await pending;
  expect({ observed, closed }).toEqual({ observed: false, closed: 1 });
});

it('cancels a rejected response body without consuming private error content or retrying', async () => {
  await withSmsProvider(response => {
    response.writeHead(429, { 'Content-Type': 'application/json' });
    response.write('{"error":"');
  }, async endpoint => {
    expect(await sendOtpSms(smsPhone, smsCode)).toBe(false);
    for (let attempt = 0; attempt < 20 && endpoint.closedResponses() === 0; attempt++) await delay(10);
    expect(endpoint.closedResponses()).toBe(1);
    expect(endpoint.requests).toHaveLength(1);
  });
});
