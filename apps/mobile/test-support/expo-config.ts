// Loads apps/mobile/app.config.ts the way the standalone tester APK build does
// (ONSERVICE_ANDROID_STANDALONE=1, production), with a synthetic Maps key, and
// puts every environment variable back afterwards. Same settings as
// __tests__/android-standalone-config.test.ts.
import type { ExpoConfig } from 'expo/config';

const NAMES = [
  'NODE_ENV', 'EXPO_OS', 'EAS_BUILD', 'EAS_PROJECT_ID',
  'GOOGLE_MAPS_IOS_API_KEY', 'GOOGLE_MAPS_ANDROID_API_KEY',
  'ONSERVICE_ANDROID_STANDALONE',
] as const;

export function loadStandaloneAndroidConfig(): ExpoConfig {
  const saved = NAMES.map((name) => [name, process.env[name]] as const);
  try {
    for (const name of NAMES) delete process.env[name];
    process.env.NODE_ENV = 'production';
    process.env.ONSERVICE_ANDROID_STANDALONE = '1';
    process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'synthetic-android-only-maps-key';
    let config: ExpoConfig | undefined;
    jest.isolateModules(() => {
      config = (jest.requireActual('../app.config') as { default: ExpoConfig }).default;
    });
    if (!config) throw new Error('app.config.ts did not export a config');
    return config;
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/** Options object of a `[name, options]` plugin entry, if present. */
export function pluginOptions(config: ExpoConfig, name: string): Record<string, unknown> | undefined {
  const entry = (config.plugins ?? []).find((plugin) => Array.isArray(plugin) && plugin[0] === name);
  return Array.isArray(entry) ? (entry[1] as Record<string, unknown>) : undefined;
}
