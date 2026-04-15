import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { getSecureItem, setSecureItem } from './secure-storage.service';

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
