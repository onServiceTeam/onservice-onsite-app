declare module 'expo-image-picker' {
  interface ImagePickerAsset {
    uri: string;
    width: number;
    height: number;
    type?: 'image' | 'video';
    fileName?: string | null;
    fileSize?: number;
    mimeType?: string;
    base64?: string | null;
  }

  interface ImagePickerResult {
    canceled: boolean;
    assets: ImagePickerAsset[];
  }

  interface ImagePickerOptions {
    mediaTypes?: ('images' | 'videos')[];
    allowsEditing?: boolean;
    allowsMultipleSelection?: boolean;
    selectionLimit?: number;
    quality?: number;
    base64?: boolean;
    aspect?: [number, number];
  }

  interface PermissionResponse {
    status: 'granted' | 'denied' | 'undetermined';
    expires: string;
    granted: boolean;
    canAskAgain: boolean;
  }

  export function launchImageLibraryAsync(options?: ImagePickerOptions): Promise<ImagePickerResult>;
  export function launchCameraAsync(options?: ImagePickerOptions): Promise<ImagePickerResult>;
  export function requestCameraPermissionsAsync(): Promise<PermissionResponse>;
  export function requestMediaLibraryPermissionsAsync(): Promise<PermissionResponse>;
}
