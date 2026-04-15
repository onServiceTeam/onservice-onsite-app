import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Request body validation middleware using Zod schemas.
 * Validates req.body against the provided schema.
 */
export function validationMiddleware(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data as typeof req.body;
      next();
    } else {
      const formattedErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed. Please check your input.',
          statusCode: 400,
          details: formattedErrors,
        },
      });
    }
  };
}
