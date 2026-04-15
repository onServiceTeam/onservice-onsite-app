/**
 * Shared configuration for k6 load tests.
 * Aligns with NFR-001, NFR-002 from the SDLC/SRS specification.
 *
 * NFR-001 Performance Thresholds:
 *   p50 < 200ms, p95 < 500ms, p99 < 1000ms
 *
 * NFR-002 Scalability Targets (Stage 1: 0-1,000 users):
 *   100 concurrent users, 50 active bookings, 100 TPS
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:7381';
export const API_PREFIX = '/api/v1';

export const NFR_THRESHOLDS = {
  http_req_duration: ['p(50)<200', 'p(95)<500', 'p(99)<1000'],
  http_req_failed: ['rate<0.01'],
  http_reqs: ['rate>10'],
};

export const PROFILES = {
  smoke: {
    vus: 1,
    duration: '30s',
    thresholds: NFR_THRESHOLDS,
  },

  load: {
    stages: [
      { duration: '1m', target: 20 },
      { duration: '3m', target: 50 },
      { duration: '3m', target: 100 },
      { duration: '2m', target: 100 },
      { duration: '1m', target: 0 },
    ],
    thresholds: NFR_THRESHOLDS,
  },

  stress: {
    stages: [
      { duration: '1m', target: 50 },
      { duration: '2m', target: 200 },
      { duration: '2m', target: 500 },
      { duration: '3m', target: 500 },
      { duration: '2m', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(50)<300', 'p(95)<800', 'p(99)<2000'],
      http_req_failed: ['rate<0.05'],
    },
  },

  soak: {
    stages: [
      { duration: '2m', target: 100 },
      { duration: '30m', target: 100 },
      { duration: '2m', target: 0 },
    ],
    thresholds: NFR_THRESHOLDS,
  },
};

export function apiUrl(path) {
  return `${BASE_URL}${API_PREFIX}${path}`;
}

export function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

export function jsonHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
    },
  };
}
