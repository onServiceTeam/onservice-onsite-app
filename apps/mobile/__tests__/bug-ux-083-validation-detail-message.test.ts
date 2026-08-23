import { ApiError } from '../src/services/api';
import { getErrorMessage } from '../src/utils/errors';

it('Bug UX-083 — mobile surfaces the first field-specific server validation detail instead of the generic envelope', () => {
  const error = new ApiError(400, {
    success: false,
    error: {
      message: 'Validation failed. Please check your input.',
      statusCode: 400,
      details: [{ field: 'startTime', message: 'Start time must be a valid 24-hour time in HH:MM format' }],
    },
  }, 'HTTP 400');

  expect(getErrorMessage(error, 'Could not save.')).toBe(
    'Start time must be a valid 24-hour time in HH:MM format',
  );
});
