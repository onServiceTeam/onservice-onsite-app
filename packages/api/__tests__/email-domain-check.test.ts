const resolveMx = jest.fn();
jest.mock('node:dns', () => ({ promises: { resolveMx: (domain: string) => resolveMx(domain) } }));

import { checkDomainAcceptsMail, clearDomainCheckCache } from '../src/services/email-domain-check.service';

// D37: emailing a domain that takes no mail produces a bounce, and bounces
// damage the sender reputation that keeps every later code out of spam.
// The DNS resolver is the only substitute here.

const dnsError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => { resolveMx.mockReset(); clearDomainCheckCache(); });

it('D37 - a domain with a usable MX record accepts mail', async () => {
  resolveMx.mockResolvedValue([{ exchange: 'alt1.gmail-smtp-in.l.google.com', priority: 10 }]);
  await expect(checkDomainAcceptsMail('Gmail.com')).resolves.toBe('accepts_mail');
  expect(resolveMx).toHaveBeenCalledWith('gmail.com');
});

it('D37 - no such domain, no MX records and a null MX all mean no mail', async () => {
  resolveMx.mockRejectedValueOnce(dnsError('ENOTFOUND'));
  await expect(checkDomainAcceptsMail('gmial.com')).resolves.toBe('no_mail');
  resolveMx.mockRejectedValueOnce(dnsError('ENODATA'));
  await expect(checkDomainAcceptsMail('test.ph')).resolves.toBe('no_mail');
  resolveMx.mockResolvedValueOnce([{ exchange: '', priority: 0 }]);
  await expect(checkDomainAcceptsMail('nullmx.example.net.ph')).resolves.toBe('no_mail');
  resolveMx.mockResolvedValueOnce([]);
  await expect(checkDomainAcceptsMail('empty.ph')).resolves.toBe('no_mail');
});

it('D37 - DNS trouble never blocks a sign-in and is not remembered', async () => {
  resolveMx.mockRejectedValueOnce(dnsError('ESERVFAIL'));
  await expect(checkDomainAcceptsMail('yahoo.com')).resolves.toBe('unknown');
  resolveMx.mockResolvedValueOnce([{ exchange: 'mta5.am0.yahoodns.net', priority: 1 }]);
  await expect(checkDomainAcceptsMail('yahoo.com')).resolves.toBe('accepts_mail');
  expect(resolveMx).toHaveBeenCalledTimes(2);
});

it('D37 - a slow resolver gives up after 3 seconds as unknown', async () => {
  jest.useFakeTimers();
  try {
    resolveMx.mockReturnValue(new Promise(() => undefined));
    const pending = checkDomainAcceptsMail('slow.ph');
    await jest.advanceTimersByTimeAsync(2999);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('unknown');
  } finally { jest.useRealTimers(); }
});

it('D37 - reserved test names never receive mail and are not looked up', async () => {
  for (const domain of ['example.com', 'mail.example.org', 'example.invalid', 'localhost', 'shop.test', 'x.local', '']) {
    await expect(checkDomainAcceptsMail(domain)).resolves.toBe('no_mail');
  }
  expect(resolveMx).not.toHaveBeenCalled();
});

it('D37 - definite answers are remembered for ten minutes', async () => {
  jest.useFakeTimers();
  try {
    resolveMx.mockResolvedValue([{ exchange: 'mx.onservice.example.ph', priority: 10 }]);
    await checkDomainAcceptsMail('outlook.com');
    await checkDomainAcceptsMail('OUTLOOK.com');
    expect(resolveMx).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10 * 60_000 + 1);
    await checkDomainAcceptsMail('outlook.com');
    expect(resolveMx).toHaveBeenCalledTimes(2);
  } finally { jest.useRealTimers(); }
});
