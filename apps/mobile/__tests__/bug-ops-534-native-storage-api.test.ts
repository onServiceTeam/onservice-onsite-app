/**
 * Exercise the installed MMKV v4 JavaScript surface, not our old v3-shaped
 * global mock. MMKV itself substitutes in-memory storage under Jest; this
 * verifies application API compatibility, not device encryption or persistence.
 */
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: { createHybridObject: jest.fn(() => { throw new Error('Unexpected native call'); }) },
}), { virtual: true });

jest.mock('react-native-mmkv', () => {
  const path = require('node:path');
  const root = path.dirname(require.resolve('react-native-mmkv/package.json'));
  const actual = jest.requireActual(path.join(root, 'lib/index.js'));
  return { ...actual, createMMKV: jest.fn(actual.createMMKV) };
});

jest.mock('@/services/device-fingerprint.service', () => ({
  getDeviceFingerprint: jest.fn().mockResolvedValue('synthetic-device'),
}));

import * as SecureStore from 'expo-secure-store';

it('Bug OPS-534 — native auth, legacy migration cache and preferences use the installed MMKV API', async () => {
  const mmkv = require('react-native-mmkv');
  const auth = jest.requireActual('../src/services/secure-storage');
  const existingKey = 'synthetic-existing-device-key';
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(existingKey);
  auth.__resetForTests();

  await auth.initSecureStorage();
  expect(mmkv.createMMKV).toHaveBeenCalledWith({
    id: 'onservice-auth-secure', encryptionKey: existingKey,
  });
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  auth.storeTokens('synthetic-access', 'synthetic-refresh');
  auth.storeUser(JSON.stringify({ id: 'synthetic-customer' }));
  expect(auth.getAccessToken()).toBe('synthetic-access');
  expect(auth.getRefreshToken()).toBe('synthetic-refresh');
  expect(JSON.parse(auth.getStoredUser())).toEqual({ id: 'synthetic-customer' });
  auth.clearTokens();
  auth.clearStoredUser();
  expect(auth.getAccessToken()).toBeUndefined();
  expect(auth.getRefreshToken()).toBeUndefined();
  expect(auth.getStoredUser()).toBeUndefined();

  const { storage } = jest.requireActual('../src/services/api');
  storage.set('hasOnboarded', true);
  storage.set('accessToken', 'synthetic-legacy-access');
  const legacy = mmkv.createMMKV.mock.results.find(
    (result: { value?: { id?: string } }) => result.value?.id === 'onservice-auth',
  )?.value;
  // Reading the underlying instance detects a silent in-memory fallback.
  expect(legacy?.getString('accessToken')).toBe('synthetic-legacy-access');
  expect(storage.getBoolean('hasOnboarded')).toBe(true);
  storage.delete('accessToken');
  expect(legacy.getString('accessToken')).toBeUndefined();

  const publicStore = jest.requireActual('../src/services/secure-storage.service');
  publicStore.setPublicItem('theme', 'light');
  expect(publicStore.getPublicItem('theme')).toBe('light');
  publicStore.removePublicItem('theme');
  expect(publicStore.getPublicItem('theme')).toBeUndefined();
  expect(() => publicStore.storeTokens('must-not-write', 'must-not-write'))
    .toThrow('DEPRECATED');
});
