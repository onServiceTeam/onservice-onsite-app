// Web-compat audit (2026-06-10) — camera buttons in a browser.
//
// expo-image-picker's launchCameraAsync silently resolves canceled on web,
// so every "take a photo" button (onboarding selfie, job completion photos,
// checklist photos, portfolio, certifications) did nothing in a desktop or
// tablet browser. captureImageAsync routes web capture through the library
// picker (the browser file sheet offers the camera on tablets/phones) and
// keeps the native camera + permission flow everywhere else.

import { Platform } from 'react-native';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { captureImageAsync, isCameraCaptureAvailable } from '@/utils/image-capture';

const mockPicker = ImagePicker as jest.Mocked<typeof ImagePicker>;

afterEach(() => {
  Platform.OS = 'ios';
  jest.clearAllMocks();
});

describe('captureImageAsync', () => {
  it('on web — opens the library picker and never asks for camera permission', async () => {
    Platform.OS = 'web';
    const picked = { canceled: false, assets: [{ uri: 'blob:https://x/1' }] };
    mockPicker.launchImageLibraryAsync.mockResolvedValue(picked as never);

    const res = await captureImageAsync({ quality: 0.8 });

    expect(mockPicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(mockPicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], quality: 0.8 }),
    );
    expect(res).toEqual({ status: 'done', result: picked });
  });

  it('on native — granted permission opens the camera', async () => {
    Platform.OS = 'ios';
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    const shot = { canceled: false, assets: [{ uri: 'file:///tmp/shot.jpg' }] };
    mockPicker.launchCameraAsync.mockResolvedValue(shot as never);

    const res = await captureImageAsync({ quality: 0.7 });

    expect(mockPicker.launchCameraAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], quality: 0.7 }),
    );
    expect(mockPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 'done', result: shot });
  });

  it('on native — denied permission returns status denied without opening anything', async () => {
    Platform.OS = 'android';
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);

    const res = await captureImageAsync();

    expect(res).toEqual({ status: 'denied' });
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(mockPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});

describe('isCameraCaptureAvailable', () => {
  it('is false on web, true on native', () => {
    Platform.OS = 'web';
    expect(isCameraCaptureAvailable()).toBe(false);
    Platform.OS = 'ios';
    expect(isCameraCaptureAvailable()).toBe(true);
  });
});
