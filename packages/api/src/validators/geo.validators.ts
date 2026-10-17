import { z } from 'zod';
import { phLatitude, phLongitude } from './ph-coords';

/**
 * D24 Option A address search inputs (routes/geo.routes.ts). The three
 * routes are POST with a JSON body, so what a customer types, their pin and
 * the place they chose never sit in a URL (web server access logs record the
 * full request line). Coordinates are JSON numbers held to the same
 * Philippine bounds as every other coordinate validator (ph-coords.ts,
 * migration 074). Error messages never repeat the value that was sent: it can
 * be a home address or a home location.
 */

/**
 * Google's Places API (New) reference for places.autocomplete and places.get
 * (https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/autocomplete,
 * read 2026-10-18) says the session token "Must be a URL and filename safe
 * base64 string with at most 36 ASCII characters in length. Otherwise an
 * INVALID_ARGUMENT error is returned." Google recommends a version 4 UUID,
 * which is exactly 36 characters
 * (https://developers.google.com/maps/documentation/places/web-service/place-session-tokens).
 * A longer token is refused here, before it is counted or sent to Google.
 */
export const sessionTokenSchema = z.string()
  .regex(/^[A-Za-z0-9_-]{16,36}$/, 'Session token must be 16 to 36 letters, digits, dashes or underscores.');

/** Google place IDs: URL-safe characters only. */
export const placeIdSchema = z.string()
  .regex(/^[A-Za-z0-9_-]{10,512}$/, 'Place ID is not in a recognised format.');

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const searchText = z.string()
  .refine((value) => !CONTROL_CHARACTERS.test(value), 'Search text contains unsupported characters.')
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string()
    .min(2, 'Type at least 2 characters to search.')
    .max(120, 'Search text must be 120 characters or fewer.'));

export const autocompleteBodySchema = z.object({
  q: searchText,
  sessionToken: sessionTokenSchema,
  lat: phLatitude.optional(),
  lng: phLongitude.optional(),
}).strict().refine((body) => (body.lat === undefined) === (body.lng === undefined), {
  message: 'Send both lat and lng, or neither.',
  path: ['lat'],
});

export const placeBodySchema = z.object({
  placeId: placeIdSchema,
  sessionToken: sessionTokenSchema,
}).strict();

export const reverseBodySchema = z.object({ lat: phLatitude, lng: phLongitude }).strict();

export type AutocompleteBody = z.infer<typeof autocompleteBodySchema>;
export type PlaceBody = z.infer<typeof placeBodySchema>;
export type ReverseBody = z.infer<typeof reverseBodySchema>;
