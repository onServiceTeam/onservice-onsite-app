/**
 * Phase 14 Remediation R5b — manual jest config (no jest-expo preset).
 *
 * After multiple attempts to wire jest-expo for monorepo + Expo SDK 55,
 * the preset's eager load of `expo/src/winter/runtime.native` cannot be
 * stubbed before it triggers Jest's monorepo scope check. The pivot
 * (authorized in the F#7 audit feedback under "If the preset can't be
 * wired without devices, document and pivot"):
 *
 * Use a manual jest config that mocks `react-native` to a thin stub of
 * View / Text / Pressable / StyleSheet / etc. This means we CANNOT
 * mount a screen that uses real RN bridge features (NativeModules,
 * Animated drivers, native Animated values). What we CAN do:
 *
 *  1. Test pure-logic components (StatusBadge, FilterChips, ConfirmModal,
 *     PaginationLoader, Avatar — all the D11 components are pure JSX).
 *  2. Test pure-utility functions (validatePHPhone, formatPHP, etc.).
 *  3. Mark screens that hard-require RN-bridge features as `it.todo`
 *     with explicit reason; capture them in the F3 Maestro flows
 *     for device-level coverage.
 *
 * `.ai-coder/handoff/F3-maestro-baseline-capture.md` already documents
 * the device-level coverage path for screens that this jest harness
 * cannot exercise directly.
 */

module.exports = {
  // jsdom + @testing-library/react (web). Our __mocks__/react-native.js
  // renders RN primitives as plain DOM-ish elements ('rn-view', 'rn-text',
  // etc.) so React renders them as custom elements that jsdom understands.
  // This is the real working harness — replaces failed react-test-renderer
  // path. See D14r-5b-closeout.md for the failed attempts.
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-typescript'],
        ['@babel/preset-react', { runtime: 'automatic' }],
      ],
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|react-native-mmkv|@testing-library|expo|expo-.*|@expo|@expo/.*)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // react-native and the entire expo module ecosystem are stubbed in
    // jest.setup.js. The aliases below redirect specific imports to our
    // stubs so transformIgnorePatterns doesn't trigger Babel parse on
    // their TS source.
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    '^expo-router$': '<rootDir>/__mocks__/expo-router.js',
    '^expo-haptics$': '<rootDir>/__mocks__/expo-haptics.js',
    '^expo-image$': '<rootDir>/__mocks__/expo-image.js',
    '^expo-location$': '<rootDir>/__mocks__/expo-location.js',
    '^expo-task-manager$': '<rootDir>/__mocks__/expo-task-manager.js',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.js',
    '^expo-constants$': '<rootDir>/__mocks__/expo-constants.js',
    '^expo$': '<rootDir>/__mocks__/expo.js',
    '^@sentry/react-native$': '<rootDir>/__mocks__/sentry.js',
    '^@sentry/core$': '<rootDir>/__mocks__/sentry.js',
    '^react-native-reanimated$': '<rootDir>/__mocks__/reanimated.js',
    '^react-native-mmkv$': '<rootDir>/__mocks__/mmkv.js',
    '^react-native-safe-area-context$': '<rootDir>/__mocks__/safe-area.js',
    '^react-native-gesture-handler$': '<rootDir>/__mocks__/gesture-handler.js',
    '^lucide-react-native$': '<rootDir>/__mocks__/lucide.js',
    '^react-native-maps$': '<rootDir>/src/web-stubs/react-native-maps.tsx',
    // Phase E CRIT-103/104 (E01 Option A) — WebView-backed signature
    // canvas + its expo-file-system dep are mocked for the jest harness;
    // the real components live behind the platform layer and are
    // exercised at device level by F#3 Maestro.
    '^react-native-signature-canvas$': '<rootDir>/__mocks__/react-native-signature-canvas.js',
    '^expo-file-system(/legacy)?$': '<rootDir>/__mocks__/expo-file-system.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/'],
  // Monorepo: node_modules live at the workspace root.
  modulePaths: ['<rootDir>', '<rootDir>/../../node_modules'],
};
