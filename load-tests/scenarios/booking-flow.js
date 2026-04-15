import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { apiUrl, jsonHeaders, authHeaders, PROFILES, NFR_THRESHOLDS } from '../config.js';

const createBookingDuration = new Trend('create_booking_duration');
const listBookingsDuration = new Trend('list_bookings_duration');
const getBookingDuration = new Trend('get_booking_duration');
const statusTransitionDuration = new Trend('status_transition_duration');
const bookingFailRate = new Rate('booking_fail_rate');

const PROFILE = __ENV.PROFILE || 'load';

export const options = {
  ...PROFILES[PROFILE],
  thresholds: {
    ...NFR_THRESHOLDS,
    create_booking_duration: ['p(95)<500'],
    list_bookings_duration: ['p(95)<300'],
    get_booking_duration: ['p(95)<200'],
    status_transition_duration: ['p(95)<500'],
    booking_fail_rate: ['rate<0.02'],
  },
  tags: { scenario: 'booking-flow' },
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
    const body = JSON.parse(otpRes.body);
    return body.data?.accessToken ?? null;
  } catch {
    return null;
  }
}

export function setup() {
  const token = authenticate();
  return { token };
}

export default function (data) {
  const token = data.token;
  if (!token) {
    bookingFailRate.add(true);
    return;
  }

  const headers = authHeaders(token);

  group('Booking: List existing bookings', () => {
    const listRes = http.get(apiUrl('/bookings?page=1&pageSize=20'), headers);

    const listOk = check(listRes, {
      'list bookings returns 200': (r) => r.status === 200,
      'list returns array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data);
        } catch {
          return false;
        }
      },
    });
    listBookingsDuration.add(listRes.timings.duration);
    bookingFailRate.add(!listOk);
  });

  sleep(0.5);

  let bookingId = null;

  group('Booking: Create new booking', () => {
    const payload = {
      categoryId: __ENV.CATEGORY_ID || '00000000-0000-0000-0000-000000000001',
      bookingType: 'fixed_price',
      address: '123 Test Street',
      barangay: 'San Miguel',
      city: 'Manila',
      province: 'Metro Manila',
      latitude: 14.5995,
      longitude: 120.9842,
      scheduledAt: new Date(Date.now() + 86400000 * 3).toISOString(),
      description: 'Load test booking — general cleaning service for 2BR apartment',
      servicePrice: 150000,
    };

    const createRes = http.post(
      apiUrl('/bookings'),
      JSON.stringify(payload),
      headers,
    );

    const createOk = check(createRes, {
      'create booking returns 201': (r) => r.status === 201,
      'create returns booking id': (r) => {
        try {
          bookingId = JSON.parse(r.body).data?.id;
          return !!bookingId;
        } catch {
          return false;
        }
      },
    });
    createBookingDuration.add(createRes.timings.duration);
    bookingFailRate.add(!createOk);
  });

  sleep(0.5);

  if (bookingId) {
    group('Booking: Get single booking', () => {
      const getRes = http.get(apiUrl(`/bookings/${bookingId}`), headers);

      const getOk = check(getRes, {
        'get booking returns 200': (r) => r.status === 200,
        'get returns matching id': (r) => {
          try {
            return JSON.parse(r.body).data?.id === bookingId;
          } catch {
            return false;
          }
        },
      });
      getBookingDuration.add(getRes.timings.duration);
      bookingFailRate.add(!getOk);
    });

    sleep(0.5);

    group('Booking: Cancel booking', () => {
      const cancelRes = http.patch(
        apiUrl(`/bookings/${bookingId}/status`),
        JSON.stringify({
          status: 'cancelled_by_customer',
          cancellationReason: 'Load test cleanup',
        }),
        headers,
      );

      const cancelOk = check(cancelRes, {
        'cancel booking returns 200': (r) => r.status === 200,
      });
      statusTransitionDuration.add(cancelRes.timings.duration);
      bookingFailRate.add(!cancelOk);
    });
  }

  sleep(1);
}
