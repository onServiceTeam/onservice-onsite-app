/**
 * Loads expo-image-picker only when a picker actually opens.
 *
 * The request form and the chat screens import the media components, and
 * expo-image-picker reaches for its native module as soon as it is imported.
 * Loading it on first use keeps those screens importable where the native
 * module is absent (the jsdom test harness, a server render) while the
 * phone and web apps behave exactly the same. Metro still bundles it: the
 * require below is a plain static string.
 */
export type ImagePickerModule = typeof import('expo-image-picker');

export function loadImagePicker(): ImagePickerModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-image-picker') as ImagePickerModule;
}

/**
 * Video length in milliseconds. The native apps report milliseconds and the
 * web build reports seconds (expo-image-picker 55), so the platform decides.
 */
export function normaliseVideoDurationMs(duration: number | null | undefined, platformOS: string): number | null {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return null;
  return Math.round(platformOS === 'web' ? duration * 1000 : duration);
}
