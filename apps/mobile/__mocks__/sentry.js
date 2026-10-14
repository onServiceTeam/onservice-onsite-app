module.exports = {
  init: jest.fn(),
  wrap: (component) => component,
  captureException: jest.fn(),
  // D38 Milestone 2: push registration failures are reported once per run.
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
};
