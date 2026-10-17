// D24 Option A (Google address search) test helpers: a fake server key,
// signed test sessions, a database stand-in that answers the sign-in lookup
// and platform_settings reads, Google answers built as real fetch Responses,
// and realistic Philippine fixtures. No test calls Google: every test file
// replaces globalThis.fetch with a jest mock.
//
// The calling test file must jest.mock '../src/models/db' (routing
// db.query to the function given to installDbMock), '../src/config/redis.config'
// (a FakeRedis) and '../src/services/service-area.service' itself, because
// jest.mock is hoisted per file.
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

/**
 * Obviously fake and only ever used in tests. URL-safe and long enough for
 * the config's key check, but it deliberately does NOT start with "AIza":
 * leak scanners flag "AIza" plus 35 characters as a real Google API key, and
 * this repo is public.
 */
export const FAKE_GOOGLE_KEY = 'TESTONLY_fake_google_maps_server_key_0000';
export const JWT_TEST_SECRET = 'cr-address-search-synthetic-jwt-secret-only';

export const CUSTOMER_A = 'c2000000-0000-4000-8000-000000000001';
export const CUSTOMER_B = 'c2000000-0000-4000-8000-000000000002';
export const ADMIN_ID = 'c2000000-0000-4000-8000-000000000003';
export const SESSION_TOKEN = '6f1c2a4e-8b3d-4c5e-9f70-112233445566';

export type TestRole = 'customer' | 'provider' | 'admin' | 'super_admin';

const ROLES: Record<string, TestRole> = {
  [CUSTOMER_A]: 'customer',
  [CUSTOMER_B]: 'customer',
  [ADMIN_ID]: 'admin',
};

export function bearer(userId: string): string {
  const role = ROLES[userId] ?? 'customer';
  return `Bearer ${jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, JWT_TEST_SECRET, { expiresIn: '5m' })}`;
}

/**
 * Route db.query: the sign-in lookup (users) and platform_settings reads.
 * `settings` overrides individual setting values; any other setting is
 * missing, so the service falls back to SETTING_DEFAULTS.
 */
