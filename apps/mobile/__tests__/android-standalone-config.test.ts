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
  expect(config.android?.versionCode).toBe(1); // This change does not issue a release version.
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
