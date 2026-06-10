// Web-compat audit (2026-06-10) — customer signature capture in a browser.
//
// The native SignaturePad wraps react-native-signature-canvas (needs
// react-native-webview, no web implementation) and writes its PNG via
// expo-file-system (also unavailable on web) — so the provider job-completion
// flow could never capture a signature on app.onservice.ph. The .web.tsx
// implementation draws on an HTML <canvas> and hands back a data: URI.
// These tests drive the real component in jsdom through pointer events.

import React, { createRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import SignaturePadWeb from '@/components/SignaturePad.web';
import type { SignaturePadRef } from '@/components/SignaturePad';

const FAKE_DATA_URI = 'data:image/png;base64,FAKE_SIGNATURE';

function setup(): {
  canvas: HTMLCanvasElement;
  ref: React.RefObject<SignaturePadRef | null>;
  onCapture: jest.Mock;
  onClear: jest.Mock;
  onBegin: jest.Mock;
} {
  const ref = createRef<SignaturePadRef>();
  const onCapture = jest.fn();
  const onClear = jest.fn();
  const onBegin = jest.fn();
  const { container } = render(
    <SignaturePadWeb ref={ref} onCapture={onCapture} onClear={onClear} onBegin={onBegin} />,
  );
  const canvas = container.querySelector('canvas') as HTMLCanvasElement;
  // jsdom has no real 2D canvas: stub the context + toDataURL so stroke
  // bookkeeping (which is what we assert) runs against a working surface.
  const ctxStub = {
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    clearRect: jest.fn(),
    scale: jest.fn(),
    set lineCap(_v: string) {},
    set lineJoin(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
  };
  canvas.getContext = jest.fn().mockReturnValue(ctxStub) as never;
  canvas.toDataURL = jest.fn().mockReturnValue(FAKE_DATA_URI) as never;
  return { canvas, ref, onCapture, onClear, onBegin };
}

function drawStroke(canvas: HTMLCanvasElement): void {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 25, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

describe('SignaturePad.web', () => {
  it('readSignature after drawing fires onCapture with a data: PNG URI', () => {
    const { canvas, ref, onCapture, onBegin } = setup();
    drawStroke(canvas);
    expect(onBegin).toHaveBeenCalled();

    ref.current!.readSignature();
    expect(onCapture).toHaveBeenCalledWith(FAKE_DATA_URI);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('readSignature on an empty canvas stays silent (native onEmpty parity)', () => {
    const { ref, onCapture } = setup();
    ref.current!.readSignature();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('clear() wipes stroke state and notifies the parent', () => {
    const { canvas, ref, onCapture, onClear } = setup();
    drawStroke(canvas);

    ref.current!.clear();
    expect(onClear).toHaveBeenCalled();

    // After clear, the canvas counts as empty again — no capture.
    ref.current!.readSignature();
    expect(onCapture).not.toHaveBeenCalled();
  });
});
