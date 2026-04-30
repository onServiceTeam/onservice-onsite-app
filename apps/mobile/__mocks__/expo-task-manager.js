module.exports = {
  defineTask: jest.fn(),
  isTaskDefined: jest.fn().mockReturnValue(false),
  unregisterAllTasksAsync: jest.fn().mockResolvedValue(undefined),
};
