describe('Expo web export configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalExpoOs = process.env.EXPO_OS;
  const originalEasProjectId = process.env.EAS_PROJECT_ID;
  const originalIosMapsKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const originalAndroidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

  afterEach(() => {
    jest.resetModules();
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('EXPO_OS', originalExpoOs);
    restoreEnv('EAS_PROJECT_ID', originalEasProjectId);
    restoreEnv('GOOGLE_MAPS_IOS_API_KEY', originalIosMapsKey);
    restoreEnv('GOOGLE_MAPS_ANDROID_API_KEY', originalAndroidMapsKey);
  });

  it('builds production web config without native-only EAS and Google Maps values', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_OS = 'web';
    delete process.env.EAS_PROJECT_ID;
    delete process.env.GOOGLE_MAPS_IOS_API_KEY;
    delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;

    const { default: config } = await import('../app.config');

    expect(config.extra?.eas).toBeUndefined();
    expect(config.updates).toBeUndefined();
    expect(config.ios?.config).toBeUndefined();
    expect(config.android?.config).toBeUndefined();
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
