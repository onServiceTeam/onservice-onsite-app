module.exports = {
  init: jest.fn(),
  wrap: (component) => component,
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
};
