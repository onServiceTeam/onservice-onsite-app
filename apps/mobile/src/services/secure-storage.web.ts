// apps/mobile/src/services/secure-storage.web.ts
//
// Phase 200 — WEB variant of secure-storage (metro picks .web.ts on web).
// The native build (secure-storage.ts) uses encrypted MMKV + the OS keychain,
// neither of which exists in a browser. On web we back the same API with
// localStorage. This is intended for the staging/test browser build (demo
// data, no real money). A production web product would need a hardened
// token-storage strategy (httpOnly cookies / short-lived tokens), not this.

const PREFIX = 'onservice-auth-secure:';
const mem = new Map<string, string>(); // SSR / no-localStorage fallback

function store(): globalThis.Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function initSecureStorage(): Promise<void> {
  // No async keychain setup needed on web.
}

export function __resetForTests(): void {
  mem.clear();
  const s = store();
  if (s) {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) s.removeItem(k);
    }
  }
}

export function getSecureItem(key: string): string | undefined {
  const s = store();
  const v = s ? s.getItem(PREFIX + key) : mem.get(key);
  return v ?? undefined;
}

export function setSecureItem(key: string, value: string): void {
  const s = store();
  if (s) s.setItem(PREFIX + key, value);
  else mem.set(key, value);
}

export function removeSecureItem(key: string): void {
  const s = store();
  if (s) s.removeItem(PREFIX + key);
  else mem.delete(key);
}

export function getAccessToken(): string | undefined { return getSecureItem('accessToken'); }
export function getRefreshToken(): string | undefined { return getSecureItem('refreshToken'); }
export function storeTokens(accessToken: string, refreshToken: string): void {
  setSecureItem('accessToken', accessToken);
  setSecureItem('refreshToken', refreshToken);
}
export function clearTokens(): void {
  removeSecureItem('accessToken');
  removeSecureItem('refreshToken');
}
export function getStoredUser(): string | undefined { return getSecureItem('user'); }
export function storeUser(userJson: string): void { setSecureItem('user', userJson); }
export function clearStoredUser(): void { removeSecureItem('user'); }
