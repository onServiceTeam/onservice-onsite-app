import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Request body validation middleware using Zod schemas.
 *
 * Two call shapes for back-compat:
 *
 * 1. validationMiddleware(bodySchema) — original: validate req.body
 *    against the schema. All existing routes use this form.
 *
 * 2. MED-M05 fix — validationMiddleware({ body?, query?, params? }) —
 *    new shape: pass an object with any combination of body/query/
 *    params schemas. The middleware validates each independently
 *    and writes the parsed values back. Routes that need to validate
 *    list-endpoint query strings (page/pageSize/status/etc.) or URL
 *    params (uuid validation) can now use the same middleware
 *    instead of re-implementing validation per-route.
 *
 * Both shapes yield the same 400 + error.details payload on failure;
 * the `field` in the failure detail is prefixed with `body.`,
 * `query.`, or `params.` so the client can map back to its source.
 */
export interface MultiSchema {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

function isMultiSchema(arg: ZodSchema | MultiSchema): arg is MultiSchema {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    !('parse' in arg) &&
    ('body' in arg || 'query' in arg || 'params' in arg)
  );
}

export function validationMiddleware(schemaOrMulti: ZodSchema | MultiSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (isMultiSchema(schemaOrMulti)) {
        if (schemaOrMulti.body) {
          req.body = schemaOrMulti.body.parse(req.body) as typeof req.body;
        }
        if (schemaOrMulti.query) {
          // Express 5 exposes req.query as a getter on the request prototype,
          // so direct assignment throws in strict mode. Shadow that getter on
          // this request with the parsed value for downstream handlers.
          const parsedQuery = schemaOrMulti.query.parse(req.query);
          Object.defineProperty(req, 'query', {
            value: parsedQuery,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
        if (schemaOrMulti.params) {
          req.params = schemaOrMulti.params.parse(req.params) as typeof req.params;
        }
      } else {
        req.body = schemaOrMulti.parse(req.body) as typeof req.body;
      }
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
