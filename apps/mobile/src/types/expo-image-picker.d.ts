declare module 'expo-image-picker' {
  // D38 Milestone 2: request videos. This local declaration replaces the
  // package's own types, so the video fields the media picker reads are
  // declared here (expo-image-picker 55, build/ImagePicker.types.d.ts).
  interface ImagePickerAsset {
    uri: string;
    width: number;
    height: number;
    type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo';
    fileName?: string | null;
    fileSize?: number;
    mimeType?: string;
    base64?: string | null;
    /**
     * Video length. The native apps report milliseconds; the web build
     * reports seconds. Null for photos.
     */
    duration?: number | null;
    /** Web only: the picked file itself, sliced for chunk uploads. */
    file?: File;
    /** iOS live photo: the paired video. */
    pairedVideoAsset?: ImagePickerAsset | null;
  }

  interface ImagePickerResult {
    canceled: boolean;
    assets: ImagePickerAsset[];
  }

  interface ImagePickerOptions {
    mediaTypes?: ('images' | 'videos' | 'livePhotos')[];
    allowsEditing?: boolean;
    allowsMultipleSelection?: boolean;
    selectionLimit?: number;
    quality?: number;
    base64?: boolean;
    aspect?: [number, number];
    /** Longest video the camera records, in seconds. Library picks and the web build ignore it. */
    videoMaxDuration?: number;
    /** UIImagePickerControllerQualityType (iOS camera only): 0 High, 1 Medium, 2 Low, 4 1280x720. */
    videoQuality?: number;
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
