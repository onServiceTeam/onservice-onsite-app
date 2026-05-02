// Phase E CRIT-103/104 (E01 Option A) — jest mock for expo-file-system.
// SignaturePad uses writeAsStringAsync to dump the base64 PNG to a
// temp file. In the jsdom test env we just return a deterministic
// fake file:// URI so behavioural tests can assert that the upload
// path saw a file URI without touching the real FS.
module.exports = {
  cacheDirectory: 'file:///tmp/cache/',
  documentDirectory: 'file:///tmp/docs/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  writeAsStringAsync: async () => {},
  readAsStringAsync: async () => '',
  deleteAsync: async () => {},
  getInfoAsync: async () => ({ exists: false }),
  makeDirectoryAsync: async () => {},
};
