/** @jest-environment jsdom */

import {
  clearAll,
  getPublicItem,
  removePublicItem,
  setPublicItem,
} from '../src/services/secure-storage.service.web';

describe('web public-storage runtime', () => {
  it('Bug UX250 — browser public values persist without constructing native MMKV', () => {
    clearAll();

    setPublicItem('pushToken', 'browser-safe-token');
    expect(getPublicItem('pushToken')).toBe('browser-safe-token');
    expect(window.localStorage.getItem('onservice-public:pushToken')).toBe('browser-safe-token');

    removePublicItem('pushToken');
    expect(getPublicItem('pushToken')).toBeUndefined();
  });
});
