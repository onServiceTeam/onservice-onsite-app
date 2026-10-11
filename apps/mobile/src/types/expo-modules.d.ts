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

declare module 'expo-network' {
  export interface NetworkState {
    isConnected: boolean;
    isInternetReachable: boolean | null;
    type: string;
  }
  export function getNetworkStateAsync(): Promise<NetworkState>;
}
