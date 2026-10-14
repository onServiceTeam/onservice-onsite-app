// Phase E CRIT-103/104 (E01 Option A) — jest mock for expo-file-system.
// SignaturePad uses writeAsStringAsync to dump the base64 PNG to a
// temp file. In the jsdom test env we just return a deterministic
// fake file:// URI so behavioural tests can assert that the upload
// path saw a file URI without touching the real FS.
//
// D38 Milestone 2 (media chunk uploads): the SDK 55 File / FileHandle API.
// Files live in an in-memory map a test fills with __setMockFile(uri, bytes).
// Every open(), offset change, readBytes(), slice() and bytes() call is
// recorded in __fileCalls, so a test can prove chunks are read through a
// FileHandle at the right offsets and never through slice() or bytes() (which
// load the whole file into memory on a real phone).
const mockFiles = new Map();
const fileCalls = [];

function joinUri(parts) {
  const strings = parts.map((part) => (part && typeof part === 'object' && 'uri' in part ? part.uri : String(part)));
  return strings
    .map((part, index) => {
      let out = part;
      if (index > 0) out = out.replace(/^\/+/, '');
      if (index < strings.length - 1) out = out.replace(/\/+$/, '');
      return out;
    })
    .join('/');
}

class FileHandle {
  constructor(uri) {
    this.uri = uri;
    this._offset = 0;
    this.closed = false;
  }

  get offset() { return this._offset; }

  set offset(value) {
    fileCalls.push({ op: 'offset', uri: this.uri, value });
    this._offset = value;
  }

  get size() { return (mockFiles.get(this.uri) || new Uint8Array(0)).length; }

  readBytes(length) {
    if (this.closed) throw new Error('FileHandle is closed');
    const bytes = mockFiles.get(this.uri) || new Uint8Array(0);
    const out = bytes.slice(this._offset, this._offset + length);
    fileCalls.push({ op: 'readBytes', uri: this.uri, offset: this._offset, length });
    this._offset += out.length;
    return out;
  }

  writeBytes() { throw new Error('writeBytes is not used by the app'); }

  close() {
    this.closed = true;
    fileCalls.push({ op: 'close', uri: this.uri });
  }
}

class File {
  constructor(...uris) {
    this.uri = joinUri(uris);
  }

  get exists() { return mockFiles.has(this.uri); }

  get size() { return (mockFiles.get(this.uri) || new Uint8Array(0)).length; }

  get name() { return this.uri.split('/').pop(); }

  open() {
    if (!mockFiles.has(this.uri)) throw new Error(`No mock file at ${this.uri}`);
    fileCalls.push({ op: 'open', uri: this.uri });
    return new FileHandle(this.uri);
  }

  copy(destination) {
    const bytes = mockFiles.get(this.uri);
    if (!bytes) throw new Error(`No mock file at ${this.uri}`);
    mockFiles.set(destination.uri, bytes);
    fileCalls.push({ op: 'copy', uri: this.uri, to: destination.uri });
  }

  delete() {
    mockFiles.delete(this.uri);
    fileCalls.push({ op: 'delete', uri: this.uri });
  }

  slice() {
    fileCalls.push({ op: 'slice', uri: this.uri });
    throw new Error('File.slice() loads the whole file into memory; use open() and readBytes()');
  }

  bytes() {
    fileCalls.push({ op: 'bytes', uri: this.uri });
    throw new Error('File.bytes() loads the whole file into memory; use open() and readBytes()');
  }
}

class Directory {
  constructor(...uris) {
    this.uri = joinUri(uris);
  }
}

const Paths = {
  cache: new Directory('file:///tmp/cache'),
  document: new Directory('file:///tmp/docs'),
};

module.exports = {
  cacheDirectory: 'file:///tmp/cache/',
  documentDirectory: 'file:///tmp/docs/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  writeAsStringAsync: async () => {},
  readAsStringAsync: async () => '',
  deleteAsync: async () => {},
  getInfoAsync: async () => ({ exists: false }),
  makeDirectoryAsync: async () => {},
  File,
  Directory,
  FileHandle,
  Paths,
  __setMockFile: (uri, bytes) => { mockFiles.set(uri, bytes); },
  __clearMockFiles: () => { mockFiles.clear(); fileCalls.length = 0; },
  __fileCalls: fileCalls,
};
