import React from 'react';
import { render, screen } from '@testing-library/react';
import { Platform } from 'react-native';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

describe('OfflineBanner browser accessibility', () => {
  const originalOS = Platform.OS;
  const originalOnline = navigator.onLine;

  afterEach(() => {
    Platform.OS = originalOS;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnline });
  });

  it('does not mount an offline alert while the browser is online', () => {
    Platform.OS = 'web';
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });

    render(<OfflineBanner />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/you.re offline/i)).toBeNull();
  });
});
