import { NextFunction, Request, Response } from 'express';

const loggerErrorMock = jest.fn();
const loggerWarnMock = jest.fn();

jest.mock('../src/utils/logger', () => ({
  logger: {
    error: (...args: unknown[]) => loggerErrorMock(...args),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
  },
}));

import {
  createAppError,
  errorMiddleware,
} from '../src/middleware/error.middleware';

describe('request-error operational severity', () => {
  it('Bug UX200 — an expected 401 avoids a server alert while an unexpected failure remains an error', () => {
    const request = {
      method: 'GET',
      path: '/api/v1/admin/settings',
      headers: { 'x-request-id': 'request-1' },
    } as unknown as Request;
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    errorMiddleware(
      createAppError('Authentication required. Please log in.', 401),
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Request rejected',
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/admin/settings',
        statusCode: 401,
        requestId: 'request-1',
        stack: undefined,
      }),
    );
    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Authentication required. Please log in.',
        statusCode: 401,
      },
    });

    errorMiddleware(
      new Error('database offline'),
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Request error',
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/admin/settings',
        statusCode: 500,
        error: 'database offline',
        stack: expect.any(String),
      }),
    );
    expect(response.status).toHaveBeenLastCalledWith(500);
    expect(response.json).toHaveBeenLastCalledWith({
      success: false,
      error: {
        message: 'An unexpected error occurred. Please try again later.',
        statusCode: 500,
      },
    });
  });
});
