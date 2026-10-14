// D38 Milestone 2 — jest mock for expo-audio (voice notes on job requests and
// in request threads). jsdom has no microphone or audio output, so recorders
// and players are small in-memory objects that record every call.
//
// Tests drive it through the exported `__audio` control object:
//   __audio.permission            what requestRecordingPermissionsAsync returns
//   __audio.prepareError          an Error prepareToRecordAsync throws (e.g. NotAllowedError)
//   __audio.recordedUri           the file a stopped recording leaves
//   __audio.recordedDurationMs    the length a stopped recording reports
//   __audio.recorders / players   every instance created, in order
//   __audio.reset()               back to the defaults (call in beforeEach)
const React = require('react');

const DEFAULT_PERMISSION = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };

const audioState = {
  permission: { ...DEFAULT_PERMISSION },
  prepareError: null,
  recordedUri: 'file:///tmp/cache/recording-1.m4a',
  recordedDurationMs: 12000,
  recorders: [],
  players: [],
  setAudioModeCalls: [],
  reset() {
    this.permission = { ...DEFAULT_PERMISSION };
    this.prepareError = null;
    this.recordedUri = 'file:///tmp/cache/recording-1.m4a';
    this.recordedDurationMs = 12000;
    this.recorders.length = 0;
    this.players.length = 0;
    this.setAudioModeCalls.length = 0;
  },
};

class MockAudioRecorder {
  constructor(options) {
    this.options = options;
    this.id = `recorder-${audioState.recorders.length + 1}`;
    this.isRecording = false;
    this.uri = null;
    this.currentTime = 0;
    this.durationMillis = 0;
    this.calls = [];
    this.listeners = new Set();
  }

  emitChange() { Array.from(this.listeners).forEach((listener) => listener()); }

  async prepareToRecordAsync(options) {
    this.calls.push({ op: 'prepare', options });
    if (audioState.prepareError) throw audioState.prepareError;
  }

  record(options) {
    this.calls.push({ op: 'record', options });
    this.isRecording = true;
    this.uri = null;
    this.durationMillis = 0;
    this.emitChange();
  }

  async stop() {
    this.calls.push({ op: 'stop' });
    this.isRecording = false;
    this.durationMillis = audioState.recordedDurationMs;
    this.uri = audioState.recordedUri;
    this.emitChange();
  }

  pause() {
    this.calls.push({ op: 'pause' });
    this.isRecording = false;
    this.emitChange();
  }

  getStatus() {
    return {
      canRecord: true,
      isRecording: this.isRecording,
      durationMillis: this.durationMillis,
      mediaServicesDidReset: false,
      url: this.uri,
    };
  }
}

class MockAudioPlayer {
  constructor(source) {
    this.source = source;
    this.id = `player-${audioState.players.length + 1}`;
    this.playing = false;
    this.currentTime = 0;
    this.duration = 0;
    this.calls = [];
    this.listeners = new Set();
  }

  emitChange() { Array.from(this.listeners).forEach((listener) => listener()); }

  play() { this.calls.push({ op: 'play' }); this.playing = true; this.emitChange(); }

  pause() { this.calls.push({ op: 'pause' }); this.playing = false; this.emitChange(); }

  seekTo(seconds) { this.calls.push({ op: 'seekTo', seconds }); this.currentTime = seconds; this.emitChange(); return Promise.resolve(); }

  replace(source) { this.calls.push({ op: 'replace', source }); this.source = source; this.emitChange(); }

  remove() { this.calls.push({ op: 'remove' }); }

  /** Test helper: the clip finished playing. */
  __finish() { this.playing = false; this.currentTime = 0; this.didJustFinish = true; this.emitChange(); this.didJustFinish = false; }

  status() {
    return {
      id: this.id,
      currentTime: this.currentTime,
      duration: this.duration,
      playing: this.playing,
      didJustFinish: !!this.didJustFinish,
      isLoaded: true,
      isBuffering: false,
      loop: false,
      mute: false,
      playbackRate: 1,
      playbackState: this.playing ? 'playing' : 'paused',
      timeControlStatus: this.playing ? 'playing' : 'paused',
      reasonForWaitingToPlay: '',
      shouldCorrectPitch: true,
    };
  }
}

function useAudioRecorder(options) {
  const ref = React.useRef(null);
  if (!ref.current) {
    ref.current = new MockAudioRecorder(options);
    audioState.recorders.push(ref.current);
  }
  return ref.current;
}

function useAudioRecorderState(recorder) {
  const [state, setState] = React.useState(() => recorder.getStatus());
  React.useEffect(() => {
    const listener = () => setState(recorder.getStatus());
    recorder.listeners.add(listener);
    return () => { recorder.listeners.delete(listener); };
  }, [recorder]);
  return state;
}

function useAudioPlayer(source) {
  const ref = React.useRef(null);
  if (!ref.current) {
    ref.current = new MockAudioPlayer(source);
    audioState.players.push(ref.current);
  }
  return ref.current;
}

function useAudioPlayerStatus(player) {
  const [state, setState] = React.useState(() => player.status());
  React.useEffect(() => {
    const listener = () => setState(player.status());
    player.listeners.add(listener);
    return () => { player.listeners.delete(listener); };
  }, [player]);
  return state;
}

function createAudioPlayer(source) {
  const player = new MockAudioPlayer(source);
  audioState.players.push(player);
  return player;
}

const requestRecordingPermissionsAsync = jest.fn(async () => audioState.permission);
const getRecordingPermissionsAsync = jest.fn(async () => audioState.permission);
const setAudioModeAsync = jest.fn(async (mode) => { audioState.setAudioModeCalls.push(mode); });

const RecordingPresets = {
  HIGH_QUALITY: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
    ios: { outputFormat: 'aac ', audioQuality: 127 },
    web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
  },
  LOW_QUALITY: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 64000,
    android: { extension: '.3gp', outputFormat: '3gp', audioEncoder: 'amr_nb' },
    ios: { outputFormat: 'aac ', audioQuality: 0 },
    web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
  },
};

module.exports = {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync: jest.fn(async () => {}),
  RecordingPresets,
  AudioModule: { requestRecordingPermissionsAsync, getRecordingPermissionsAsync, setAudioModeAsync },
  __audio: audioState,
};
