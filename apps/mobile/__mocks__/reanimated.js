const React = require('react');
const passthrough = (name) => ({ children, ...rest }) =>
  React.createElement(name, rest, children);
module.exports = {
  default: { View: passthrough('AnimatedView'), Text: passthrough('AnimatedText') },
  View: passthrough('AnimatedView'),
  Text: passthrough('AnimatedText'),
  useSharedValue: (v) => ({ value: v }),
  useAnimatedStyle: () => ({}),
  withTiming: (v) => v,
  withSpring: (v) => v,
};
