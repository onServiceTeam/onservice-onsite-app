import { resolveTrustProxyHops } from '../src/config/boot-guards';

describe('trust proxy configuration', () => {
  it('Bug CRIT-M05 — proxy hops default to one and invalid or non-positive overrides disable trust', () => {
    expect(resolveTrustProxyHops({})).toBe(1);
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '0' })).toBeNull();
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '-1' })).toBeNull();
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: 'not-a-number' })).toBeNull();
  });
});
