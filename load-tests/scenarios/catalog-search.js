import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { apiUrl, jsonHeaders, authHeaders, PROFILES, NFR_THRESHOLDS } from '../config.js';

const catalogListDuration = new Trend('catalog_list_duration');
const catalogSearchDuration = new Trend('catalog_search_duration');
const sukiTiersDuration = new Trend('suki_tiers_duration');
const catalogFailRate = new Rate('catalog_fail_rate');

const PROFILE = __ENV.PROFILE || 'load';

export const options = {
  ...PROFILES[PROFILE],
  thresholds: {
    ...NFR_THRESHOLDS,
    catalog_list_duration: ['p(95)<300'],
    catalog_search_duration: ['p(95)<1000'],
    suki_tiers_duration: ['p(95)<100'],
    catalog_fail_rate: ['rate<0.01'],
  },
  tags: { scenario: 'catalog-search' },
};

function authenticate() {
  const phone = `+6391700${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
  http.post(apiUrl('/auth/login'), JSON.stringify({ phone }), jsonHeaders());
  const otpRes = http.post(
    apiUrl('/auth/verify-otp'),
    JSON.stringify({ phone, otp: '123456' }),
    jsonHeaders(),
  );
  try {
    return JSON.parse(otpRes.body).data?.accessToken ?? null;
  } catch {
    return null;
  }
}

export function setup() {
  return { token: authenticate() };
}

export default function (data) {
  const token = data.token;
  if (!token) {
    catalogFailRate.add(true);
    return;
  }

  const headers = authHeaders(token);

  group('Catalog: List all categories', () => {
    const res = http.get(apiUrl('/catalog/categories'), headers);
    const ok = check(res, {
      'categories returns 200': (r) => r.status === 200,
      'categories returns data': (r) => {
        try { return !!JSON.parse(r.body).data; } catch { return false; }
      },
    });
    catalogListDuration.add(res.timings.duration);
    catalogFailRate.add(!ok);
  });

  sleep(0.3);

  group('Catalog: Search services', () => {
    const queries = ['cleaning', 'plumbing', 'electrical', 'aircon', 'pest control'];
    const q = queries[Math.floor(Math.random() * queries.length)];

    const res = http.get(apiUrl(`/catalog/search?q=${encodeURIComponent(q)}`), headers);
    const ok = check(res, {
      'search returns 200': (r) => r.status === 200,
    });
    catalogSearchDuration.add(res.timings.duration);
    catalogFailRate.add(!ok);
  });

  sleep(0.3);

  group('Catalog: List service areas', () => {
    const res = http.get(apiUrl('/service-areas'), headers);
    check(res, {
      'service-areas returns 200': (r) => r.status === 200,
    });
  });

  sleep(0.3);

  group('Suki: Get tiers (cached)', () => {
    const res = http.get(apiUrl('/suki/tiers'), headers);
    const ok = check(res, {
      'suki tiers returns 200': (r) => r.status === 200,
      'suki tiers has cache header': (r) => {
        return r.headers['Cache-Control'] !== undefined
          || r.headers['cache-control'] !== undefined;
      },
    });
    sukiTiersDuration.add(res.timings.duration);
    catalogFailRate.add(!ok);
  });

  sleep(0.5);
}
