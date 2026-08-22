import { Platform } from 'react-native';
import { getForcedView, resolveLayout } from '@/utils/responsive';

describe('responsive web view override', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  it('does not keep a mobile test override after navigation to a normal URL', () => {
    Platform.OS = 'web';
    window.localStorage.setItem('onservice.view', 'mobile');
    window.history.replaceState(null, '', '/?view=mobile');

    expect(getForcedView()).toBe('mobile');
    expect(resolveLayout(1280, getForcedView()).width).toBe(480);

    window.history.replaceState(null, '', '/provider/dashboard');

    expect(getForcedView()).toBeNull();
    expect(resolveLayout(1280, getForcedView()).width).toBe(1100);
  });
});
