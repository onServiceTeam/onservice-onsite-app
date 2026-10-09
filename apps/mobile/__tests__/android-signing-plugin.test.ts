/** Real Expo mod execution. Gradle/key-store acceptance is recorded separately. */
import type { ExpoConfig } from 'expo/config';
import type { ConfigPlugin, ExportedConfig } from 'expo/config-plugins';

const withLocalSigning: ConfigPlugin<{ enabled?: boolean }> =
  jest.requireActual('../plugins/withLocalAndroidSigning');
const statement = "apply from: new File(rootDir, '../plugins/android-release-signing.gradle')";
const originalBuild = 'android { buildTypes { release { signingConfig signingConfigs.debug } } }\n';

async function runMod(contents: string, enabled: boolean, language: 'groovy' | 'kt' = 'groovy') {
  const config = withLocalSigning({ name: 'fixture', slug: 'fixture' }, { enabled }) as ExportedConfig;
  const mod = config.mods!.android!.appBuildGradle!;
  const result = await mod({
    ...config,
    modResults: { contents, language, path: '/synthetic/android/app/build.gradle' },
    modRawConfig: config,
    modRequest: { platform: 'android', modName: 'appBuildGradle', projectRoot: '/synthetic',
      platformProjectRoot: '/synthetic/android', introspect: true },
  });
  return { language: result.modResults.language, contents: result.modResults.contents };
}

it('applies local signing after the existing template, without reading signing secrets into Expo configuration', async () => {
  const previous = process.env.ONSERVICE_ANDROID_STORE_PASSWORD;
  process.env.ONSERVICE_ANDROID_STORE_PASSWORD = 'synthetic-secret-never-serialize';
  try {
    const result = await runMod(originalBuild, true);
    expect(result).toEqual({ language: 'groovy', contents: `${originalBuild}\n${statement}\n` });
    expect(JSON.stringify(result)).not.toContain(process.env.ONSERVICE_ANDROID_STORE_PASSWORD);
  } finally {
    if (previous === undefined) delete process.env.ONSERVICE_ANDROID_STORE_PASSWORD;
    else process.env.ONSERVICE_ANDROID_STORE_PASSWORD = previous;
  }
});

it('is idempotent and removes only its own application when switching back to default or EAS builds', async () => {
  const source = `${originalBuild}apply from: 'another-plugin.gradle'\n`;
  const first = await runMod(source, true);
  const second = await runMod(first.contents, true);
  expect(second).toEqual(first);
  expect(await runMod(second.contents, false)).toEqual({ language: 'groovy', contents: source });
  expect(await runMod(source, false)).toEqual({ language: 'groovy', contents: source });
});

it('rejects unsupported selected templates without publishing the source or secret values in its diagnostic', async () => {
  await expect(runMod('private-template-value', true, 'kt')).rejects.toThrow(
    'Local Android signing requires the reviewed Groovy build template.',
  );
  expect(await runMod('unrelated Kotlin build', false, 'kt')).toEqual({
    language: 'kt', contents: 'unrelated Kotlin build',
  });
  expect(() => withLocalSigning({ name: 'fixture', slug: 'fixture' } as ExpoConfig,
    { enabled: 'true' } as unknown as { enabled: boolean })).toThrow('selection must be a boolean');
});
