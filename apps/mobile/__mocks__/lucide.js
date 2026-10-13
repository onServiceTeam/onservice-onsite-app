// lucide-react-native stub for jest.
//
// Every icon name resolves to a component that renders an <Icon> host element
// with its size and color, exactly as before. Human audit 2026-10-13
// (HA-DISC): each component now also carries the lucide export name in a
// `data-icon` attribute, so a render test can check WHICH icon a screen drew
// (for example that the aircon tile shows AirVent). Components are cached per
// name so repeated lookups return the same component.
const React = require('react');

const cache = new Map();

function iconFor(name) {
  if (!cache.has(name)) {
    const Icon = ({ size, color, ...rest }) =>
      React.createElement('Icon', { size, color, 'data-icon': name, ...rest });
    Icon.displayName = `LucideMock(${name})`;
    cache.set(name, Icon);
  }
  return cache.get(name);
}

module.exports = new Proxy(
  {},
  {
    get: (_target, prop) => iconFor(typeof prop === 'string' ? prop : 'Icon'),
  },
);
