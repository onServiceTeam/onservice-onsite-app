// Phase 14 R5b — react-native stub for jest.
// Renders RN primitives as plain DOM-ish elements so react-test-renderer
// can produce a JSON tree we can assert on.
const React = require('react');

// Use lowercase host element names so React's renderer accepts them
// and doesn't drop the children. react-test-renderer tolerates
// arbitrary string host types but React 19 has stricter rules for
// uppercase-string-host elements; keep names lowercase.
const passthrough = (name) =>
  function HostComponent({ children, ...rest }) {
    return React.createElement(name, rest, children);
  };

const View = passthrough('rn-view');
const Text = passthrough('rn-text');
const ScrollView = passthrough('rn-scroll-view');
const KeyboardAvoidingView = passthrough('rn-kav');
const Modal = passthrough('rn-modal');
const RefreshControl = passthrough('rn-refresh-control');
const Image = passthrough('rn-image');
const FlatList = ({ data, renderItem, ListEmptyComponent, ListFooterComponent, ...rest }) => {
  const items = (data || []).map((item, index) =>
    renderItem ? renderItem({ item, index }) : null,
  );
  return React.createElement(
    'FlatList',
    rest,
    ...items,
    items.length === 0 && ListEmptyComponent
      ? typeof ListEmptyComponent === 'function'
        ? React.createElement(ListEmptyComponent)
        : ListEmptyComponent
      : null,
    ListFooterComponent
      ? typeof ListFooterComponent === 'function'
        ? React.createElement(ListFooterComponent)
        : ListFooterComponent
      : null,
  );
};

// Render Pressable as a real <button> so click events fire normally.
// disabled prop maps directly; onPress maps to onClick.
const Pressable = ({ children, onPress, disabled, accessibilityState, accessibilityRole, accessibilityLabel, accessibilityHint, testID, style, ...rest }) =>
  React.createElement(
    'button',
    {
      onClick: () => {
        if (disabled || (accessibilityState && accessibilityState.disabled)) return;
        if (onPress) onPress();
      },
      disabled: !!(disabled || (accessibilityState && accessibilityState.disabled)),
      'aria-label': accessibilityLabel,
      'aria-describedby': accessibilityHint,
      role: accessibilityRole || 'button',
      'data-testid': testID,
      style,
      ...rest,
    },
    children,
  );

const TouchableOpacity = Pressable;
const TouchableHighlight = Pressable;

// Render TextInput as a real <input> so RTL's fireEvent.input works.
// onChangeText is RN-specific; convert browser-style onChange events.
const TextInput = ({ value, onChangeText, placeholder, accessibilityLabel, testID, keyboardType, autoFocus, autoComplete, textContentType, maxLength, ...rest }) =>
  React.createElement('input', {
    value: value ?? '',
    placeholder,
    'aria-label': accessibilityLabel,
    'data-testid': testID,
    autoFocus,
    maxLength,
    onChange: (e) => onChangeText && onChangeText(e.target.value),
    ...rest,
  });

const Switch = ({ value, onValueChange, ...rest }) =>
  React.createElement('Switch', { value, onValueChange, ...rest });

const ActivityIndicator = passthrough('rn-activity-indicator');

const Alert = {
  alert: jest.fn(),
};

const Linking = {
  openURL: jest.fn().mockResolvedValue(undefined),
  canOpenURL: jest.fn().mockResolvedValue(true),
};

const Platform = {
  OS: 'ios',
  Version: '17.0',
  select: (obj) => obj.ios ?? obj.default,
  isPad: false,
  isTV: false,
};

const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  addEventListener: () => ({ remove: () => {} }),
};

const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => {
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.filter(Boolean));
    }
    return style ?? {};
  },
  hairlineWidth: 1,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
};

const Animated = {
  View: passthrough('rn-animated-view'),
  Text: passthrough('rn-animated-text'),
  ScrollView: passthrough('rn-animated-scroll-view'),
  Image: passthrough('rn-animated-image'),
  Value: class AnimatedValue {
    constructor(value) {
      this._value = value;
    }
    setValue(v) {
      this._value = v;
    }
    interpolate() {
      return this;
    }
  },
  timing: () => ({ start: (cb) => cb && cb({ finished: true }) }),
  parallel: (animations) => ({
    start: (cb) => {
      animations.forEach((a) => a && a.start && a.start());
      cb && cb({ finished: true });
    },
  }),
  sequence: (animations) => ({
    start: (cb) => {
      animations.forEach((a) => a && a.start && a.start());
      cb && cb({ finished: true });
    },
  }),
  loop: (animation) => ({
    start: () => animation && animation.start && animation.start(),
    stop: () => {},
  }),
};

const Easing = {
  linear: (t) => t,
  ease: (t) => t,
  inOut: () => (t) => t,
  in: () => (t) => t,
  out: () => (t) => t,
  bezier: () => (t) => t,
};

const BackHandler = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  removeEventListener: jest.fn(),
  exitApp: jest.fn(),
};

const AppState = {
  currentState: 'active',
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

const UIManager = {
  setLayoutAnimationEnabledExperimental: jest.fn(),
  measure: jest.fn(),
  measureInWindow: jest.fn(),
};

const LayoutAnimation = {
  configureNext: jest.fn(),
  Presets: { spring: {}, easeInEaseOut: {}, linear: {} },
};

const NativeModules = {};

module.exports = {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Modal,
  RefreshControl,
  Image,
  FlatList,
  Pressable,
  TouchableOpacity,
  TouchableHighlight,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Dimensions,
  StyleSheet,
  Animated,
  Easing,
  BackHandler,
  AppState,
  UIManager,
  LayoutAnimation,
  NativeModules,
};
