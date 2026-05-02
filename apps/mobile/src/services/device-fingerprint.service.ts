import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
// Phase K CRIT-K01 fix — migrate device fingerprint storage from
// the legacy secure-storage.service (which used the hardcoded
// 'onservice-dev-only-key' MMKV encryption key) to the new
// secure-storage.ts module (per-device key materialized in OS
// keychain via expo-secure-store). The fingerprint participates in
// refresh-token binding (MED-N85), so it MUST live behind the same
// keychain-backed cipher as the auth tokens themselves.
import { getSecureItem, setSecureItem } from './secure-storage';

const FP_KEY = 'device:fingerprint';
const DEVICE_NAME_KEY = 'device:name';

export async function getDeviceFingerprint(): Promise<string> {
  const stored = getSecureItem(FP_KEY);
  if (stored) return stored;

  const raw = [
    Platform.OS,
    Platform.Version?.toString() ?? '',
    Application.applicationId ?? '',
    Application.nativeBuildVersion ?? '',
    await Application.getInstallationTimeAsync()
      .then((date: Date | null) => date?.toISOString() ?? '')
      .catch(() => ''),
  ].join('|');

  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw + Date.now().toString(),
  );

  setSecureItem(FP_KEY, hash);
  return hash;
}

export function getDeviceName(): string {
  const stored = getSecureItem(DEVICE_NAME_KEY);
  if (stored) return stored;

  const name = `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} Device`;
  setSecureItem(DEVICE_NAME_KEY, name);
  return name;
}

export function getDevicePlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}
