/** Build-time configuration contract, not signing, maps, push or APK acceptance. */
const names = [
  'NODE_ENV', 'EXPO_OS', 'EAS_BUILD', 'EAS_PROJECT_ID',
  'GOOGLE_MAPS_IOS_API_KEY', 'GOOGLE_MAPS_ANDROID_API_KEY',
  'ONSERVICE_ANDROID_STANDALONE',
] as const;
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));

function loadConfig(): typeof import('../app.config').default {
  jest.resetModules();
  return jest.requireActual('../app.config').default;
}

beforeEach(() => {
  for (const name of names) delete process.env[name];
  process.env.NODE_ENV = 'production';
  process.env.ONSERVICE_ANDROID_STANDALONE = '1';
  process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'synthetic-android-only-maps-key';
});

afterEach(() => {
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
  jest.resetModules();
});

it('builds an explicitly selected standalone Android config without inventing EAS or iOS values', () => {
  const config = loadConfig();
  expect(config.platforms).toEqual(['android']);
  expect(config.android?.package).toBe('ph.onservice.app');
  expect(config.android?.config?.googleMaps?.apiKey).toBe('synthetic-android-only-maps-key');
  expect(config.ios?.config).toBeUndefined();
  expect(config.extra?.eas).toBeUndefined();
  expect(config.updates).toBeUndefined();
  expect(config.extra?.router).toEqual({ root: 'app' });
  // 1.0.1 (build 2), 2026-10-12: the first APK with email sign-in and the update check.
  // 1.0.2 (build 3), 2026-10-13: tester feedback v2 (Send feedback entries, real version shown).
  // 1.0.3 (build 4), 2026-10-14: in-app updater, request-first booking, new home and service screens.
  // 1.0.4 (build 5), D38 Milestone 2: request media (photos, video, voice notes), request threads, live updates.
  // 1.0.5 (build 6), 2026-10-14: truthful confirmation after paying a quote (R-CUS-09), customer-paid banner for pros (R-NOT-01).
  expect(config.version).toBe('1.0.5');
  expect(config.android?.versionCode).toBe(6);
});

// D38 Milestone 2 (APK 1.0.4): voice notes need the microphone; videos come
// from the system photo picker, so the video and audio library permissions
// are blocked, and neither media plugin may add background playback.
it('HA-M2-CONFIG: 1.0.4 asks for the microphone, blocks media-library video and audio, and keeps background audio off', () => {
  const config = loadConfig();
  expect(config.android?.permissions).toContain('RECORD_AUDIO');
  expect(config.android?.blockedPermissions).toEqual([
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_MEDIA_AUDIO',
  ]);
  expect(config.ios?.infoPlist?.NSMicrophoneUsageDescription).toMatch(/voice note/);
  const plugins = (config.plugins ?? []) as Array<string | [string, Record<string, unknown>]>;
  const optionsOf = (name: string): Record<string, unknown> | undefined => {
    const entry = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === name);
    return Array.isArray(entry) ? entry[1] : undefined;
  };
  expect(optionsOf('expo-audio')).toMatchObject({
    recordAudioAndroid: true, enableBackgroundPlayback: false, enableBackgroundRecording: false,
  });
  expect(optionsOf('expo-video')).toEqual({ supportsBackgroundPlayback: false, supportsPictureInPicture: false });
});

it('retains an explicitly configured EAS identity while still requiring only Android Maps configuration', () => {
  process.env.EXPO_OS = 'android';
  process.env.EAS_PROJECT_ID = 'e8efc001-a67f-4439-b5e6-85db4cdbca90';
  const config = loadConfig();
  expect(config.extra?.eas).toEqual({ projectId: process.env.EAS_PROJECT_ID });
  expect(config.updates?.url).toBe(`https://u.expo.dev/${process.env.EAS_PROJECT_ID}`);
  expect(config.ios?.config).toBeUndefined();
});

it.each([undefined, '', '   ', 'DEV' + '_MISSING_GOOGLE_MAPS_ANDROID_API_KEY', 'YOUR' + '_GOOGLE_MAPS_API_KEY'])(
  'rejects an absent or placeholder Android Maps value even during prebuild development evaluation (%s)', value => {
    process.env.NODE_ENV = 'development';
    if (value === undefined) delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
    else process.env.GOOGLE_MAPS_ANDROID_API_KEY = value;
    expect(() => loadConfig()).toThrow(/GOOGLE_MAPS_ANDROID_API_KEY/);
  },
);

it.each(['web', 'ios', 'unexpected'])(
  'rejects a conflicting target instead of changing standalone Android into %s', target => {
    process.env.EXPO_OS = target;
    expect(() => loadConfig()).toThrow(/standalone Android.*EXPO_OS/);
  },
);

it('rejects accidental use of the local standalone mode by EAS Build', () => {
  process.env.EAS_BUILD = 'true';
  expect(() => loadConfig()).toThrow(/standalone Android.*EAS_BUILD/);
});

it.each(['true', 'android', '2', ' 1 '])('rejects an invalid standalone selection (%s)', value => {
  process.env.ONSERVICE_ANDROID_STANDALONE = value;
  expect(() => loadConfig()).toThrow(/ONSERVICE_ANDROID_STANDALONE/);
});

it('rejects malformed optional project identity without echoing it in diagnostics', () => {
  const privateValue = 'invalid-synthetic-project-value';
  process.env.EAS_PROJECT_ID = privateValue;
  let failure: unknown;
  try { loadConfig(); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toMatch(/EAS_PROJECT_ID/);
  expect((failure as Error).message).not.toContain(privateValue);
});

// HA-UPD (2026-10-13): the tester APK opens Android's installer for its own
// updates, which needs REQUEST_INSTALL_PACKAGES. Google Play forbids that
// permission for self-updates, so only the standalone tester build gets it.
it('HA-UPD-CONFIG: only the standalone tester APK declares the install-packages permission', () => {
  expect(loadConfig().android?.permissions).toContain('android.permission.REQUEST_INSTALL_PACKAGES');

  delete process.env.ONSERVICE_ANDROID_STANDALONE;
  process.env.EAS_PROJECT_ID = 'e8efc001-a67f-4439-b5e6-85db4cdbca90';
  process.env.GOOGLE_MAPS_IOS_API_KEY = 'synthetic-ios-maps-key';
  const storeBuild = loadConfig();
  expect(storeBuild.platforms).toEqual(['ios', 'android', 'web']);
  expect(storeBuild.android?.permissions).not.toContain('android.permission.REQUEST_INSTALL_PACKAGES');
  expect(storeBuild.android?.permissions).toContain('CAMERA');
});

it.each([undefined, '0'])('preserves the existing non-standalone production requirements (%s)', selection => {
  if (selection === undefined) delete process.env.ONSERVICE_ANDROID_STANDALONE;
  else process.env.ONSERVICE_ANDROID_STANDALONE = selection;
  expect(() => loadConfig()).toThrow(/EAS_PROJECT_ID/);
  process.env.EAS_PROJECT_ID = 'e8efc001-a67f-4439-b5e6-85db4cdbca90';
  expect(() => loadConfig()).toThrow(/GOOGLE_MAPS_IOS_API_KEY/);
  process.env.GOOGLE_MAPS_IOS_API_KEY = 'synthetic-ios-maps-key';
  const config = loadConfig();
  expect(config.platforms).toEqual(['ios', 'android', 'web']);
  expect(config.ios?.config?.googleMapsApiKey).toBe('synthetic-ios-maps-key');
  expect(config.android?.config?.googleMaps?.apiKey).toBe('synthetic-android-only-maps-key');
});
