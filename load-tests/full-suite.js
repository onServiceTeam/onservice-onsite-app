/**
 * Full Load Test Suite — Runs all critical API scenarios.
 *
 * Usage:
 *   k6 run load-tests/full-suite.js
 *   k6 run load-tests/full-suite.js -e BASE_URL=https://staging-api.onservice.ph
 *   k6 run load-tests/full-suite.js -e PROFILE=stress
 *
 * Profiles: smoke | load | stress | soak
 *
 * NFR Alignment:
 *   NFR-001: p50 < 200ms, p95 < 500ms, p99 < 1000ms
 *   NFR-002: Supports up to 1,000 concurrent users (Stage 1)
 *   NFR-004: Rate limit at 100 req/min per user
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { apiUrl, jsonHeaders, authHeaders, PROFILES, NFR_THRESHOLDS } from './config.js';

const PROFILE = __ENV.PROFILE || 'load';

const healthCheckDuration = new Trend('health_check_duration');
const authDuration = new Trend('auth_flow_duration');
const bookingListDuration = new Trend('booking_list_duration');
const catalogDuration = new Trend('catalog_duration');
const sukiDuration = new Trend('suki_tiers_duration');
const notificationsDuration = new Trend('notifications_duration');
const overallFailRate = new Rate('overall_fail_rate');
const totalRequests = new Counter('total_api_requests');

export const options = {
  ...PROFILES[PROFILE],
  thresholds: {
    ...NFR_THRESHOLDS,
    health_check_duration: ['p(95)<100'],
    auth_flow_duration: ['p(95)<400'],
    booking_list_duration: ['p(95)<300'],
    catalog_duration: ['p(95)<300'],
    suki_tiers_duration: ['p(95)<100'],
    overall_fail_rate: ['rate<0.02'],
  },
};

function authenticate() {
  const phone = `+6391700${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;

  const loginRes = http.post(apiUrl('/auth/login'), JSON.stringify({ phone }), jsonHeaders());
  totalRequests.add(1);

  const otpRes = http.post(
    apiUrl('/auth/verify-otp'),
    JSON.stringify({ phone, otp: '123456' }),
    jsonHeaders(),
  );
  totalRequests.add(1);
  authDuration.add(loginRes.timings.duration + otpRes.timings.duration);

  try {
    return JSON.parse(otpRes.body).data?.accessToken ?? null;
  } catch {
    return null;
  }
}

export function setup() {
  const healthRes = http.get(`${__ENV.BASE_URL || 'http://localhost:7381'}/health`);
  const healthy = check(healthRes, {
    'API health check passes': (r) => r.status === 200,
  });
  if (!healthy) {
    throw new Error('API server is not healthy — aborting load test');
  }

  const token = authenticate();
  if (!token) {
    throw new Error('Failed to authenticate test user — aborting load test');
  }
  return { token };
}

export default function (data) {
  const token = data.token;
  const headers = authHeaders(token);

  group('Health Check', () => {
    const res = http.get(`${__ENV.BASE_URL || 'http://localhost:7381'}/health`);
    totalRequests.add(1);
    const ok = check(res, { 'health 200': (r) => r.status === 200 });
    healthCheckDuration.add(res.timings.duration);
    overallFailRate.add(!ok);
  });

  sleep(0.2);

  group('Catalog: Categories', () => {
    const res = http.get(apiUrl('/catalog/categories'), headers);
    totalRequests.add(1);
    const ok = check(res, { 'categories 200': (r) => r.status === 200 });
    catalogDuration.add(res.timings.duration);
    overallFailRate.add(!ok);
  });

  sleep(0.2);

  group('Bookings: List', () => {
    const res = http.get(apiUrl('/bookings?page=1&pageSize=10'), headers);
    totalRequests.add(1);
    const ok = check(res, { 'bookings list 200': (r) => r.status === 200 });
    bookingListDuration.add(res.timings.duration);
    overallFailRate.add(!ok);
  });

  sleep(0.2);

  group('Notifications: List', () => {
    const res = http.get(apiUrl('/notifications?page=1&pageSize=10'), headers);
    totalRequests.add(1);
    const ok = check(res, { 'notifications 200': (r) => r.status === 200 });
    notificationsDuration.add(res.timings.duration);
    overallFailRate.add(!ok);
  });

  sleep(0.2);

  group('Suki Tiers (cached)', () => {
    const res = http.get(apiUrl('/suki/tiers'), headers);
    totalRequests.add(1);
    const ok = check(res, { 'suki tiers 200': (r) => r.status === 200 });
    sukiDuration.add(res.timings.duration);
    overallFailRate.add(!ok);
  });

  sleep(0.2);

  group('Wallet: Balance', () => {
    const res = http.get(apiUrl('/wallet'), headers);
    totalRequests.add(1);
    check(res, { 'wallet 200': (r) => r.status === 200 });
  });

  sleep(0.5);

  group('Referral: Get code', () => {
    const res = http.get(apiUrl('/referrals/my-code'), headers);
    totalRequests.add(1);
    check(res, { 'referral code 200': (r) => r.status === 200 });
  });

  sleep(0.5);
}

export function handleSummary(data) {
  const p50 = data.metrics.http_req_duration?.values?.['p(50)'] || 0;
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] || 0;
  const p99 = data.metrics.http_req_duration?.values?.['p(99)'] || 0;
  const failRate = data.metrics.http_req_failed?.values?.rate || 0;
  const reqRate = data.metrics.http_reqs?.values?.rate || 0;

  const nfrPass = p50 < 200 && p95 < 500 && p99 < 1000 && failRate < 0.01;

  const summary = {
    timestamp: new Date().toISOString(),
    profile: PROFILE,
    nfr001_pass: nfrPass,
    metrics: {
      'p50_ms': Math.round(p50),
      'p95_ms': Math.round(p95),
      'p99_ms': Math.round(p99),
      'fail_rate': (failRate * 100).toFixed(2) + '%',
      'req_per_sec': Math.round(reqRate),
    },
    thresholds: {
      'NFR-001 p50<200ms': p50 < 200 ? 'PASS' : 'FAIL',
      'NFR-001 p95<500ms': p95 < 500 ? 'PASS' : 'FAIL',
      'NFR-001 p99<1000ms': p99 < 1000 ? 'PASS' : 'FAIL',
      'NFR-002 fail_rate<1%': failRate < 0.01 ? 'PASS' : 'FAIL',
    },
  };

  return {
    'load-tests/results/summary.json': JSON.stringify(summary, null, 2),
    stdout: `\n========== NFR COMPLIANCE REPORT ==========\n` +
      `Profile: ${PROFILE}\n` +
      `NFR-001 Overall: ${nfrPass ? 'PASS' : 'FAIL'}\n` +
      `  p50: ${Math.round(p50)}ms (limit: 200ms) ${p50 < 200 ? '✓' : '✗'}\n` +
      `  p95: ${Math.round(p95)}ms (limit: 500ms) ${p95 < 500 ? '✓' : '✗'}\n` +
      `  p99: ${Math.round(p99)}ms (limit: 1000ms) ${p99 < 1000 ? '✓' : '✗'}\n` +
      `  Fail rate: ${(failRate * 100).toFixed(2)}% (limit: 1%) ${failRate < 0.01 ? '✓' : '✗'}\n` +
      `  Throughput: ${Math.round(reqRate)} req/s\n` +
      `===========================================\n`,
  };
}
