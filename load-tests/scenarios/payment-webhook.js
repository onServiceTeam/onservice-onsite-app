import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { apiUrl, jsonHeaders, authHeaders, PROFILES, NFR_THRESHOLDS } from '../config.js';

const webhookDuration = new Trend('webhook_duration');
const paymentGetDuration = new Trend('payment_get_duration');
const walletGetDuration = new Trend('wallet_get_duration');
const paymentFailRate = new Rate('payment_fail_rate');

const PROFILE = __ENV.PROFILE || 'load';

export const options = {
  ...PROFILES[PROFILE],
  thresholds: {
    ...NFR_THRESHOLDS,
    webhook_duration: ['p(95)<500'],
    payment_get_duration: ['p(95)<300'],
    wallet_get_duration: ['p(95)<200'],
    payment_fail_rate: ['rate<0.02'],
  },
  tags: { scenario: 'payment-webhook' },
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
    paymentFailRate.add(true);
    return;
  }

  const headers = authHeaders(token);

  group('Wallet: Get balances', () => {
    const res = http.get(apiUrl('/wallet'), headers);
    const ok = check(res, {
      'wallet returns 200': (r) => r.status === 200,
    });
    walletGetDuration.add(res.timings.duration);
    paymentFailRate.add(!ok);
  });

  sleep(0.5);

  group('Wallet: Get transaction history', () => {
    const res = http.get(apiUrl('/wallet/transactions?page=1&pageSize=20'), headers);
    check(res, {
      'wallet transactions returns 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);

  group('Webhook: Simulated PayMongo event (expect 401 — unsigned)', () => {
    const payload = JSON.stringify({
      data: {
        id: `evt_test_${Date.now()}`,
        type: 'event',
        attributes: {
          type: 'payment.paid',
          data: {
            id: `pay_test_${Date.now()}`,
            attributes: {
              amount: 150000,
              status: 'paid',
              metadata: { bookingId: 'test-booking-id' },
            },
          },
        },
      },
    });

    const res = http.post(
      apiUrl('/webhooks/paymongo'),
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'paymongo-signature': 'invalid-signature-for-load-test',
        },
      },
    );

    check(res, {
      'unsigned webhook rejected (401 or 400)': (r) => r.status === 401 || r.status === 400,
    });
    webhookDuration.add(res.timings.duration);
  });

  sleep(1);
}
