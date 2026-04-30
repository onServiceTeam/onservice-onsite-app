const React = require('react');
module.exports = {
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/',
  Link: ({ children, ...rest }) => React.createElement('Link', rest, children),
  Stack: { Screen: () => null },
  Tabs: { Screen: () => null },
  Slot: () => null,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
};
