// Build-time only. Signing material is read by Gradle, never by Expo config.
const { withAppBuildGradle } = require('expo/config-plugins');

const statement = "apply from: new File(rootDir, '../plugins/android-release-signing.gradle')";

module.exports = function withLocalAndroidSigning(config, { enabled = false } = {}) {
  if (typeof enabled !== 'boolean') {
    throw new Error('Local Android signing selection must be a boolean.');
  }
  return withAppBuildGradle(config, result => {
    if (result.modResults.language !== 'groovy') {
      if (!enabled) return result;
      throw new Error('Local Android signing requires the reviewed Groovy build template.');
    }
    const contents = result.modResults.contents;
    const lines = contents.split(/\r?\n/);
    const prior = lines.filter(line => line.trim() !== statement).join('\n').trimEnd();
    // Also remove our application when prebuilding back to EAS/default mode.
    result.modResults.contents = enabled ? `${prior}\n\n${statement}\n` :
      (lines.some(line => line.trim() === statement) ? `${prior}\n` : contents);
    return result;
  });
};
