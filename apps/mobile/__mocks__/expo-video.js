// D38 Milestone 2 — jest mock for expo-video (request videos in the job
// media gallery). jsdom cannot decode video, so a player is an in-memory
// object and VideoView renders an <rn-video> element carrying the source.
//
// Tests drive it through `__video`:
//   __video.players               every player created, in order
//   player.__emit(event, payload) fire a player event, e.g.
//                                 player.__emit('statusChange', { status: 'error', error: { message: 'HTTP 410' } })
//   __video.reset()               clear the list (call in beforeEach)
const React = require('react');

const videoState = {
  players: [],
  reset() { this.players.length = 0; },
};

function sourceUri(source) {
  if (!source) return null;
  if (typeof source === 'string') return source;
  return source.uri ?? null;
}

class MockVideoPlayer {
  constructor(source) {
    this.source = source;
    this.playing = false;
    this.status = 'readyToPlay';
    this.calls = [];
    this.listeners = new Map();
  }

  play() { this.calls.push({ op: 'play' }); this.playing = true; }

  pause() { this.calls.push({ op: 'pause' }); this.playing = false; }

  replace(source) { this.calls.push({ op: 'replace', source }); this.source = source; }

  async replaceAsync(source) { this.replace(source); }

  release() { this.calls.push({ op: 'release' }); }

  addListener(event, listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(listener);
    return { remove: () => { this.listeners.get(event)?.delete(listener); } };
  }

  __emit(event, payload) {
    if (event === 'statusChange' && payload && payload.status) this.status = payload.status;
    Array.from(this.listeners.get(event) ?? []).forEach((listener) => listener(payload));
  }
}

function useVideoPlayer(source, setup) {
  const ref = React.useRef(null);
  if (!ref.current) {
    ref.current = new MockVideoPlayer(source);
    videoState.players.push(ref.current);
    if (typeof setup === 'function') setup(ref.current);
  } else if (sourceUri(ref.current.source) !== sourceUri(source)) {
    // Like the real hook, a new source replaces the player's source.
    ref.current.replace(source);
  }
  return ref.current;
}

function createVideoPlayer(source) {
  const player = new MockVideoPlayer(source);
  videoState.players.push(player);
  return player;
}

function VideoView({ player, nativeControls, contentFit, accessibilityLabel, style, testID }) {
  return React.createElement('rn-video', {
    'aria-label': accessibilityLabel,
    'data-testid': testID,
    'data-src': sourceUri(player?.source) ?? '',
    'data-native-controls': nativeControls ? 'true' : 'false',
    'data-content-fit': contentFit,
    style: Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
  });
}

module.exports = {
  useVideoPlayer,
  createVideoPlayer,
  VideoView,
  isPictureInPictureSupported: () => false,
  clearVideoCacheAsync: async () => {},
  __video: videoState,
};
