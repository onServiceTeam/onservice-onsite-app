// apps/mobile/src/web-stubs/react-native-screens.js
//
// Phase 200 — WEB wrapper for react-native-screens.
//
// Metro aliases `react-native-screens` to this file on the web platform (see
// metro.config.js). It re-exports the real package unchanged, but first ensures
// the `featureFlags.experiment` shape exists. @react-navigation/bottom-tabs
// 7.15.x sets featureFlags.experiment.controlledBottomTabs at module-init;
// react-native-screens 4.10's web build does not define featureFlags, so that
// access would throw "Cannot read properties of undefined (reading
// 'experiment')" and the whole app would fail to boot in a browser.
//
// The require below resolves to the REAL react-native-screens: the resolver in
// metro.config.js only redirects `react-native-screens` to this wrapper when
// the request does NOT originate from a web-stubs file, so this inner require
// passes through.
const actual = require('react-native-screens');

if (actual && typeof actual === 'object') {
  try {
    if (!actual.featureFlags) {
      actual.featureFlags = {};
    }
    if (actual.featureFlags && !actual.featureFlags.experiment) {
      actual.featureFlags.experiment = {};
    }
  } catch {
    // If the real module's exports are frozen, fall through; the consumer will
    // still get a defined featureFlags via the re-export object below.
  }
}

// Re-export the (now-augmented) real module. If featureFlags could not be set
// on the frozen original, provide it on the wrapper export so named imports of
// `featureFlags` still resolve to a usable object.
const wrapped =
  actual && actual.featureFlags && actual.featureFlags.experiment
    ? actual
    : Object.assign({}, actual, {
        featureFlags: Object.assign(
          {},
          actual && actual.featureFlags,
          { experiment: Object.assign({}, actual && actual.featureFlags && actual.featureFlags.experiment) }
        ),
      });

module.exports = wrapped;
