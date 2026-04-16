import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Request body validation middleware using Zod schemas.
 * Validates req.body against the provided schema.
 */
export function validationMiddleware(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body) as typeof req.body;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed. Please check your input.',
            statusCode: 400,
            details: formattedErrors,
          },
        });
        return;
      }
      next(error);
    }
  };
}
