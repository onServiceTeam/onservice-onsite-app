/**
 * D24 Option A (Ken, 2026-10-18; D41 Q16): Google address search through our
 * own server, Philippines only, with daily caps.
 *
 *   autocomplete   Places API (New) Autocomplete: short suggestion list while
 *                  the customer types.
 *   placeAddress   Places API (New) Place Details for the suggestion the
 *                  customer picked; ends Google's billing session.
 *   reverseLookup  Geocoding API: the customer's map pin to an address.
 *
 * Every result is a PREFILL. The customer can edit every field before saving;
 * nothing here writes an address.
 *
 * Built and tested on 2026-10-18 with mocked Google answers only. Billing on
 * Ken's Google Cloud project was off that day (Geocoding answered
 * REQUEST_DENIED "You must enable Billing", Places API (New) answered 403
 * PERMISSION_DENIED), so no live call has succeeded yet. Until a key is set
 * and billing is on, GET /api/v1/config says addressSearchAvailable=false and
 * the apps keep today's picker.
 *
 * Privacy and secrets (personal data: what a customer types, their pin and
 * the address that comes back):
 *   - the server key goes in the X-Goog-Api-Key header for Places and in the
 *     URL for Geocoding (that API takes it only there). No URL, request body
 *     or Google response is ever logged; redirects are refused so the key is
 *     never forwarded;
 *   - warnings carry the operation and Google's status word only;
 *   - responses are mapped to our own shape; raw Google payloads are never
 *     returned.
 *
 * Caching (Google Maps Platform Service Specific Terms, read 2026-10-18 from
 * https://cloud.google.com/maps-platform/terms/maps-service-terms, "Last
 * modified October 15, 2026"):
 *   - A.3 "Google ID Caching": "Customer may cache ... (a) place_id from
 *     Places API". Place IDs may be stored (we return them; the app may keep
 *     them).
 *   - 14.3 (Places API): "Customer may temporarily cache latitude and
 *     longitude values from the Places API for up to 30 consecutive calendar
 *     days, after which Customer must delete the cached latitude and longitude
 *     values." Nothing else from Places may be cached.
 *   - 6.3.1 (Geocoding API) allows the same 30 days for lat/lng only, and
 *     6.3.2 allows longer caching of addresses only "where the cache is not
 *     used as a replacement for making an additional call to the Services" and
 *     only per End User.
 *   So this service caches NO Google content: a details or reverse answer is
 *   only useful with its address components, which neither section lets us
 *   keep as a call-saving cache. Every lookup calls Google (inside the caps).
 *
 * Map and storage rules that bind the app batch, not this service (same
 * terms page, plus https://developers.google.com/maps/documentation/places/web-service/policies,
 * both read 2026-10-18):
 *   - 14.2 (Places API): "Customer must not use Google Maps Content from the
 *     Places API in conjunction with a non-Google map." 6.2 says the same for
 *     the Geocoding API. The admin Dispatch Console map is Leaflet with
 *     OpenStreetMap tiles; once the app saves Google-prefilled addresses and
 *     coordinates, bookings carrying them would be drawn on that map.
 *   - Places policies, "Autocomplete for end user addresses": a street
 *     address the end user selects is freed from the content rules only
 *     "solely for that end user's specific transaction"; the exception "does
 *     not apply to the list of suggested addresses" or to "any POI or address
 *     lookup functionality offered by other Google Maps Platform Services".
 *   - 6.3.2 (Geocoding API): longer storage of addresses only per End User:
 *     "Cached data must be logically isolated to the specific End User it is
 *     associated with and must not be used across multiple End Users."
 *     Providers and admins seeing a saved address are other users.
 *   Whether a customer-confirmed saved address may keep Google's coordinates
 *   and address text beyond 30 days, and be shown to providers and on the
 *   OpenStreetMap dispatch map, is a terms question for Ken and the attorney
 *   (LAUNCH-LIMITATIONS section 140). Nothing here decides it.
 */
