import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { platformConfig } from '../config/platform.config';
import { uploadImages, type UploadedFile } from '../services/upload.service';

const MAX_DIMENSION = 1920;
const COMPRESS_QUALITY = 0.75;

interface ManipulateResult { uri: string }
type ImageAction = { resize?: { width: number; height?: number } | { height: number; width?: number } };
type SaveOptions = { compress?: number; format?: 'jpeg' | 'png' };
type ManipulateFn = (uri: string, actions: ImageAction[], saveOptions: SaveOptions) => Promise<ManipulateResult>;

let manipulateAsync: ManipulateFn | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-image-manipulator') as { manipulateAsync: ManipulateFn };
  manipulateAsync = mod.manipulateAsync;
} catch {
  // expo-image-manipulator not installed — skip compression
}

async function compressImage(uri: string, pickerWidth?: number, pickerHeight?: number): Promise<string> {
  if (!manipulateAsync) return uri;

  try {
    const w = pickerWidth ?? 0;
    const h = pickerHeight ?? 0;
    const actions: ImageAction[] = [];

    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      if (w >= h) {
        actions.push({ resize: { width: MAX_DIMENSION } });
      } else {
        actions.push({ resize: { height: MAX_DIMENSION } });
      }
    }

    const result = await manipulateAsync(uri, actions, {
      compress: COMPRESS_QUALITY,
      format: 'jpeg' as const,
    });

    return result.uri;
  } catch {
    return uri;
  }
}

interface UseImagePickerOptions {
  maxImages?: number;
  context: 'job-request' | 'change-order' | 'dispute' | 'chat' | 'review' | 'onboarding' | 'general';
}

interface UseImagePickerReturn {
  localUris: string[];
  uploadedFiles: UploadedFile[];
  isUploading: boolean;
  pickFromGallery: () => Promise<void>;
  pickFromCamera: () => Promise<void>;
  removeImage: (index: number) => void;
  uploadAll: () => Promise<string[]>;
  showPickerOptions: () => void;
  reset: () => void;
}

export function useImagePicker(options: UseImagePickerOptions): UseImagePickerReturn {
  const { maxImages = platformConfig.maxImagesPerBooking, context } = options;
  const [localUris, setLocalUris] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const requestPermissions = useCallback(async (type: 'camera' | 'gallery'): Promise<boolean> => {
    if (type === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to take photos.');
        return false;
      }
    } else {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library access is needed to select photos.');
          return false;
        }
      }
    }
    return true;
  }, []);

  const addImages = useCallback(async (assets: { uri: string; width?: number; height?: number }[]) => {
    const compressed: string[] = [];
    for (const asset of assets) {
      const processed = await compressImage(asset.uri, asset.width, asset.height);
      compressed.push(processed);
    }

    setLocalUris((prev) => {
      const remaining = maxImages - prev.length;
      if (remaining <= 0) {
        Alert.alert('Limit Reached', `Maximum ${maxImages} photos allowed.`);
        return prev;
      }
      const toAdd = compressed.slice(0, remaining);
      return [...prev, ...toAdd];
    });
  }, [maxImages]);

  const pickFromGallery = useCallback(async () => {
    const hasPermission = await requestPermissions('gallery');
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: maxImages - localUris.length,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      await addImages(result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height })));
    }
  }, [requestPermissions, addImages, maxImages, localUris.length]);

  const pickFromCamera = useCallback(async () => {
    const hasPermission = await requestPermissions('camera');
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      await addImages(result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height })));
    }
  }, [requestPermissions, addImages]);

  const removeImage = useCallback((index: number) => {
    setLocalUris((prev) => prev.filter((_, i) => i !== index));
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const uploadAll = useCallback(async (): Promise<string[]> => {
    if (localUris.length === 0) return [];

    const alreadyUploaded = uploadedFiles.map((f) => f.url);
    if (alreadyUploaded.length === localUris.length) {
      return alreadyUploaded;
    }

    setIsUploading(true);
    try {
      const newUris = localUris.slice(uploadedFiles.length);
      const newFiles = await uploadImages(newUris, context);
      const allFiles = [...uploadedFiles, ...newFiles];
      setUploadedFiles(allFiles);
      return allFiles.map((f) => f.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Upload Error', msg);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [localUris, uploadedFiles, context]);

  const showPickerOptions = useCallback(() => {
    if (localUris.length >= maxImages) {
      Alert.alert('Limit Reached', `Maximum ${maxImages} photos allowed.`);
      return;
    }
    // On web there is no real camera flow: expo-image-picker's launchCameraAsync
    // builds an <input capture="camera">, which desktop browsers ignore and
    // render as the ordinary file/library chooser. Offering a "Camera" option
    // there just opens the photo library and confuses people (reported by a web
    // tester, 2026-06-16). Skip the action sheet and go straight to the library,
    // which is what the audited image-capture helper already does on web.
    if (Platform.OS === 'web') {
      void pickFromGallery();
      return;
    }
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => void pickFromCamera() },
      { text: 'Photo Library', onPress: () => void pickFromGallery() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [localUris.length, maxImages, pickFromCamera, pickFromGallery]);

  const reset = useCallback(() => {
    setLocalUris([]);
    setUploadedFiles([]);
  }, []);

  return {
    localUris,
    uploadedFiles,
    isUploading,
    pickFromGallery,
    pickFromCamera,
    removeImage,
    uploadAll,
    showPickerOptions,
    reset,
  };
}
