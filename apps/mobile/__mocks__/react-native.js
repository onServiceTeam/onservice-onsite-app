// Phase 14 R5b — react-native stub for jest.
// Renders RN primitives as plain DOM-ish elements so react-test-renderer
// can produce a JSON tree we can assert on.
const React = require('react');

// Use lowercase host element names so React's renderer accepts them
// and doesn't drop the children. react-test-renderer tolerates
// arbitrary string host types but React 19 has stricter rules for
// uppercase-string-host elements; keep names lowercase.
//
// Map RN accessibility props to standard ARIA attributes so RTL queries
// (getByLabel, querySelector('[aria-label]'), etc.) work natively.
function mapA11yProps({ accessibilityLabel, accessibilityRole, accessibilityHint, accessibilityState, accessibilityLiveRegion, accessibilityViewIsModal, testID, ...rest }) {
  const ariaProps = {};
  if (accessibilityLabel !== undefined) ariaProps['aria-label'] = accessibilityLabel;
  if (accessibilityRole !== undefined) ariaProps.role = accessibilityRole;
  if (accessibilityHint !== undefined) ariaProps['aria-describedby'] = accessibilityHint;
  if (accessibilityState && accessibilityState.disabled) ariaProps['aria-disabled'] = true;
  if (accessibilityState && accessibilityState.checked !== undefined) ariaProps['aria-checked'] = accessibilityState.checked;
  if (accessibilityState && accessibilityState.selected !== undefined) ariaProps['aria-selected'] = accessibilityState.selected;
  if (accessibilityState && accessibilityState.busy) ariaProps['aria-busy'] = true;
  if (accessibilityLiveRegion !== undefined) ariaProps['aria-live'] = accessibilityLiveRegion;
  if (testID !== undefined) ariaProps['data-testid'] = testID;
  return { ...rest, ...ariaProps };
}

const passthrough = (name) =>
  function HostComponent(props) {
    const { children, ...rest } = props;
    return React.createElement(name, mapA11yProps(rest), children);
  };

const View = passthrough('rn-view');
const Text = passthrough('rn-text');
const ScrollView = passthrough('rn-scroll-view');
const KeyboardAvoidingView = passthrough('rn-kav');
// Modal respects the `visible` prop — the real RN Modal hides
// children when visible=false. Without this our mock would render
// modal contents in the initial DOM, breaking tests that assert on
// modal-closed-by-default state.
const Modal = ({ visible = true, children, ...rest }) => {
  if (!visible) return null;
  return React.createElement('rn-modal', mapA11yProps(rest), children);
};
const RefreshControl = passthrough('rn-refresh-control');
const Image = passthrough('rn-image');
const FlatList = ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, ...rest }) => {
  const items = (data || []).map((item, index) =>
    renderItem ? renderItem({ item, index }) : null,
  );
  return React.createElement(
    'FlatList',
    rest,
    ListHeaderComponent
      ? typeof ListHeaderComponent === 'function'
        ? React.createElement(ListHeaderComponent)
        : ListHeaderComponent
      : null,
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

const SectionList = ({ sections, renderItem, renderSectionHeader, ListEmptyComponent, ListHeaderComponent, ListFooterComponent, ...rest }) => {
  const children = [];
  const secs = sections || [];
  secs.forEach((section, si) => {
    if (renderSectionHeader) {
      children.push(React.createElement(React.Fragment, { key: `h${si}` }, renderSectionHeader({ section })));
    }
    (section.data || []).forEach((item, index) => {
      if (renderItem) {
        children.push(React.createElement(React.Fragment, { key: `i${si}-${index}` }, renderItem({ item, index, section })));
      }
    });
  });
  const isEmpty = secs.every((s) => !s.data || s.data.length === 0);
  return React.createElement(
    'rn-section-list',
    rest,
    ListHeaderComponent
      ? (typeof ListHeaderComponent === 'function' ? React.createElement(ListHeaderComponent) : ListHeaderComponent)
      : null,
    ...children,
    isEmpty && ListEmptyComponent
      ? (typeof ListEmptyComponent === 'function' ? React.createElement(ListEmptyComponent) : ListEmptyComponent)
      : null,
    ListFooterComponent
      ? (typeof ListFooterComponent === 'function' ? React.createElement(ListFooterComponent) : ListFooterComponent)
      : null,
  );
};

// Render Pressable as a real <button> so click events fire normally.
// disabled prop maps directly; onPress maps to onClick.
const Pressable = ({ children, onPress, disabled, ...rest }) => {
  const a11y = mapA11yProps(rest);
  const isDisabled = !!(disabled || a11y['aria-disabled']);
  return React.createElement(
    'button',
    {
      ...a11y,
      onClick: () => {
        if (isDisabled) return;
        if (onPress) onPress();
      },
      disabled: isDisabled,
      role: a11y.role || 'button',
    },
    children,
  );
};

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

// Hook form of Dimensions used by useResponsive(). Phone-width by default so
// screens render their phone layout in tests.
const useWindowDimensions = () => ({ width: 390, height: 844, scale: 3, fontScale: 1 });

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
  spring: () => ({ start: (cb) => cb && cb({ finished: true }) }),
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
  SectionList,
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
  useWindowDimensions,
  StyleSheet,
  Animated,
  Easing,
  BackHandler,
  AppState,
  UIManager,
  LayoutAnimation,
  NativeModules,
};
