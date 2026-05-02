/**
 * Phase E CRIT-103/104 fix (E01 Option A) — customer signature capture
 * that produces a real PNG bitmap.
 *
 * Pre-fix: provider/job/[id]/complete.tsx used a custom PanResponder
 * that collected an array of {x,y} points but never converted them
 * to an image. The booking_signatures schema requires
 * storage_key TEXT NOT NULL, so even if upload had been wired the
 * raw point array couldn't have been persisted.
 *
 * Post-fix: thin wrapper around react-native-signature-canvas (a
 * WebView-backed signature capture). The library returns a base64
 * PNG via the onOK callback. We expose:
 *   - controlled `onCapture(file://uri)` callback (after writing the
 *     base64 to a temp file via expo-file-system)
 *   - controlled `onClear()` for the parent's "Clear" button
 *   - imperative ref with .clear() and .readSignature() so the
 *     parent's submit button can request the PNG without making the
 *     user tap an extra "Save" button on the canvas
 *
 * The component intentionally hides the library's internal save/clear
 * UI (autoClear=false, descriptionText='') so the parent screen owns
 * the chrome for accessibility consistency.
 */
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
// Phase L typecheck fix — expo-file-system v19 moved the legacy API
// (cacheDirectory + EncodingType + writeAsStringAsync) to the
// `expo-file-system/legacy` subpath. The new top-level API is
// File/Directory class-based; the legacy free functions still work
// for our base64-write-then-multipart-upload need.
import * as FileSystem from 'expo-file-system/legacy';
import { colors, borderRadius } from '@/config/theme';

export interface SignaturePadRef {
  /** Trigger the WebView to read out the current signature as a base64 PNG. */
  readSignature: () => void;
  /** Wipe the canvas. */
  clear: () => void;
}

export interface SignaturePadProps {
  /** Fired with a file:// URI pointing at a freshly written PNG when the
   *  parent calls readSignature() and the canvas has strokes on it. */
  onCapture: (uri: string) => void;
  /** Fired when the user (or the parent calling clear()) wipes the canvas. */
  onClear?: () => void;
  /** Fired when the user starts drawing — useful for the parent to record
   *  the signedAt timestamp at the start of capture. */
  onBegin?: () => void;
  /** Optional fixed height for the canvas (defaults to 180 to match the
   *  pre-fix PanResponder dimensions in complete.tsx). */
  height?: number;
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(function SignaturePad(
  { onCapture, onClear, onBegin, height = 180 },
  ref,
) {
  const innerRef = useRef<SignatureViewRef | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      readSignature: () => {
        innerRef.current?.readSignature();
      },
      clear: () => {
        innerRef.current?.clearSignature();
        onClear?.();
      },
    }),
    [onClear],
  );

  // The library's onOK callback fires with `data:image/png;base64,...`.
  // We strip the data-URL prefix, write the bytes to the cache dir,
  // and hand the file:// URI to the parent.
  const handleOK = async (signature: string): Promise<void> => {
    try {
      const base64 = signature.replace(/^data:image\/\w+;base64,/, '');
      const fileUri = `${FileSystem.cacheDirectory ?? ''}signature-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      onCapture(fileUri);
    } catch {
      // Swallow — the parent is responsible for surfacing upload errors.
    }
  };

  // The library renders an HTML page inside a WebView. We supply a
  // small webStyle override to match the surrounding theme — hide
  // the library's footer (Save/Clear) buttons since the parent
  // screen owns those, and set a transparent background so the
  // wrapping View's borderRadius shows through cleanly.
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; }
    .m-signature-pad--body { border: none; }
    .m-signature-pad--footer { display: none; margin: 0; }
    body, html { background-color: transparent; }
  `;

  return (
    <View style={[styles.container, { height }]}>
      <SignatureScreen
        ref={innerRef}
        onOK={handleOK}
        onBegin={onBegin}
        onEmpty={() => {
          // Parent gets a no-capture signal as an empty onCapture.
        }}
        webStyle={webStyle}
        descriptionText=""
        autoClear={false}
        imageType="image/png"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});

export default SignaturePad;
