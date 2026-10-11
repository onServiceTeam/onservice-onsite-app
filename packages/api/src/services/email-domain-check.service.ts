import { promises as dns } from 'node:dns';

/**
 * D37: refuse to email a domain that cannot receive mail.
 *
 * Bounces from typo domains (gmial.com) or dead domains count against our
 * sender reputation, and a damaged reputation sends every later code to spam.
 * A domain is accepted only if it publishes at least one usable MX record.
 * DNS trouble (timeout, server failure) does NOT block a sign-in: only a
 * definite "no such domain" or "no MX records" answer does.
 */

export type DomainMailStatus = 'accepts_mail' | 'no_mail' | 'unknown';

const LOOKUP_TIMEOUT_MS = 3000;
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { status: DomainMailStatus; at: number }>();

// Reserved names (RFC 2606 / RFC 6761) never receive mail.
const RESERVED = /(^|\.)(example\.(com|net|org)|example|invalid|localhost|test|local)$/i;

export async function checkDomainAcceptsMail(domain: string): Promise<DomainMailStatus> {
  const key = domain.trim().toLowerCase();
  if (!key || RESERVED.test(key)) return 'no_mail';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.status;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: DomainMailStatus;
  try {
    const records = await Promise.race([
      dns.resolveMx(key),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), LOOKUP_TIMEOUT_MS);
      }),
    ]);
    // A "null MX" (RFC 7505: a single record with an empty exchange) means
    // the domain explicitly accepts no mail.
    status = records.some(record => record.exchange && record.exchange !== '.') ? 'accepts_mail' : 'no_mail';
  } catch (error) {
    const code = (error as { code?: string }).code;
    status = code === 'ENOTFOUND' || code === 'ENODATA' ? 'no_mail' : 'unknown';
  } finally {
    if (timer) clearTimeout(timer);
  }
  // Do not remember a transient failure.
  if (status !== 'unknown') cache.set(key, { status, at: Date.now() });
  return status;
}

/** Test seam only. */
export function clearDomainCheckCache(): void {
  cache.clear();
}