import { z } from 'zod';
import { createAppError, type AppError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';
import { redis } from '../../config/redis.config';
import { platformConfig } from '../../config/platform.config';
import { getGoogleMapsServerKey, isGoogleMapsServerKeyConfigured } from '../../config/google-maps.config';
import { getAddressSearchPolicy, type AddressSearchPolicy } from '../settings.service';
import * as serviceAreaService from '../service-area.service';
import { phLatitude, phLongitude } from '../../validators/ph-coords';
import {
  ADDRESS_SEARCH_COOLDOWN_KEY,
  ADDRESS_SEARCH_COUNTER_TTL_SECONDS,
  ADDRESS_SEARCH_LAST_STATUS_KEY,
  ADDRESS_SEARCH_LAST_STATUS_TTL_SECONDS,
  type AddressSearchOperation,
  addressSearchCapsAllowCalls,
  addressSearchKeys,
  manilaDay,
  readAddressSearchCooldown,
  userBucketFor,
  withRedisTimeout,
} from './address-search-state';

// ── Google endpoints ──

const PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACES_DETAILS_URL_PREFIX = 'https://places.googleapis.com/v1/places/';
const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Autocomplete response fields we read. The mask only trims the response;
 * Autocomplete is billed per request (or per session) whatever it asks for.
 */
export const AUTOCOMPLETE_FIELD_MASK =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat';

/**
 * Place Details field mask: the cheapest that still gives a location and the
 * address parts. From https://developers.google.com/maps/documentation/places/web-service/place-details
 * (read 2026-10-18):
 *   - `id` is in "Place Details Essentials IDs Only";
 *   - `formattedAddress`, `location` and `addressComponents` are in "Place
 *     Details Essentials";
 *   - `displayName` (a shop or building name) is in "Place Details Pro", so
 *     it is NOT asked for. The app already has the name from the suggestion's
 *     main text.
 * The call is therefore billed as Place Details Essentials. Per
 * https://developers.google.com/maps/documentation/places/web-service/session-pricing,
 * a session that ends with an Essentials details call bills its first 12
 * autocomplete requests at the Autocomplete Requests rate and any after that
 * free; adding a Pro field would bill the details call at the Enterprise +
 * Atmosphere rate instead. Prices themselves were not checked here.
 */
export const PLACE_DETAILS_FIELD_MASK = 'id,formattedAddress,location,addressComponents';

const MAX_SUGGESTIONS = 5;
const MAX_RESPONSE_BYTES = 512 * 1024;
const STATUS_WORD = /^[A-Z][A-Z0-9_]{1,59}$/;

// ── Messages (plain words; never Google's own text) ──

export const ADDRESS_SEARCH_UNAVAILABLE_MESSAGE = 'Address search is unavailable right now. Please type your address.';
export const ADDRESS_SEARCH_USER_LIMIT_MESSAGE = 'You have reached today\'s address search limit. Please type your address.';
export const ADDRESS_SEARCH_DAILY_LIMIT_MESSAGE = 'Address search has reached today\'s limit. Please type your address.';
export const ADDRESS_NOT_FOUND_MESSAGE = 'We could not find that address. Please choose another suggestion or type your address.';

function addressSearchError(message: string, statusCode: number, code: string): AppError {
  const error = createAppError(message, statusCode);
  error.code = code;
  return error;
}

const unavailable = (): AppError => addressSearchError(ADDRESS_SEARCH_UNAVAILABLE_MESSAGE, 503, 'address_search_unavailable');

function isAppError(error: unknown): error is AppError {
  return error instanceof Error && (error as Partial<AppError>).isOperational === true;
}

// ── Our address shape (matches validators/address.validators.ts) ──

/** One address part from either Google API, normalised. */
export interface AddressComponent {
  longText: string;
  shortText: string;
  types: readonly string[];
}

/**
 * The fields of createAddressSchema, prefilled. `fullAddress` is the street
 * line the app shows first (house number and street, or a building or place
 * name); barangay, city and province are separate, as in user_addresses.
 */
export interface MappedAddress {
  fullAddress: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  zipCode: string | null;
}

interface MappedAddressWithCountry extends MappedAddress {
  countryCode: string | null;
}

function clip(value: string | null | undefined, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function firstOfType(components: readonly AddressComponent[], type: string): AddressComponent | undefined {
  return components.find((component) => component.types.includes(type));
}

const BARANGAY_PREFIX = /^(?:barangay|brgy\.?|bgy\.?)\s+/i;

/**
 * Types that are never a barangay, even when Google's name starts with
 * "Barangay" (a street called "Barangay Road", for example).
 */
const NOT_BARANGAY_TYPES = new Set([
  'street_number', 'route', 'street_address', 'premise', 'subpremise', 'point_of_interest',
  'establishment', 'locality', 'administrative_area_level_1', 'administrative_area_level_2',
  'administrative_area_level_3', 'country', 'postal_code', 'plus_code',
]);

/**
 * Where Philippine barangays appear in Google's answers, most trusted first.
 * Google labels them inconsistently. The order below comes from Google's
 * type list (https://developers.google.com/maps/documentation/geocoding/requests-geocoding,
 * "Address types and address component types": sublocality_level_1..5 are
 * "civil entit[ies] below a locality", neighborhood is "a named
 * neighborhood", administrative_area_level_4..7 are lower civil divisions)
 * and from public examples. UNVERIFIED for Philippine results until a live
 * call works:
 *   - sublocality_level_1: seen for barangays and for Manila districts (for
 *     example "Malate"), which are not barangays;
 *   - administrative_area_level_5 and _4: the lower civil divisions; not
 *     confirmed for the Philippines;
 *   - neighborhood: seen for barangays, and for subdivisions or villages
 *     (see DEVELOPMENT_NAME);
 *   - sublocality, sublocality_level_2: last resort.
 * A part whose name starts with "Barangay" or "Brgy" wins over all of these.
 * When no part looks like a barangay the field stays empty for the customer
 * to fill in: a blank is safer than a wrong barangay. Wrong guesses that do
 * get through are acceptable only because the customer sees and can edit
 * the barangay before saving.
 */
const BARANGAY_TYPE_ORDER = [
  'sublocality_level_1',
  'administrative_area_level_5',
  'administrative_area_level_4',
  'neighborhood',
  'sublocality',
  'sublocality_level_2',
] as const;

/**
 * Words that mark a housing development, not a barangay: "Villa Verde
 * Subdivision", "Maria Luisa Estate Park", "Phase 2". Google can label such a
 * development "neighborhood"; it is never prefilled as the barangay. The list
 * is deliberately narrow. "Village", "Homes" and "Park" are NOT on it, because
 * official barangays carry them (Teachers Village East, U.P. Village and
 * Sikatuna Village in Quezon City; BF Homes and Marcelo Green Village in
 * Parañaque; Forbes Park in Makati), and blanking a real barangay is worse
 * than prefilling a development name the customer corrects. UNVERIFIED
 * against live Philippine answers, like the type order above.
 */
const DEVELOPMENT_NAME = /\b(?:subdivision|subd|estates?|residences?|townhomes|condominiums?|condo|phase\s*(?:\d+|[ivx]+))\b/i;

function sameName(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function pickBarangay(components: readonly AddressComponent[], city: string | null, province: string | null): string | null {
  const usable = (name: string): boolean => {
    const stripped = name.replace(BARANGAY_PREFIX, '').trim();
    return stripped.length > 0 && !sameName(stripped, city) && !sameName(stripped, province);
  };
  const labelled = components.find((component) => BARANGAY_PREFIX.test(component.longText)
    && !component.types.some((type) => NOT_BARANGAY_TYPES.has(type))
    && usable(component.longText));
  if (labelled) return labelled.longText.replace(BARANGAY_PREFIX, '').trim();
  for (const type of BARANGAY_TYPE_ORDER) {
    const match = components.find((component) => component.types.includes(type)
      && usable(component.longText)
      && !DEVELOPMENT_NAME.test(component.longText));
    if (match) return match.longText.replace(BARANGAY_PREFIX, '').trim();
  }
  return null;
}

/** Metro Manila has no province; addresses there name the region instead. */
const NCR_NAMES = /^(?:metro manila|national capital region|ncr)$/i;

/**
 * Map Google address parts to our address shape.
 *
 *   street    street_number + route ("123 Gorordo Avenue"), led by any
 *             subpremise (unit) and premise (building) or point of interest
 *             name. Null when Google gives none of these; the app then keeps
 *             the suggestion's main text.
 *   barangay  see BARANGAY_TYPE_ORDER (UNVERIFIED for the Philippines).
 *   city      locality ("Cebu City", "Mandaue City"); for a municipality
 *             with no locality, administrative_area_level_3.
 *   province  administrative_area_level_2 ("Cebu"); for Metro Manila, where
 *             Google may give no level 2, "Metro Manila" from level 1.
 *             UNVERIFIED for Metro Manila until a live call works.
 *   region    administrative_area_level_1 ("Central Visayas").
 *   zipCode   postal_code.
 * Every value is trimmed and cut to the column sizes of user_addresses.
 *
 * `placeName: false` (reverse lookups) leaves point of interest and
 * establishment names out of the street line: a pin dropped on a home next
 * to a shop must not be prefilled with the shop's name. A suggestion the
 * customer chose by name keeps it.
 */
export function mapAddressComponents(
  components: readonly AddressComponent[],
  options: { placeName?: boolean } = {},
): MappedAddressWithCountry {
  const text = (type: string): string | null => clip(firstOfType(components, type)?.longText, 200);
  const placeName = options.placeName ?? true;

  const region = text('administrative_area_level_1');
  const city = text('locality') ?? text('administrative_area_level_3');
  const province = text('administrative_area_level_2') ?? (region && NCR_NAMES.test(region) ? 'Metro Manila' : null);

  const streetNumber = text('street_number');
  const route = text('route');
  const streetLine = [streetNumber, route].filter(Boolean).join(' ') || null;
  const building = text('premise') ?? (placeName ? text('point_of_interest') ?? text('establishment') : null);
  const unit = text('subpremise');
  const parts: string[] = [];
  for (const part of [unit, building, streetLine]) {
    if (part && !parts.some((existing) => sameName(existing, part))) parts.push(part);
  }

  return {
    fullAddress: clip(parts.join(', '), 500),
    barangay: clip(pickBarangay(components, city, province), 100),
    city: clip(city, 100),
    province: clip(province, 100),
    region: clip(region, 100),
    zipCode: clip(text('postal_code'), 10),
    countryCode: clip(firstOfType(components, 'country')?.shortText, 2)?.toUpperCase() ?? null,
  };
}

const placesComponentSchema = z.object({
  longText: z.string().optional(),
  shortText: z.string().optional(),
  types: z.array(z.string()).optional(),
});

const geocodingComponentSchema = z.object({
  long_name: z.string().optional(),
  short_name: z.string().optional(),
  types: z.array(z.string()).optional(),
});

function normalizePlacesComponents(raw: z.infer<typeof placesComponentSchema>[] | undefined): AddressComponent[] {
  return (raw ?? []).map((component) => ({
    longText: component.longText ?? component.shortText ?? '',
    shortText: component.shortText ?? component.longText ?? '',
    types: component.types ?? [],
  })).filter((component) => component.longText.length > 0);
}

function normalizeGeocodingComponents(raw: z.infer<typeof geocodingComponentSchema>[] | undefined): AddressComponent[] {
  return (raw ?? []).map((component) => ({
    longText: component.long_name ?? component.short_name ?? '',
    shortText: component.short_name ?? component.long_name ?? '',
    types: component.types ?? [],
  })).filter((component) => component.longText.length > 0);
}

// ── Reverse result choice ──

const geocodingResultSchema = z.object({
  address_components: z.array(geocodingComponentSchema).optional(),
  formatted_address: z.string().optional(),
  place_id: z.string().optional(),
  types: z.array(z.string()).optional(),
});

const geocodingResponseSchema = z.object({
  status: z.string(),
  results: z.array(geocodingResultSchema).optional(),
});

type GeocodingResult = z.infer<typeof geocodingResultSchema>;

/**
 * Street-level result types, best first. A street or intersection ranks
 * above a point of interest or establishment: for a pin, a shop or office
 * nearby is a neighbour, not the customer's address.
 */
const REVERSE_TYPE_PRIORITY = [
  'street_address', 'premise', 'subpremise', 'route', 'intersection', 'point_of_interest', 'establishment',
] as const;

function reverseRank(result: GeocodingResult): number {
  const types = result.types ?? [];
  const index = REVERSE_TYPE_PRIORITY.findIndex((type) => types.includes(type));
  return index === -1 ? REVERSE_TYPE_PRIORITY.length : index;
}

export interface ReverseChoice {
  address: MappedAddressWithCountry;
  formattedAddress: string | null;
  placeId: string | null;
}

/**
 * Choose the best street-level result from a reverse lookup (Google says the
 * most exact result is "generally" first, but not always), then fill any part
 * it lacks (barangay, city, province, region, postal code) from the areas
 * that contain the pin. The street line comes only from the chosen result,
 * without any point of interest name.
 *
 * Gap-fill reads only results whose own types include "political" (a
 * barangay, city, province or region area). Google lists nearby addresses,
 * shops and streets before the containing areas, and a nearby one can sit in
 * the next barangay over, so those are never used to fill the barangay.
 */
export function chooseReverseResult(results: readonly GeocodingResult[]): ReverseChoice | null {
  if (results.length === 0) return null;
  let best = results[0]!;
  let bestRank = reverseRank(best);
  for (const result of results.slice(1)) {
    const rank = reverseRank(result);
    if (rank < bestRank) {
      best = result;
      bestRank = rank;
    }
  }
  const address = mapAddressComponents(normalizeGeocodingComponents(best.address_components), { placeName: false });
  for (const other of results) {
    if (other === best || !(other.types ?? []).includes('political')) continue;
    const fill = mapAddressComponents(normalizeGeocodingComponents(other.address_components), { placeName: false });
    address.barangay ??= fill.barangay;
    address.city ??= fill.city;
    address.province ??= fill.province;
    address.region ??= fill.region;
    address.zipCode ??= fill.zipCode;
    address.countryCode ??= fill.countryCode;
  }
  return {
    address,
    formattedAddress: clip(best.formatted_address, 500),
    placeId: typeof best.place_id === 'string' && PLACE_ID.test(best.place_id) ? best.place_id : null,
  };
}

// ── Google calls ──

/** Google place IDs are URL-safe strings; most are 27 characters, some much longer. */
export const PLACE_ID = /^[A-Za-z0-9_-]{10,512}$/;

type GoogleFailureKind = 'refused' | 'timeout' | 'network' | 'failed' | 'not_found';

type GoogleOutcome<T> =
  | { kind: 'ok'; value: T; word: string }
  | { kind: GoogleFailureKind; word: string; httpStatus?: number; reason?: string };

type RawResponse =
  | { kind: 'response'; status: number; ok: boolean; json: unknown }
  | { kind: 'timeout' }
  | { kind: 'network' };

async function readJsonBody(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = (): void => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) {
      cancel();
      return null;
    }
    while (true) {
      const { value, done } = await reader.read();
      if (signal.aborted) return null;
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    // Parse errors can quote response bytes: never surface their message.
    return null;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/** One bounded call. The deadline covers the headers and the body. */
async function callGoogle(url: string, init: RequestInit, timeoutMs: number): Promise<RawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();
  try {
    const response = await globalThis.fetch(url, {
      ...init,
      // The key travels with the request; no redirect may receive it.
      redirect: 'error',
      signal: controller.signal,
    });
    const json = await readJsonBody(response, controller.signal);
    if (controller.signal.aborted) return { kind: 'timeout' };
    return { kind: 'response', status: response.status, ok: response.ok, json };
  } catch {
    // Exception messages can carry the request URL (and with it the
    // Geocoding key). Only the kind of failure is kept.
    return controller.signal.aborted ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

const placesErrorSchema = z.object({
  error: z.object({
    status: z.string().optional(),
    details: z.array(z.object({ reason: z.string().optional() }).passthrough()).optional(),
  }).passthrough(),
}).passthrough();

/**
 * Places API (New) errors: { error: { code, message, status, details } }.
 * Billing off, an API that is not enabled and key restrictions come back as
 * 403 PERMISSION_DENIED (seen 2026-10-18), quotas as 429 RESOURCE_EXHAUSTED,
 * a bad key as 400 INVALID_ARGUMENT with an API_KEY_* reason, and an unknown
 * place ID as 404 NOT_FOUND. Only the status and reason words are read; the
 * message is never read.
 *
 * Only a 404 means "no such place". Any other 400 (INVALID_ARGUMENT) means
 * our request was malformed: a field mask, a session token or a place ID
 * Google will not take. That is a 503 with a warning carrying Google's status
 * word, so a mistake of ours shows in the logs and on the admin status card
 * instead of looking like every address is missing. It starts no pause.
 */
function classifyPlacesFailure(status: number, json: unknown, missingMeansNotFound: boolean): GoogleOutcome<never> {
  const parsed = placesErrorSchema.safeParse(json);
  const statusWord = parsed.success ? parsed.data.error.status : undefined;
  const word = statusWord && STATUS_WORD.test(statusWord) ? statusWord : `HTTP_${status}`;
  const rawReason = parsed.success ? parsed.data.error.details?.find((detail) => typeof detail.reason === 'string')?.reason : undefined;
  const reason = rawReason && STATUS_WORD.test(rawReason) ? rawReason : undefined;
  const base = { word, httpStatus: status, ...(reason ? { reason } : {}) };
  if (status === 401 || status === 403 || status === 429) return { kind: 'refused', ...base };
  if (status === 400 && ((reason ?? '').startsWith('API_KEY') || word === 'PERMISSION_DENIED')) {
    return { kind: 'refused', ...base };
  }
  if (missingMeansNotFound && status === 404) return { kind: 'not_found', ...base };
  return { kind: 'failed', ...base };
}

/**
 * Geocoding API status words (https://developers.google.com/maps/documentation/geocoding/requests-geocoding):
 * OVER_DAILY_LIMIT covers a missing or invalid key, billing not enabled, a
 * self-imposed cap and an expired payment method; REQUEST_DENIED came back on
 * 2026-10-18 with billing off; OVER_QUERY_LIMIT is a quota. All three are a
 * refusal. ZERO_RESULTS means no address at that pin.
 */
const GEOCODING_REFUSED = new Set(['REQUEST_DENIED', 'OVER_DAILY_LIMIT', 'OVER_QUERY_LIMIT']);

function logGoogleFailure(operation: AddressSearchOperation, outcome: { kind: string; word: string; httpStatus?: number; reason?: string }): void {
  // The status word only: never the key, the URL, what the customer typed,
  // their coordinates or Google's message.
  logger.warn('Address search: Google call did not succeed', {
    operation,
    outcome: outcome.kind,
    googleStatus: outcome.word,
    ...(outcome.reason ? { googleReason: outcome.reason } : {}),
    ...(outcome.httpStatus ? { httpStatus: outcome.httpStatus } : {}),
  });
}

// ── Redis state ──

/**
 * INCR and EXPIRE go in one MULTI/EXEC, so Redis runs both or neither and a
 * day counter is never left without its expiry (2026-10-18 review: two
 * separate commands could count a call and then lose the EXPIRE to a time
 * limit). The expiry is renewed on every call; the key is named by the
 * Manila date, so it still goes away two days after its last use.
 */
async function incrementWithTtl(key: string): Promise<number> {
  const results = await withRedisTimeout(
    redis.multi().incr(key).expire(key, ADDRESS_SEARCH_COUNTER_TTL_SECONDS).exec(),
  );
  const incr = results?.[0];
  const expire = results?.[1];
  const count = Number(incr?.[1]);
  if (!incr || !expire || incr[0] || expire[0] || !Number.isSafeInteger(count)) {
    throw new Error('address_search_counter_failed');
  }
  return count;
}

async function decrementQuietly(key: string): Promise<void> {
  try {
    await withRedisTimeout(redis.decr(key));
  } catch {
    // A refused call stays counted; the cap errs on the safe side.
  }
}

/**
 * Count one Google call against the caller's cap and the platform cap before
 * it is made. Over a cap: 429, and the counters are put back so they keep
 * counting calls actually sent. Without Redis the caps cannot be counted, so
 * the call is refused (Ken's bill guard fails closed).
 *
 * A cap an admin set to 0 means "switched off", not "used up": 503
 * "unavailable" without counting, so nobody is told they reached a limit
 * they never used.
 */
async function reserveGoogleCall(userId: string, operation: AddressSearchOperation, policy: AddressSearchPolicy): Promise<void> {
  const day = manilaDay();
  const bucket = userBucketFor(operation);
  const userLimit = bucket === 'autocomplete' ? policy.userDailyAutocompleteLimit : policy.userDailyLookupLimit;
  if (userLimit === 0 || policy.platformDailyLimit === 0) throw unavailable();
  const userKey = addressSearchKeys.user(day, userId, bucket);
  const totalKey = addressSearchKeys.platformTotal(day);
  try {
    const userCount = await incrementWithTtl(userKey);
    if (userCount > userLimit) {
      await decrementQuietly(userKey);
      throw addressSearchError(ADDRESS_SEARCH_USER_LIMIT_MESSAGE, 429, 'address_search_user_limit');
    }
    const total = await incrementWithTtl(totalKey);
    if (total > policy.platformDailyLimit) {
      await decrementQuietly(totalKey);
      await decrementQuietly(userKey);
      throw addressSearchError(ADDRESS_SEARCH_DAILY_LIMIT_MESSAGE, 429, 'address_search_daily_limit');
    }
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.warn('Address search: usage counters unavailable; call refused', { operation });
    throw unavailable();
  }
  try {
    await incrementWithTtl(addressSearchKeys.platformOperation(day, operation));
  } catch {
    // Status-card breakdown only; the caps above were counted.
  }
}

async function startCooldown(policy: AddressSearchPolicy, word: string): Promise<void> {
  const seconds = policy.cooldownMinutes * 60;
  const until = new Date(Date.now() + seconds * 1000).toISOString();
  try {
    await withRedisTimeout(redis.set(ADDRESS_SEARCH_COOLDOWN_KEY, JSON.stringify({ until, status: word }), 'EX', seconds));
  } catch {
    logger.warn('Address search: cool-down could not be saved');
  }
}

async function recordLastStatus(operation: AddressSearchOperation, word: string): Promise<void> {
  try {
    await withRedisTimeout(redis.set(
      ADDRESS_SEARCH_LAST_STATUS_KEY,
      JSON.stringify({ status: word, operation, at: new Date().toISOString() }),
      'EX',
      ADDRESS_SEARCH_LAST_STATUS_TTL_SECONDS,
    ));
  } catch {
    // Status card only.
  }
}

/**
 * Settings are read through getSetting(), which asks Redis first with no
 * time limit of its own (the shared client queues commands while it
 * reconnects). Bounded here so a Redis outage refuses address search quickly
 * instead of holding the request. It fails closed (503), not to the defaults:
 * the default switch is "on", and an admin who switched search off must
 * never see it come back during an outage.
 */
export const ADDRESS_SEARCH_POLICY_TIMEOUT_MS = 2_000;

async function readPolicyOrRefuse(operation: AddressSearchOperation): Promise<AddressSearchPolicy> {
  try {
    return await withRedisTimeout(getAddressSearchPolicy(), ADDRESS_SEARCH_POLICY_TIMEOUT_MS);
  } catch {
    logger.warn('Address search: settings unavailable; call refused', { operation });
    throw unavailable();
  }
}

/**
 * The gate every Google call passes, in this order: key set, admin switch on,
 * no cool-down, caps counted. Then the call; a refusal, a timeout or a
 * network failure starts the cool-down. Returns the call's outcome for the
 * caller to map (ok or not_found); every other outcome becomes a 503.
 *
 * The cool-down starts when the first refusal comes back. Calls already on
 * their way to Google at that moment still reach it; the daily caps bound
 * such a burst.
 */
async function guardedGoogleCall<T>(
  userId: string,
  operation: AddressSearchOperation,
  call: (key: string, timeoutMs: number) => Promise<GoogleOutcome<T>>,
): Promise<{ kind: 'ok'; value: T } | { kind: 'not_found' }> {
  const key = getGoogleMapsServerKey();
  if (!key) throw unavailable();
  const policy = await readPolicyOrRefuse(operation);
  if (!policy.enabled) throw unavailable();
  let cooldown;
  try {
    cooldown = await readAddressSearchCooldown();
  } catch {
    logger.warn('Address search: cool-down state unavailable; call refused', { operation });
    throw unavailable();
  }
  if (cooldown) throw unavailable();

  await reserveGoogleCall(userId, operation, policy);
  const outcome = await call(key, policy.timeoutMs);
  await recordLastStatus(operation, outcome.word);

  if (outcome.kind === 'ok') return { kind: 'ok', value: outcome.value };
  if (outcome.kind === 'not_found') return { kind: 'not_found' };
  logGoogleFailure(operation, outcome);
  if (outcome.kind === 'refused' || outcome.kind === 'timeout' || outcome.kind === 'network') {
    await startCooldown(policy, outcome.word);
  }
  throw unavailable();
}

function rawToOutcome<T>(
  raw: RawResponse,
  onOk: (json: unknown) => GoogleOutcome<T>,
  onError: (status: number, json: unknown) => GoogleOutcome<T>,
): GoogleOutcome<T> {
  if (raw.kind === 'timeout') return { kind: 'timeout', word: 'TIMEOUT' };
  if (raw.kind === 'network') return { kind: 'network', word: 'NETWORK_ERROR' };
  return raw.ok ? onOk(raw.json) : onError(raw.status, raw.json);
}

// ── Location bias and coverage ──

interface CircleBias { circle: { center: { latitude: number; longitude: number }; radius: number } }

/**
 * Bias (not restrict) suggestions toward where the customer is: a circle
 * around their pin when the app sends one (radius: the platform's default
 * service-area radius, 25 km), otherwise the default active service area
 * (or the first active one) with its own radius. Google allows a radius of
 * 0 to 50,000 metres. Region code "ph" still limits results to the
 * Philippines when no bias is known.
 */
async function locationBiasFor(lat: number | undefined, lng: number | undefined): Promise<CircleBias | undefined> {
  const circle = (latitude: number, longitude: number, radiusMetres: number): CircleBias => ({
    circle: { center: { latitude, longitude }, radius: Math.min(50_000, Math.max(1_000, Math.round(radiusMetres))) },
  });
  if (lat !== undefined && lng !== undefined) {
    return circle(lat, lng, platformConfig.defaultServiceAreaRadius * 1000);
  }
  try {
    const areas = await serviceAreaService.getActiveServiceAreas();
    const area = areas.find((candidate) => candidate.is_default) ?? areas[0];
    if (!area) return undefined;
    const latitude = Number(area.center_lat);
    const longitude = Number(area.center_lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
    return circle(latitude, longitude, Number(area.radius_km) * 1000);
  } catch {
    logger.warn('Address search: service areas unavailable for the suggestion bias');
    return undefined;
  }
}

export interface AddressCoverage {
  covered: boolean;
  serviceAreaId: string | null;
  serviceAreaName: string | null;
  nearestServiceAreaName: string | null;
  distanceKm: number | null;
}

/**
 * Whether a resolved location is inside an active service area, using the
 * same resolver as booking creation (service-area.service checkCoverage).
 * Null when it cannot be checked; the app then keeps its own check.
 */
async function coverageFor(latitude: number, longitude: number): Promise<AddressCoverage | null> {
  try {
    const result = await serviceAreaService.checkCoverage(latitude, longitude);
    return {
      covered: result.covered,
      serviceAreaId: result.area?.id ?? null,
      serviceAreaName: result.area?.name ?? null,
      nearestServiceAreaName: result.nearestArea?.name ?? null,
      distanceKm: result.distanceKm,
    };
  } catch {
    logger.warn('Address search: coverage check failed');
    return null;
  }
}

function insidePhilippines(latitude: number, longitude: number): boolean {
  return phLatitude.safeParse(latitude).success && phLongitude.safeParse(longitude).success;
}

// ── Public operations ──

export interface AddressSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

const autocompleteResponseSchema = z.object({
  suggestions: z.array(z.object({
    placePrediction: z.object({
      placeId: z.string().optional(),
      text: z.object({ text: z.string().optional() }).optional(),
      structuredFormat: z.object({
        mainText: z.object({ text: z.string().optional() }).optional(),
        secondaryText: z.object({ text: z.string().optional() }).optional(),
      }).optional(),
    }).optional(),
  })).optional(),
});

export async function autocomplete(input: {
  userId: string;
  query: string;
  sessionToken: string;
  latitude?: number;
  longitude?: number;
}): Promise<{ suggestions: AddressSuggestion[] }> {
  const result = await guardedGoogleCall<AddressSuggestion[]>(input.userId, 'autocomplete', async (key, timeoutMs) => {
    const locationBias = await locationBiasFor(input.latitude, input.longitude);
    const raw = await callGoogle(PLACES_AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify({
        input: input.query,
        sessionToken: input.sessionToken,
        includedRegionCodes: ['ph'],
        languageCode: 'en',
        ...(locationBias ? { locationBias } : {}),
      }),
    }, timeoutMs);
    return rawToOutcome<AddressSuggestion[]>(raw, (json) => {
      const parsed = autocompleteResponseSchema.safeParse(json ?? {});
      if (!parsed.success) return { kind: 'failed', word: 'BAD_RESPONSE' };
      const suggestions: AddressSuggestion[] = [];
      for (const suggestion of parsed.data.suggestions ?? []) {
        const prediction = suggestion.placePrediction;
        const placeId = prediction?.placeId;
        const mainText = clip(prediction?.structuredFormat?.mainText?.text ?? prediction?.text?.text, 200);
        if (!placeId || !PLACE_ID.test(placeId) || !mainText) continue;
        suggestions.push({
          placeId,
          mainText,
          secondaryText: clip(prediction?.structuredFormat?.secondaryText?.text, 300) ?? '',
        });
        if (suggestions.length === MAX_SUGGESTIONS) break;
      }
      return { kind: 'ok', value: suggestions, word: 'OK' };
    }, (status, json) => classifyPlacesFailure(status, json, false));
  });
  return { suggestions: result.kind === 'ok' ? result.value : [] };
}

export interface ResolvedAddress {
  found: true;
  placeId: string | null;
  address: MappedAddress;
  formattedAddress: string | null;
  location: { latitude: number; longitude: number };
  coverage: AddressCoverage | null;
}

export interface UnresolvedPin {
  found: false;
  placeId: null;
  address: null;
  formattedAddress: null;
  location: { latitude: number; longitude: number };
  coverage: AddressCoverage | null;
}

function ourAddress(mapped: MappedAddressWithCountry): MappedAddress {
  return {
    fullAddress: mapped.fullAddress,
    barangay: mapped.barangay,
    city: mapped.city,
    province: mapped.province,
    region: mapped.region,
    zipCode: mapped.zipCode,
  };
}

const placeDetailsSchema = z.object({
  id: z.string().optional(),
  formattedAddress: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  addressComponents: z.array(placesComponentSchema).optional(),
});

interface DetailsValue {
  placeId: string;
  mapped: MappedAddressWithCountry;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
}

export async function placeAddress(input: {
  userId: string;
  placeId: string;
  sessionToken: string;
}): Promise<ResolvedAddress> {
  const result = await guardedGoogleCall<DetailsValue>(input.userId, 'details', async (key, timeoutMs) => {
    // sessionToken ends Google's autocomplete billing session (session-pricing page above).
    const url = `${PLACES_DETAILS_URL_PREFIX}${encodeURIComponent(input.placeId)}`
      + `?sessionToken=${encodeURIComponent(input.sessionToken)}&languageCode=en&regionCode=ph`;
    const raw = await callGoogle(url, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK },
    }, timeoutMs);
    return rawToOutcome<DetailsValue>(raw, (json) => {
      const parsed = placeDetailsSchema.safeParse(json ?? {});
      if (!parsed.success) return { kind: 'failed', word: 'BAD_RESPONSE' };
      const location = parsed.data.location;
      const mapped = mapAddressComponents(normalizePlacesComponents(parsed.data.addressComponents));
      // A place with no location, or outside the Philippines, cannot be a
      // service address: treat it as not found.
      if (!location || !insidePhilippines(location.latitude, location.longitude)
          || (mapped.countryCode !== null && mapped.countryCode !== 'PH')) {
        return { kind: 'not_found', word: 'OK_NOT_USABLE' };
      }
      return {
        kind: 'ok',
        word: 'OK',
        value: {
          placeId: parsed.data.id && PLACE_ID.test(parsed.data.id) ? parsed.data.id : input.placeId,
          mapped,
          formattedAddress: clip(parsed.data.formattedAddress, 500),
          latitude: location.latitude,
          longitude: location.longitude,
        },
      };
    }, (status, json) => classifyPlacesFailure(status, json, true));
  });

  if (result.kind === 'not_found') {
    throw addressSearchError(ADDRESS_NOT_FOUND_MESSAGE, 404, 'address_not_found');
  }
  const value = result.value;
  return {
    found: true,
    placeId: value.placeId,
    address: ourAddress(value.mapped),
    formattedAddress: value.formattedAddress,
    location: { latitude: value.latitude, longitude: value.longitude },
    coverage: await coverageFor(value.latitude, value.longitude),
  };
}

export async function reverseLookup(input: {
  userId: string;
  latitude: number;
  longitude: number;
}): Promise<ResolvedAddress | UnresolvedPin> {
  const result = await guardedGoogleCall<ReverseChoice>(input.userId, 'reverse', async (key, timeoutMs) => {
    // Geocoding takes the key only as a URL parameter. This URL is never
    // logged, and server.ts strips key= and latlng= from anything sent to
    // Sentry (utils/address-search-redaction.ts).
    const latlng = `${input.latitude.toFixed(7)},${input.longitude.toFixed(7)}`;
    const url = `${GEOCODING_URL}?latlng=${encodeURIComponent(latlng)}&language=en&key=${encodeURIComponent(key)}`;
    const raw = await callGoogle(url, { method: 'GET' }, timeoutMs);
    return rawToOutcome<ReverseChoice>(raw, (json) => {
      const parsed = geocodingResponseSchema.safeParse(json ?? {});
      if (!parsed.success) return { kind: 'failed', word: 'BAD_RESPONSE' };
      const word = STATUS_WORD.test(parsed.data.status) ? parsed.data.status : 'BAD_RESPONSE';
      if (word === 'OK') {
        const choice = chooseReverseResult(parsed.data.results ?? []);
        if (!choice || (choice.address.countryCode !== null && choice.address.countryCode !== 'PH')) {
          return { kind: 'not_found', word: 'OK_NOT_USABLE' };
        }
        return { kind: 'ok', word, value: choice };
      }
      if (word === 'ZERO_RESULTS') return { kind: 'not_found', word };
      if (GEOCODING_REFUSED.has(word)) return { kind: 'refused', word };
      return { kind: 'failed', word };
    }, (status, json) => {
      const parsed = geocodingResponseSchema.safeParse(json ?? {});
      const word = parsed.success && STATUS_WORD.test(parsed.data.status) ? parsed.data.status : `HTTP_${status}`;
      if (status === 401 || status === 403 || status === 429 || GEOCODING_REFUSED.has(word)) {
        return { kind: 'refused', word, httpStatus: status };
      }
      return { kind: 'failed', word, httpStatus: status };
    });
  });

  // The customer's own pin stays the location; Google only names it.
  const location = { latitude: input.latitude, longitude: input.longitude };
  const coverage = await coverageFor(input.latitude, input.longitude);
  if (result.kind === 'not_found') {
    return { found: false, placeId: null, address: null, formattedAddress: null, location, coverage };
  }
  return {
    found: true,
    placeId: result.value.placeId,
    address: ourAddress(result.value.address),
    formattedAddress: result.value.formattedAddress,
    location,
    coverage,
  };
}

// ── Admin status card ──

export interface AddressSearchStatus {
  /** Yes/no only; the key itself is never returned. */
  keyConfigured: boolean;
  enabled: boolean;
  /** What GET /api/v1/config tells the apps right now. */
  available: boolean;
  cooldownUntil: string | null;
  cooldownStatus: string | null;
  /** False when Redis could not be read: counts and cool-down are then unknown. */
  stateReadable: boolean;
  today: {
    date: string;
    autocomplete: number | null;
    details: number | null;
    reverse: number | null;
    total: number | null;
  };
  limits: {
    userDailyAutocomplete: number;
    userDailyLookups: number;
    platformDaily: number;
    timeoutMs: number;
    cooldownMinutes: number;
  };
  lastStatus: { status: string; operation: string; at: string } | null;
}

function parseCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function parseLastStatus(raw: unknown): AddressSearchStatus['lastStatus'] {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { status?: unknown; operation?: unknown; at?: unknown };
    if (typeof parsed.status === 'string' && STATUS_WORD.test(parsed.status)
        && typeof parsed.operation === 'string' && ['autocomplete', 'details', 'reverse'].includes(parsed.operation)
        && typeof parsed.at === 'string' && Number.isFinite(Date.parse(parsed.at))) {
      return { status: parsed.status, operation: parsed.operation, at: parsed.at };
    }
  } catch {
    // Unreadable: show nothing.
  }
  return null;
}

export async function getAddressSearchStatus(now: Date = new Date()): Promise<AddressSearchStatus> {
  const policy = await getAddressSearchPolicy();
  const keyConfigured = isGoogleMapsServerKeyConfigured();
  const day = manilaDay(now);
  let stateReadable = true;
  let cooldown: { until: string; status: string } | null = null;
  let counts: [number, number, number, number] | null = null;
  let lastStatus: AddressSearchStatus['lastStatus'] = null;
  try {
    cooldown = await readAddressSearchCooldown();
    const [autocompleteCount, detailsCount, reverseCount, totalCount, last] = await withRedisTimeout(Promise.all([
      redis.get(addressSearchKeys.platformOperation(day, 'autocomplete')),
      redis.get(addressSearchKeys.platformOperation(day, 'details')),
      redis.get(addressSearchKeys.platformOperation(day, 'reverse')),
      redis.get(addressSearchKeys.platformTotal(day)),
      redis.get(ADDRESS_SEARCH_LAST_STATUS_KEY),
    ]));
    counts = [parseCount(autocompleteCount), parseCount(detailsCount), parseCount(reverseCount), parseCount(totalCount)];
    lastStatus = parseLastStatus(last);
  } catch {
    stateReadable = false;
  }
  return {
    keyConfigured,
    enabled: policy.enabled,
    // Same rule as GET /api/v1/config (settings.service getClientConfig).
    available: keyConfigured && policy.enabled && stateReadable && cooldown === null
      && counts !== null && addressSearchCapsAllowCalls(policy, counts[3]),
    cooldownUntil: cooldown?.until ?? null,
    cooldownStatus: cooldown?.status ?? null,
    stateReadable,
    today: {
      date: day,
      autocomplete: counts ? counts[0] : null,
      details: counts ? counts[1] : null,
      reverse: counts ? counts[2] : null,
      total: counts ? counts[3] : null,
    },
    limits: {
      userDailyAutocomplete: policy.userDailyAutocompleteLimit,
      userDailyLookups: policy.userDailyLookupLimit,
      platformDaily: policy.platformDailyLimit,
      timeoutMs: policy.timeoutMs,
      cooldownMinutes: policy.cooldownMinutes,
    },
    lastStatus,
  };
}
