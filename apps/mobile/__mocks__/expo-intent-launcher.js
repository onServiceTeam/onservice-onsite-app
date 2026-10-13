// HA-UPD (2026-10-13): jest stand-in for expo-intent-launcher, which the
// in-app APK installer uses to open Android's installer and the "Install
// unknown apps" settings screen. jsdom has no Android activities, so
// startActivityAsync resolves as if the person came straight back
// (resultCode 0, Canceled). Tests that need another outcome override it.
//
// It copies the native rule in IntentLauncherModule.kt (expo-intent-launcher
// 55): the module keeps ONE pending activity, and any startActivityAsync made
// before that activity's result arrives rejects with E_ACTIVITY_ALREADY_STARTED.
// Tests that replace the implementation wrap their outcome in
// withSinglePendingActivity so the rule still holds.

function alreadyStartedError() {
  const error = new Error(
    'IntentLauncher activity is already started. You need to wait for its result before starting another activity.',
  );
  error.code = 'E_ACTIVITY_ALREADY_STARTED';
  return error;
}

function withSinglePendingActivity(outcome) {
  let pending = false;
  return async (...args) => {
    if (pending) throw alreadyStartedError();
    pending = true;
    try {
      return await outcome(...args);
    } finally {
      pending = false;
    }
  };
}

module.exports = {
  ActivityAction: {
    MANAGE_UNKNOWN_APP_SOURCES: 'android.settings.MANAGE_UNKNOWN_APP_SOURCES',
    APPLICATION_DETAILS_SETTINGS: 'android.settings.APPLICATION_DETAILS_SETTINGS',
  },
  ResultCode: { Success: -1, Canceled: 0, FirstUser: 1 },
  startActivityAsync: jest.fn(withSinglePendingActivity(async () => ({ resultCode: 0 }))),
  openApplication: jest.fn(),
  getApplicationIconAsync: jest.fn().mockResolvedValue(''),
  // Test helpers (not part of the real module).
  withSinglePendingActivity,
  alreadyStartedError,
};
