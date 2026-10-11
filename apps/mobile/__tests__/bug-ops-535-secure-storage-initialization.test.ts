/**
 * Runs the real initializer and installed MMKV JavaScript with synthetic OS
 * keychain responses. Proves single-flight/retry behavior, not native disk
 * encryption, process-death recovery or an installed-app upgrade.
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

import * as SecureStore from 'expo-secure-store';
import { createMMKV } from 'react-native-mmkv';

const auth = jest.requireActual<typeof import('../src/services/secure-storage')>(
  '../src/services/secure-storage',
);
const getKey = jest.mocked(SecureStore.getItemAsync);
const saveKey = jest.mocked(SecureStore.setItemAsync);
const createStorage = jest.mocked(createMMKV);

afterEach(() => {
  auth.__resetForTests();
  jest.clearAllMocks();
});

it('Bug OPS-535 — overlapping secure-storage initialization shares one key and retries failed setup without replacing an existing key', async () => {
  let persistedKey: string | null = null;
  getKey.mockImplementation(async () => persistedKey);
  saveKey.mockImplementation(async (_name, key) => { persistedKey = key; });

  await Promise.all([auth.initSecureStorage(), auth.initSecureStorage(), auth.initSecureStorage()]);
  expect({
    keyReads: getKey.mock.calls.length,
    keyWrites: saveKey.mock.calls.length,
    storageInstances: createStorage.mock.calls.length,
    distinctStorageKeys: new Set(createStorage.mock.calls.map(([config]) => config?.encryptionKey)).size,
  }).toEqual({ keyReads: 1, keyWrites: 1, storageInstances: 1, distinctStorageKeys: 1 });
  expect(persistedKey).toHaveLength(44);
  expect(createStorage).toHaveBeenCalledWith({
    id: 'onservice-auth-secure', encryptionKey: persistedKey,
  });
  auth.storeTokens('synthetic-access', 'synthetic-refresh');
  await auth.initSecureStorage();
  expect(getKey).toHaveBeenCalledTimes(1);
  expect(createStorage).toHaveBeenCalledTimes(1);
  expect(auth.getAccessToken()).toBe('synthetic-access');
  expect(auth.getRefreshToken()).toBe('synthetic-refresh');

  // A new JS initialization must read the saved key, never rotate it.
  const originalKey = persistedKey;
  auth.__resetForTests();
  jest.clearAllMocks();
  await Promise.all([auth.initSecureStorage(), auth.initSecureStorage()]);
  expect(getKey).toHaveBeenCalledTimes(1);
  expect(saveKey).not.toHaveBeenCalled();
  expect(createStorage).toHaveBeenCalledTimes(1);
  expect(createStorage).toHaveBeenCalledWith({
    id: 'onservice-auth-secure', encryptionKey: originalKey,
  });

  // Failed keychain reads must reject every waiter, create nothing, and allow
  // a later attempt to use the unchanged saved key.
  auth.__resetForTests();
  jest.clearAllMocks();
  const readFailure = new Error('synthetic keychain unavailable');
  getKey.mockRejectedValueOnce(readFailure);
  const readResults = await Promise.allSettled([auth.initSecureStorage(), auth.initSecureStorage()]);
  expect(readResults).toEqual([
    { status: 'rejected', reason: readFailure },
    { status: 'rejected', reason: readFailure },
  ]);
  expect(getKey).toHaveBeenCalledTimes(1);
  expect(saveKey).not.toHaveBeenCalled();
  expect(createStorage).not.toHaveBeenCalled();
  expect(() => auth.getAccessToken()).toThrow('not initialized');
  await auth.initSecureStorage();
  expect(persistedKey).toBe(originalKey);
  expect(saveKey).not.toHaveBeenCalled();
  expect(createStorage).toHaveBeenLastCalledWith({
    id: 'onservice-auth-secure', encryptionKey: originalKey,
  });

  // Failed first-key persistence must never expose a store using an unsaved
  // key. A retry may create a key only because no key was persisted.
  auth.__resetForTests();
  jest.clearAllMocks();
  persistedKey = null;
  const writeFailure = new Error('synthetic keychain write failure');
  saveKey.mockRejectedValueOnce(writeFailure);
  const writeResults = await Promise.allSettled([auth.initSecureStorage(), auth.initSecureStorage()]);
  expect(writeResults).toEqual([
    { status: 'rejected', reason: writeFailure },
    { status: 'rejected', reason: writeFailure },
  ]);
  expect(persistedKey).toBeNull();
  expect(saveKey).toHaveBeenCalledTimes(1);
  expect(createStorage).not.toHaveBeenCalled();
  expect(() => auth.getAccessToken()).toThrow('not initialized');
  await auth.initSecureStorage();
  expect(saveKey).toHaveBeenCalledTimes(2);
  expect(createStorage).toHaveBeenCalledTimes(1);
  expect(createStorage).toHaveBeenLastCalledWith({
    id: 'onservice-auth-secure', encryptionKey: persistedKey,
  });

  // A factory failure must not poison the retry promise or replace the key.
  auth.__resetForTests();
  jest.clearAllMocks();
  const retainedKey = persistedKey;
  const factoryFailure = new Error('synthetic MMKV creation failure');
  createStorage.mockImplementationOnce(() => { throw factoryFailure; });
  const factoryResults = await Promise.allSettled([auth.initSecureStorage(), auth.initSecureStorage()]);
  expect(factoryResults).toEqual([
    { status: 'rejected', reason: factoryFailure },
    { status: 'rejected', reason: factoryFailure },
  ]);
  expect(createStorage).toHaveBeenCalledTimes(1);
  expect(saveKey).not.toHaveBeenCalled();
  expect(() => auth.getAccessToken()).toThrow('not initialized');
  await auth.initSecureStorage();
  expect(createStorage).toHaveBeenCalledTimes(2);
  expect(persistedKey).toBe(retainedKey);
  expect(saveKey).not.toHaveBeenCalled();
  auth.storeTokens('synthetic-retry-access', 'synthetic-retry-refresh');
  expect(auth.getAccessToken()).toBe('synthetic-retry-access');
  expect(auth.getRefreshToken()).toBe('synthetic-retry-refresh');
});
