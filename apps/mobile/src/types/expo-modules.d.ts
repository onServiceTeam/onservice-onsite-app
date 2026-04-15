declare module 'expo-application' {
  export const applicationId: string | null;
  export const nativeBuildVersion: string | null;
  export function getInstallationTimeAsync(): Promise<Date | null>;
}

declare module 'expo-crypto' {
  export enum CryptoDigestAlgorithm {
    SHA256 = 'SHA-256',
    SHA384 = 'SHA-384',
    SHA512 = 'SHA-512',
  }
  export function digestStringAsync(
    algorithm: CryptoDigestAlgorithm,
    data: string,
  ): Promise<string>;
}

declare module 'expo-haptics' {
  export enum ImpactFeedbackStyle {
    Light = 'light',
    Medium = 'medium',
    Heavy = 'heavy',
  }
  export enum NotificationFeedbackType {
    Success = 'success',
    Warning = 'warning',
    Error = 'error',
  }
  export function impactAsync(style: ImpactFeedbackStyle): Promise<void>;
  export function notificationAsync(type: NotificationFeedbackType): Promise<void>;
  export function selectionAsync(): Promise<void>;
}

declare module 'react-native-mmkv' {
  export interface MMKVConfiguration {
    id?: string;
    encryptionKey?: string;
  }
  export class MMKV {
    constructor(config?: MMKVConfiguration);
    set(key: string, value: string | number | boolean): void;
    getString(key: string): string | undefined;
    getNumber(key: string): number | undefined;
    getBoolean(key: string): boolean | undefined;
    delete(key: string): void;
    getAllKeys(): string[];
    clearAll(): void;
    contains(key: string): boolean;
  }
}
