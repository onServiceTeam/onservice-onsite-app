const React = require('react');
const passthrough = (name) => ({ children, ...rest }) =>
  React.createElement(name, rest, children);
module.exports = {
  GestureHandlerRootView: passthrough('GestureHandlerRootView'),
  PanGestureHandler: passthrough('PanGestureHandler'),
  TapGestureHandler: passthrough('TapGestureHandler'),
  Swipeable: passthrough('Swipeable'),
};
