import * as Application from 'expo-application';
import Constants from 'expo-constants';

/**
 * The one place the app works out which version it is.
 *
 * Installed app (Android APK, iOS): the version the phone reports for the
 * installed build. This is the same value the update check reads
 * (installedVersion() in app-update.service), so the "Version" line, the
 * update check and the feedback link always agree.
 *
 * Web app, or a build where the phone reports nothing: the version in
 * app.config.ts, which Expo exposes as Constants.expoConfig.version.
 *
 * Before 2026-10-12 the shown version was a hard-coded '0.1.0' in
 * platform.config.ts, so every build showed 0.1.0 (tester feedback v2,
 * section 8 of docs/qa/ux-testing/FEEDBACK-V2-AUDIT-AND-PLAN-2026-10-12.md).
 */
export function resolveAppVersion(): string | null {
  const installed = Application.nativeApplicationVersion;
  if (typeof installed === 'string' && installed.trim().length > 0) return installed.trim();
  const configured = Constants.expoConfig?.version;
  if (typeof configured === 'string' && configured.trim().length > 0) return configured.trim();
  return null;
}

/** Shown when neither source has a version (should not happen in a real build). */
export const UNKNOWN_APP_VERSION = 'unknown';