export function installDbMock(
  queryMock: jest.Mock,
  settings: Record<string, string> = {},
): void {
  queryMock.mockImplementation(async (text: string, params?: unknown[]) => {
    if (/FROM users/i.test(text)) {
      const role = ROLES[String(params?.[0])];
      return role
        ? { rows: [{ role, is_active: true, session_version: 1, must_rotate_password: false }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (/FROM platform_settings WHERE key = \$1/i.test(text)) {
      const key = String(params?.[0]);
      return key in settings ? { rows: [{ value: settings[key] }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/FROM platform_settings/i.test(text) && Array.isArray(params?.[0])) {
      const rows = (params![0] as string[]).filter((key) => key in settings).map((key) => ({ key, value: settings[key] }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM platform_settings/i.test(text)) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected query in address search test: ${text.slice(0, 60)}`);
  });
}

// ── Route test helpers (POST /api/v1/geo/*, details in a JSON body) ──

export const TYPED = '123 Gorordo Avenue Lahug';
export const PIN = { lat: 10.3333333, lng: 123.9333333 };
export const DETAILS_PLACE_ID = 'ChIJcebuCityGorordo0001';

export const searchBody = (q: string = TYPED): Record<string, unknown> => ({ q, sessionToken: SESSION_TOKEN });
export const placeBody = (placeId: string = DETAILS_PLACE_ID): Record<string, unknown> => ({ placeId, sessionToken: SESSION_TOKEN });
export const pinBody = (lat: unknown = PIN.lat, lng: unknown = PIN.lng): Record<string, unknown> => ({ lat, lng });

/**
 * A test app with the real geo router (passed in by the test file, after its
 * jest.mock calls) and, by default, the shared errorMiddleware after it, as
 * server.ts mounts them.
 */
export function buildGeoApp(router: express.Router, errorHandler?: express.ErrorRequestHandler): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/geo', router);
  if (errorHandler) app.use(errorHandler);
  return app;
}

/** POST a JSON body, signed in as `userId` (null: not signed in). */
export function postGeo(app: express.Express, path: string, body: unknown, userId: string | null = CUSTOMER_A): request.Test {
  const call = request(app).post(path).send(body as object);
  return userId ? call.set('Authorization', bearer(userId)) : call;
}

/** Everything every mocked logger method was called with, as one string. */
export function allLogText(logger: { info: unknown; warn: unknown; error: unknown; debug: unknown }): string {
  const calls = (fn: unknown): unknown => (fn as jest.Mock).mock.calls;
  return JSON.stringify([calls(logger.info), calls(logger.warn), calls(logger.error), calls(logger.debug)]);
}

export function googleJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A fetch mock that waits until its request is aborted (a Google call that never answers). */
export function hangingFetch(): jest.Mock {
  return jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
  }));
}

// ── Realistic Philippine fixtures (UNVERIFIED against live Google answers) ──

type PlacesPart = { longText: string; shortText?: string; types: string[] };
const p = (longText: string, types: string[], shortText = longText): PlacesPart => ({ longText, shortText, types });

/** Cebu City street address; barangay as sublocality_level_1 (Places API (New) shape). */
export const CEBU_CITY_DETAILS = {
  id: 'ChIJcebuCityGorordo0001',
  formattedAddress: '123 Gorordo Ave, Cebu City, 6000 Cebu, Philippines',
  location: { latitude: 10.3312, longitude: 123.9046 },
  addressComponents: [
    p('123', ['street_number']),
    p('Gorordo Avenue', ['route'], 'Gorordo Ave'),
    p('Lahug', ['sublocality_level_1', 'sublocality', 'political']),
    p('Cebu City', ['locality', 'political']),
    p('Cebu', ['administrative_area_level_2', 'political']),
    p('Central Visayas', ['administrative_area_level_1', 'political']),
    p('Philippines', ['country', 'political'], 'PH'),
    p('6000', ['postal_code']),
  ],
  // Extra Google fields that must never be passed through.
  googleMapsUri: 'https://maps.google.com/?cid=1',
};

/** Ayala Center Cebu: a point of interest, with a neighborhood as well as the barangay. */
export const CEBU_POI_DETAILS = {
  id: 'ChIJcebuAyalaCenter0002',
  formattedAddress: 'Ayala Center Cebu, Archbishop Reyes Ave, Cebu City, 6000 Cebu, Philippines',
  location: { latitude: 10.3181, longitude: 123.9050 },
  addressComponents: [
    p('Ayala Center Cebu', ['point_of_interest', 'establishment']),
    p('Archbishop Reyes Avenue', ['route'], 'Archbishop Reyes Ave'),
    p('Cebu Business Park', ['neighborhood', 'political']),
    p('Luz', ['sublocality_level_1', 'sublocality', 'political']),
    p('Cebu City', ['locality', 'political']),
    p('Cebu', ['administrative_area_level_2', 'political']),
    p('Central Visayas', ['administrative_area_level_1', 'political']),
    p('Philippines', ['country', 'political'], 'PH'),
    p('6000', ['postal_code']),
  ],
};

type GeoPart = { long_name: string; short_name: string; types: string[] };
const g = (long_name: string, types: string[], short_name = long_name): GeoPart => ({ long_name, short_name, types });

/** Mandaue City street address; barangay as neighborhood (Geocoding API shape). */
export const MANDAUE_GEOCODE_PARTS: GeoPart[] = [
  g('45', ['street_number']),
  g('A. C. Cortes Avenue', ['route'], 'A.C. Cortes Ave'),
  g('Ibabao-Estancia', ['neighborhood', 'political']),
  g('Mandaue City', ['locality', 'political']),
  g('Cebu', ['administrative_area_level_2', 'political']),
  g('Central Visayas', ['administrative_area_level_1', 'political']),
  g('Philippines', ['country', 'political'], 'PH'),
  g('6014', ['postal_code']),
];

/** Consolacion, Cebu: a municipality with no locality part; barangay as administrative_area_level_5. */
export const CONSOLACION_GEOCODE_PARTS: GeoPart[] = [
  g('Cebu North Road', ['route']),
  g('Tayud', ['administrative_area_level_5', 'political']),
  g('Consolacion', ['administrative_area_level_3', 'political']),
  g('Cebu', ['administrative_area_level_2', 'political']),
  g('Central Visayas', ['administrative_area_level_1', 'political']),
  g('Philippines', ['country', 'political'], 'PH'),
  g('6001', ['postal_code']),
];

/** A Geocoding reverse answer for a pin in Mandaue: plus code first, street address second, barangay only in a broader result. */
export function mandaueReverseAnswer(): Record<string, unknown> {
  return {
    status: 'OK',
    plus_code: { global_code: '7Q639WJ3+XX' },
    results: [
      {
        types: ['plus_code'],
        formatted_address: '9WJ3+XX Mandaue City, Cebu, Philippines',
        address_components: [g('9WJ3+XX', ['plus_code']), g('Mandaue City', ['locality', 'political'])],
        place_id: 'GhIJplusCodeMandaue0003',
      },
      {
        types: ['street_address'],
        formatted_address: '45 A.C. Cortes Ave, Mandaue City, 6014 Cebu, Philippines',
        address_components: MANDAUE_GEOCODE_PARTS.filter((part) => !part.types.includes('neighborhood')),
        geometry: { location: { lat: 10.3333, lng: 123.9333 }, location_type: 'ROOFTOP' },
        place_id: 'ChIJmandaueCortes0004',
      },
      {
        types: ['neighborhood', 'political'],
        formatted_address: 'Ibabao-Estancia, Mandaue City, Cebu, Philippines',
        address_components: MANDAUE_GEOCODE_PARTS.filter((part) => !['street_number', 'route'].some((t) => part.types.includes(t))),
        place_id: 'ChIJmandaueIbabao0005',
      },
    ],
  };
}

/**
 * A Geocoding reverse answer for a home pin on Gorordo Avenue in Lahug, next
 * to a fast-food shop. Google lists the shop first; its parts place it in the
 * neighbouring barangay (Camputhaw). The street result names no barangay.
 * Only the political area results contain the pin itself.
 */
export function homeBesideShopReverseAnswer(): Record<string, unknown> {
  return {
    status: 'OK',
    results: [
      {
        types: ['establishment', 'food', 'point_of_interest', 'restaurant'],
        formatted_address: 'Jollibee Gorordo, Gorordo Ave, Cebu City, 6000 Cebu, Philippines',
        address_components: [
          g('Jollibee Gorordo', ['point_of_interest', 'establishment']),
          g('Gorordo Avenue', ['route'], 'Gorordo Ave'),
          g('Camputhaw', ['sublocality_level_1', 'sublocality', 'political']),
          g('Cebu City', ['locality', 'political']),
          g('Cebu', ['administrative_area_level_2', 'political']),
          g('Central Visayas', ['administrative_area_level_1', 'political']),
          g('Philippines', ['country', 'political'], 'PH'),
          g('6000', ['postal_code']),
        ],
        place_id: 'ChIJjollibeeGorordo0006',
      },
      {
        types: ['route'],
        formatted_address: 'Gorordo Ave, Cebu City, Cebu, Philippines',
        address_components: [
          g('Gorordo Avenue', ['route'], 'Gorordo Ave'),
          g('Cebu City', ['locality', 'political']),
          g('Cebu', ['administrative_area_level_2', 'political']),
          g('Central Visayas', ['administrative_area_level_1', 'political']),
          g('Philippines', ['country', 'political'], 'PH'),
        ],
        place_id: 'ChIJgorordoAvenueRoute0007',
      },
      {
        types: ['sublocality', 'sublocality_level_1', 'political'],
        formatted_address: 'Lahug, Cebu City, Cebu, Philippines',
        address_components: [
          g('Lahug', ['sublocality_level_1', 'sublocality', 'political']),
          g('Cebu City', ['locality', 'political']),
          g('Cebu', ['administrative_area_level_2', 'political']),
          g('Central Visayas', ['administrative_area_level_1', 'political']),
          g('Philippines', ['country', 'political'], 'PH'),
          g('6000', ['postal_code']),
        ],
        place_id: 'ChIJlahugCebuCity0008',
      },
    ],
  };
}

export const CEBU_CITY_AREA = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Cebu City',
  center_lat: '10.31570000',
  center_lng: '123.88540000',
  radius_km: 15,
  is_default: true,
};
