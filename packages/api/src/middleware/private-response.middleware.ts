import type { RequestHandler } from 'express';

// Mount before authentication on private route families. Successful JSON
// (including short-lived document links) and early errors need the same policy
// as streamed files. This is HTTP cache policy, not erasure of older caches,
// application memory, downloaded documents or stored objects.
export const privateResponse: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
};
