// Browser implementation of the legacy public-storage bridge.
//
// The native module uses MMKV for non-sensitive device state. Importing that
// module in an Expo web bundle constructs the native-only MMKV class at module
// load and leaves the whole customer/provider app blank. Browser builds use
// localStorage for the same public values and keep the deprecated secure APIs
// fail-closed.

const PUBLIC_PREFIX = 'onservice-public:';
const publicMemory = new Map<string, string>();

function browserStorage(): globalThis.Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
}

function deprecated(): never {
  throw new Error(
    'secure-storage.service is deprecated for secure values. Use @/services/secure-storage.',
  );
}

function setPublicValue(key: string, value: string): void {
  const storage = browserStorage();
  if (storage) storage.setItem(PUBLIC_PREFIX + key, value);
  else publicMemory.set(key, value);
}

function getPublicValue(key: string): string | undefined {
  const storage = browserStorage();
  const value = storage ? storage.getItem(PUBLIC_PREFIX + key) : publicMemory.get(key);
  return value ?? undefined;
}

function removePublicValue(key: string): void {
  const storage = browserStorage();
  if (storage) storage.removeItem(PUBLIC_PREFIX + key);
  else publicMemory.delete(key);
}

function clearPublicValues(): void {
  publicMemory.clear();
  const storage = browserStorage();
  if (!storage) return;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(PUBLIC_PREFIX)) storage.removeItem(key);
  }
}

export function setSecureItem(_key: string, _value: string): void { deprecated(); }
export function getSecureItem(_key: string): string | undefined { return deprecated(); }
export function removeSecureItem(_key: string): void { deprecated(); }
export function storeTokens(_accessToken: string, _refreshToken: string): void { deprecated(); }
export function getAccessToken(): string | undefined { return deprecated(); }
export function getRefreshToken(): string | undefined { return deprecated(); }
export function clearTokens(): void { deprecated(); }

export function setPublicItem(key: string, value: string): void {
  setPublicValue(key, value);
}

export function getPublicItem(key: string): string | undefined {
  return getPublicValue(key);
}

export function removePublicItem(key: string): void {
  removePublicValue(key);
}

export function clearAll(): void {
  clearPublicValues();
}

export const publicStorage = {
  set: (key: string, value: string | boolean): void => setPublicValue(key, String(value)),
  getString: getPublicValue,
  getBoolean: (key: string): boolean | undefined => {
    const value = getPublicValue(key);
    return value === undefined ? undefined : value === 'true';
  },
  delete: removePublicValue,
  clearAll: clearPublicValues,
};

// Kept for compatibility with old type imports. Secure calls remain blocked.
export const secureStorage = {
  set: (_key: string, _value: string | boolean): void => deprecated(),
  getString: (_key: string): string | undefined => undefined,
  getBoolean: (_key: string): boolean | undefined => undefined,
  delete: (_key: string): void => undefined,
  clearAll: (): void => undefined,
};
