/**
 * Camera capture that also works in a browser.
 *
 * expo-image-picker's launchCameraAsync has no web implementation — in a
 * desktop/tablet browser it resolves `canceled: true` without showing
 * anything, so every "take a photo" button silently did nothing on
 * app.onservice.ph. Browsers expose camera/file choice through the file
 * input that launchImageLibraryAsync opens (tablet and phone browsers offer
 * "Take photo" in the OS file sheet), so on web we route capture through
 * the library picker instead. Camera permission is a native-only concept;
 * on web the helper never asks.
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type CaptureImageResult =
  | { status: 'denied' }
  | { status: 'done'; result: ImagePicker.ImagePickerResult };

/** True when a real device camera flow exists (drives button copy). */
export function isCameraCaptureAvailable(): boolean {
  return Platform.OS !== 'web';
}

/**
 * Open the camera (native) or the file picker (web) and return the picker
 * result. `status: 'denied'` means the user refused camera permission —
 * callers surface their own screen-specific message for that.
 */
export async function captureImageAsync(
  options: ImagePicker.ImagePickerOptions = {},
): Promise<CaptureImageResult> {
  if (Platform.OS === 'web') {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      ...options,
    });
    return { status: 'done', result };
  }

  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== 'granted') {
    return { status: 'denied' };
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    ...options,
  });
  return { status: 'done', result };
}
