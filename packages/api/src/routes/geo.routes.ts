/**
 * D24 Option A (Ken, 2026-10-18): Google address search through our server.
 * Mounted at /api/v1/geo (server.ts). Every route needs a signed-in user of
 * any role. The apps call these only while GET /api/v1/config says
 * addressSearchAvailable=true, and fall back to typing the address on any
 * error here.
 *
 *   POST /autocomplete  { q, sessionToken, lat?, lng? }  up to 5 suggestions
 *   POST /place         { placeId, sessionToken }        the chosen suggestion as an address
 *   POST /reverse       { lat, lng }                     a map pin as an address
 *
 * Answers: 200 with our own address shape; 400 bad input; 401 not signed in;
 * 404 no usable address for that place; 429 a daily cap was reached; 503
 * address search is off, cooling down, or Google refused or timed out.
 *
 * Why POST (2026-10-18 review): what a customer types, their pin and the
 * place ID are personal data (what they searched for, where they live). In a
 * URL they would land in every web server access log on the way (our nginx
 * logs the whole request line, and the shared front door may too), which the
 * API cannot redact. In a JSON body they are logged nowhere. None of these
 * routes changes anything, but GET would put the values in the URL. Native
 * apps and the web app sign in with a Bearer token, so the admin-cookie CSRF
 * rule in authMiddleware does not get in their way.
 *
 * Errors from this router are answered here, without the shared error
 * handler: refusals (401, 404, 429, 503) are expected and the service already
 * logged any Google failure with its status word only, and an unexpected
 * error's message is never logged in case it quotes the input. The request
 * log redacts these URLs too, as a backstop
 * (utils/address-search-redaction.ts, server.ts).
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { privateResponse } from '../middleware/private-response.middleware';
import { logger } from '../utils/logger';
import * as addressSearch from '../services/geo/address-search.service';
import {
  autocompleteBodySchema, placeBodySchema, reverseBodySchema,
  type AutocompleteBody, type PlaceBody, type ReverseBody,
} from '../validators/geo.validators';

const router = Router();
router.use(privateResponse);
router.use(authMiddleware);

type Handler = (req: AuthenticatedRequest, res: Response) => Promise<void>;
const handle = (fn: Handler) => (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  fn(req, res).catch(next);
};

router.post('/autocomplete', validationMiddleware({ body: autocompleteBodySchema }), handle(async (req, res) => {
  const body = req.body as AutocompleteBody;
  const data = await addressSearch.autocomplete({
    userId: req.user!.userId,
    query: body.q,
    sessionToken: body.sessionToken,
    latitude: body.lat,
    longitude: body.lng,
  });
  res.json({ success: true, data });
}));

router.post('/place', validationMiddleware({ body: placeBodySchema }), handle(async (req, res) => {
  const body = req.body as PlaceBody;
  const data = await addressSearch.placeAddress({
    userId: req.user!.userId,
    placeId: body.placeId,
    sessionToken: body.sessionToken,
  });
  res.json({ success: true, data });
}));

router.post('/reverse', validationMiddleware({ body: reverseBodySchema }), handle(async (req, res) => {
  const body = req.body as ReverseBody;
  const data = await addressSearch.reverseLookup({
    userId: req.user!.userId,
    latitude: body.lat,
    longitude: body.lng,
  });
  res.json({ success: true, data });
}));

/**
 * Same response shape as errorMiddleware, without its log line. Expected
 * refusals (401, 404, 429, 503) are not logged here at all; an unexpected
 * error is logged by its type only, never its message.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
router.use((error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  const operational = error instanceof Error
    && (error as { isOperational?: boolean }).isOperational === true
    && typeof (error as { statusCode?: unknown }).statusCode === 'number';
  if (!operational) {
    logger.error('Address search request failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    res.status(500).json({
      success: false,
      error: { message: 'An unexpected error occurred. Please try again later.', statusCode: 500 },
    });
    return;
  }
  const appError = error as Error & { statusCode: number; code?: string };
  res.status(appError.statusCode).json({
    success: false,
    error: {
      message: appError.message,
      statusCode: appError.statusCode,
      ...(typeof appError.code === 'string' ? { code: appError.code } : {}),
    },
  });
});

export default router;
