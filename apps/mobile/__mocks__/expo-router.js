const React = require('react');
module.exports = {
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/',
  Link: ({ children, ...rest }) => React.createElement('Link', rest, children),
  Redirect: ({ href }) => React.createElement('span', { 'aria-label': `Redirect to ${href}` }, href),
  Stack: { Screen: () => null },
  Tabs: { Screen: () => null },
  Slot: () => null,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
};
