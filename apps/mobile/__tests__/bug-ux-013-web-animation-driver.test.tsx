import React from 'react';
import { Animated, Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

it('Bug UX-013 — browser startup animations do not request the unavailable native driver', () => {
  const platformSpy = jest.replaceProperty(Platform, 'OS', 'web');
  const timingSpy = jest.spyOn(Animated, 'timing');

  render(<OfflineBanner />);

  expect(timingSpy).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ useNativeDriver: false }),
  );
  timingSpy.mockRestore();
  platformSpy.restore();
});
