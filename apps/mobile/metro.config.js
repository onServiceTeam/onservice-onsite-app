// apps/mobile/metro.config.js
// Phase 200 — monorepo-aware Metro config + web stub for react-native-maps.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: watch the repo root and resolve hoisted deps from both locations.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// On web, react-native-maps has no implementation — swap it for a stub so the
// bundle builds and map screens render a placeholder in the browser.
const mapsStub = path.resolve(projectRoot, 'src/web-stubs/react-native-maps.tsx');

// On web, alias react-native-screens to a thin wrapper that re-exports the real
// module and guarantees `featureFlags.experiment` exists. @react-navigation/
// bottom-tabs 7.15.x reads featureFlags.experiment at module-init, but
// react-native-screens 4.10's web build does not expose it, so the bundle
// otherwise crashes at boot with "Cannot read properties of undefined (reading
// 'experiment')". The wrapper requires react-native-screens itself; the
// originModulePath check lets that inner require pass through to the real
// package instead of looping back to the wrapper.
const rnScreensStub = path.resolve(projectRoot, 'src/web-stubs/react-native-screens.js');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'sourceFile', filePath: mapsStub };
  }
  if (
    platform === 'web' &&
    moduleName === 'react-native-screens' &&
    !(context.originModulePath || '').includes('web-stubs')
  ) {
    return { type: 'sourceFile', filePath: rnScreensStub };
  }
  const next = upstreamResolveRequest || context.resolveRequest;
  return next(context, moduleName, platform);
};

module.exports = config;
