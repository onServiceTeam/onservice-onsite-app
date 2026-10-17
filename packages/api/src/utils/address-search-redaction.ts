/**
 * D24 Option A address search: keep searched addresses, map pins, place IDs,
 * session tokens and the Google server key out of the request log and out of
 * Sentry.
 *
 *   - Our routes are POST /api/v1/geo/autocomplete, /place and /reverse with
 *     the details in a JSON body, so normally no URL carries them. As a
 *     backstop, a URL of the old shape (/api/v1/geo/autocomplete?q=...,
 *     /api/v1/geo/reverse?lat=..&lng=.., /api/v1/geo/place/<place ID>) keeps
 *     the route and drops the rest: "/api/v1/geo/autocomplete?[redacted]",
 *     "/api/v1/geo/place/[redacted]?[redacted]". Matching ignores letter
 *     case, because Express routes ignore it too (/API/V1/GEO/Place/... still
 *     reaches the router).
 *   - Sentry error events carry the incoming request on their own fields:
 *     request.url, request.query_string and request.data (the JSON body,
 *     which holds what the customer typed or their pin). For an event about
 *     an address search request, query_string and data are replaced whole.
 *   - Google's Geocoding URL carries the server key and the pin as URL
 *     parameters (key=, latlng=), and the Place Details URL carries the place
 *     ID in its path and a sessionToken= parameter. Sentry can record outgoing
 *     request URLs in breadcrumbs and spans, so those values are replaced
 *     wherever they appear in an event, and performance samples that touch
 *     address search are dropped.
 *
 * Pure functions, no imports: server.ts loads this before Sentry.init.
 */

export const ADDRESS_SEARCH_PATH_PREFIX = '/api/v1/geo/';

const GEO_PATH_IN_TEXT = /\/api\/v1\/geo\/(autocomplete|reverse|place)(\/[^?#\s"'<>]*)?(\?[^#\s"'<>]*)?/gi;
const GOOGLE_PARAM_IN_TEXT = /([?&]|^|\b)(key|latlng|sessiontoken)=[^&#\s"'<>]+/gi;
const PLACES_DETAILS_PATH_IN_TEXT = /(places\.googleapis\.com\/v1\/places\/)[^?#\s"'<>/:]+/gi;
const GOOGLE_HOSTS = /(?:maps|places)\.googleapis\.com/i;
const REDACTED = '[redacted]';

function mentionsAddressSearch(text: string): boolean {
  return text.toLowerCase().includes(ADDRESS_SEARCH_PATH_PREFIX);
}

function redactGeoMatch(_match: string, route: string, rest: string | undefined, query: string | undefined): string {
  const name = route.toLowerCase();
  const path = name === 'place' && rest ? '/api/v1/geo/place/[redacted]' : `/api/v1/geo/${name}${rest ?? ''}`;
  return query ? `${path}?[redacted]` : path;
}

/** For the request log: the URL with any address-search detail removed. */
export function redactAddressSearchUrl(url: string | undefined | null): string {
  if (typeof url !== 'string') return '';
  return mentionsAddressSearch(url) ? url.replace(GEO_PATH_IN_TEXT, redactGeoMatch) : url;
}

/** Replace address-search detail, Google key= / latlng= / sessionToken= values and Place Details IDs in one string. */
export function redactAddressSearchText(text: string): string {
  let out = mentionsAddressSearch(text) ? text.replace(GEO_PATH_IN_TEXT, redactGeoMatch) : text;
  const lower = out.toLowerCase();
  if (lower.includes('key=') || lower.includes('latlng=') || lower.includes('sessiontoken=')) {
    out = out.replace(GOOGLE_PARAM_IN_TEXT, (_match, lead: string, name: string) => `${lead}${name}=${REDACTED}`);
  }
  if (lower.includes('places.googleapis.com/v1/places/')) {
    out = out.replace(PLACES_DETAILS_PATH_IN_TEXT, `$1${REDACTED}`);
  }
  return out;
}

/** True when a Sentry event is about one of our address search requests. */
function isAddressSearchEvent(record: Record<string, unknown>): boolean {
  const request = record.request as Record<string, unknown> | undefined;
  const url = request && typeof request.url === 'string' ? request.url : '';
  const transaction = typeof record.transaction === 'string' ? record.transaction : '';
  return mentionsAddressSearch(url) || mentionsAddressSearch(transaction);
}

/**
 * Sentry beforeSend: redact every string of a plain event object in place
 * and return the same object. For an address search request the incoming
 * query string and body are replaced whole, whatever shape they have.
 */
export function redactAddressSearchDetails<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const request = record.request;
    if (request !== null && typeof request === 'object' && isAddressSearchEvent(record)) {
      const fields = request as Record<string, unknown>;
      if ('query_string' in fields) fields.query_string = REDACTED;
      if ('data' in fields) fields.data = REDACTED;
    }
  }
  const seen = new WeakSet<object>();
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return redactAddressSearchText(node);
    if (node === null || typeof node !== 'object' || seen.has(node)) return node;
    seen.add(node);
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) node[index] = walk(node[index]);
      return node;
    }
    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = walk(record[key]);
    return node;
  };
  return walk(value) as T;
}

/**
 * Sentry beforeSendTransaction: drop a performance sample that involves
 * address search (our route or a call to Google); return any other unchanged.
 */
export function dropAddressSearchTransaction<T>(event: T): T | null {
  let text: string;
  try {
    text = JSON.stringify(event) ?? '';
  } catch {
    return null; // Cannot be checked: dropping a performance sample is harmless.
  }
  return mentionsAddressSearch(text) || GOOGLE_HOSTS.test(text) ? null : event;
}
