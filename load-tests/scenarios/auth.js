import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { apiUrl, jsonHeaders, PROFILES, NFR_THRESHOLDS } from '../config.js';

const loginDuration = new Trend('login_duration');
const otpVerifyDuration = new Trend('otp_verify_duration');
const tokenRefreshDuration = new Trend('token_refresh_duration');
const authFailRate = new Rate('auth_fail_rate');

const PROFILE = __ENV.PROFILE || 'load';

export const options = {
  ...PROFILES[PROFILE],
  thresholds: {
    ...NFR_THRESHOLDS,
    login_duration: ['p(95)<300'],
    otp_verify_duration: ['p(95)<400'],
    token_refresh_duration: ['p(95)<200'],
    auth_fail_rate: ['rate<0.01'],
  },
  tags: { scenario: 'auth' },
};

const TEST_PHONE = __ENV.TEST_PHONE || '+639171234567';

export default function () {
  group('Auth: Login → OTP → Refresh', () => {
    const loginRes = http.post(
      apiUrl('/auth/login'),
      JSON.stringify({ phone: TEST_PHONE }),
      jsonHeaders(),
    );

    const loginOk = check(loginRes, {
      'login returns 200': (r) => r.status === 200,
      'login returns OTP sent': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === true;
        } catch {
          return false;
        }
      },
    });
    loginDuration.add(loginRes.timings.duration);
    authFailRate.add(!loginOk);

    sleep(0.5);

    const otpRes = http.post(
      apiUrl('/auth/verify-otp'),
      JSON.stringify({ phone: TEST_PHONE, otp: '123456' }),
      jsonHeaders(),
    );

    let accessToken = null;
    let refreshToken = null;
    const otpOk = check(otpRes, {
      'OTP verify returns 200': (r) => r.status === 200,
      'OTP returns tokens': (r) => {
        try {
          const body = JSON.parse(r.body);
          accessToken = body.data?.accessToken;
          refreshToken = body.data?.refreshToken;
          return !!accessToken && !!refreshToken;
        } catch {
          return false;
        }
      },
    });
    otpVerifyDuration.add(otpRes.timings.duration);
    authFailRate.add(!otpOk);

    sleep(0.5);

    if (refreshToken) {
      const refreshRes = http.post(
        apiUrl('/auth/refresh'),
        JSON.stringify({ refreshToken }),
        jsonHeaders(),
      );

      const refreshOk = check(refreshRes, {
        'token refresh returns 200': (r) => r.status === 200,
        'refresh returns new access token': (r) => {
          try {
            const body = JSON.parse(r.body);
            return !!body.data?.accessToken;
          } catch {
            return false;
          }
        },
      });
      tokenRefreshDuration.add(refreshRes.timings.duration);
      authFailRate.add(!refreshOk);
    }
  });

  sleep(1);
}
