// Phase E CRIT-103/104 (E01 Option A) — SignaturePad behavioural test.
//
// The real component wraps react-native-signature-canvas (a WebView).
// Both the canvas and expo-file-system are mocked in __mocks__/.
// What we verify here:
//   1. component imports cleanly
//   2. renders the inner signature canvas (via the mock's testID)
//   3. imperative ref's readSignature() drives the mock to fire onOK
//      → the mock's synthesised PNG is written via expo-file-system
//      → onCapture fires with the file:// URI

import React from 'react';
import { render, act } from '@testing-library/react';
import SignaturePad, { type SignaturePadRef } from '../src/components/SignaturePad';

describe('Phase E CRIT-103/104 — SignaturePad component', () => {
  it('CRIT-103 — imports cleanly and renders the inner canvas', () => {
    const { container } = render(
      React.createElement(SignaturePad, { onCapture: () => {} }),
    );
    // Mock renders an <rn-signature> element with testID.
    expect(container.querySelector('rn-signature')).not.toBeNull();
  });

  it('CRIT-103 — imperative readSignature() resolves into onCapture with a file:// URI', async () => {
    let captured: string | null = null;
    const ref = React.createRef<SignaturePadRef>();
    render(
      React.createElement(SignaturePad, {
        ref,
        onCapture: (uri: string) => { captured = uri; },
      }),
    );
    await act(async () => {
      ref.current?.readSignature();
      // Allow the microtask queue to drain (the onOK handler awaits
      // FileSystem.writeAsStringAsync which is mocked async).
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(captured).not.toBeNull();
    expect(captured!.startsWith('file://')).toBe(true);
    expect(captured!.endsWith('.png')).toBe(true);
  });

  it('CRIT-103 — clear() invokes the parent onClear callback', () => {
    let cleared = 0;
    const ref = React.createRef<SignaturePadRef>();
    render(
      React.createElement(SignaturePad, {
        ref,
        onCapture: () => {},
        onClear: () => { cleared += 1; },
      }),
    );
    act(() => {
      ref.current?.clear();
    });
    expect(cleared).toBe(1);
  });
});
