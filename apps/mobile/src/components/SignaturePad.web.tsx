/**
 * Web implementation of SignaturePad (Metro resolves .web.tsx on web builds).
 *
 * The native SignaturePad wraps react-native-signature-canvas, which needs
 * react-native-webview (no web implementation) and writes its PNG through
 * expo-file-system (also unavailable in browsers) — so customer signatures
 * could never be captured on app.onservice.ph. This version draws on a plain
 * HTML <canvas> with pointer events and hands the parent a data: URI from
 * canvas.toDataURL(); booking-photo.service's web upload path turns data:
 * URIs into real multipart Files.
 *
 * Interface contract is identical to ./SignaturePad (SignaturePadRef +
 * SignaturePadProps): readSignature() fires onCapture only when the canvas
 * has strokes (matching the native onEmpty behavior of staying silent).
 */
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { colors, borderRadius } from '@/config/theme';
import type { SignaturePadProps, SignaturePadRef } from './SignaturePad';

const STROKE_COLOR = '#1a1a1a';
const STROKE_WIDTH = 2.5;

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(function SignaturePadWeb(
  { onCapture, onClear, onBegin, height = 180 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasStrokes = useRef(false);
  const drawing = useRef(false);

  const getContext = (): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    return ctx;
  };

  // Size the bitmap to the laid-out CSS box (once, on first layout — resizing
  // a canvas wipes it, so we don't chase later container resizes and lose the
  // customer's strokes).
  const handleLayout = (e: LayoutChangeEvent): void => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width > 0) return;
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w <= 0 || h <= 0) return;
    const scale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    getContext()?.scale(scale, scale);
  };

  const pointInCanvas = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const ctx = getContext();
    if (!ctx) return;
    (e.target as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    hasStrokes.current = true;
    const { x, y } = pointInCanvas(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Dot for a tap-only "stroke" so a single click leaves a mark.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    onBegin?.();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = pointInCanvas(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endStroke = (): void => {
    drawing.current = false;
  };

  useImperativeHandle(
    ref,
    () => ({
      readSignature: () => {
        const canvas = canvasRef.current;
        // Mirror native behavior: an empty canvas fires onEmpty (a no-op
        // for our parents), never onCapture.
        if (!canvas || !hasStrokes.current) return;
        onCapture(canvas.toDataURL('image/png'));
      },
      clear: () => {
        const canvas = canvasRef.current;
        const ctx = getContext();
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        hasStrokes.current = false;
        drawing.current = false;
        onClear?.();
      },
    }),
    [onCapture, onClear],
  );

  return (
    <View style={[styles.container, { height }]} onLayout={handleLayout}>
      <canvas
        ref={canvasRef}
        data-testid="signature-canvas"
        // touch-action none stops tablet browsers from scrolling the page
        // while the customer signs.
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        onPointerCancel={endStroke}
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
