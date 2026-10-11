// jsdom has no native app build. Tests that need an installed version mock
// this module themselves (see d37 update tests); by default there is none,
// so update prompts stay hidden like in the web app.
module.exports = {
  applicationId: null,
  nativeApplicationVersion: null,
  nativeBuildVersion: null,
  getInstallationTimeAsync: jest.fn().mockResolvedValue(null),
};
