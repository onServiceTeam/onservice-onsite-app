import { MMKV } from 'react-native-mmkv';

const ENCRYPTION_KEY = 'onservice-secure-v1';

const secureStorage = new MMKV({
  id: 'onservice-secure',
  encryptionKey: ENCRYPTION_KEY,
});

const publicStorage = new MMKV({
  id: 'onservice-public',
});

export function setSecureItem(key: string, value: string): void {
  secureStorage.set(key, value);
}

export function getSecureItem(key: string): string | undefined {
  return secureStorage.getString(key);
}

export function removeSecureItem(key: string): void {
  secureStorage.delete(key);
}

export function setPublicItem(key: string, value: string): void {
  publicStorage.set(key, value);
}

export function getPublicItem(key: string): string | undefined {
  return publicStorage.getString(key);
}

export function removePublicItem(key: string): void {
  publicStorage.delete(key);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  secureStorage.set('auth:accessToken', accessToken);
  secureStorage.set('auth:refreshToken', refreshToken);
}

export function getAccessToken(): string | undefined {
  return secureStorage.getString('auth:accessToken');
}

export function getRefreshToken(): string | undefined {
  return secureStorage.getString('auth:refreshToken');
}

export function clearTokens(): void {
  secureStorage.delete('auth:accessToken');
  secureStorage.delete('auth:refreshToken');
}

export function clearAll(): void {
  secureStorage.clearAll();
  publicStorage.clearAll();
}

export { secureStorage, publicStorage };
