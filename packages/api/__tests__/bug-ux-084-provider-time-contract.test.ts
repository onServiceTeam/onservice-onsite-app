jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));

import { formatOverride, formatScheduleSlot } from '../src/services/provider.service';

it('Bug UX-084 — provider schedule and override responses serialize database times as editable HH:MM values', () => {
  const schedule = formatScheduleSlot({
    id: 'slot-1',
    provider_id: 'provider-1',
    day_of_week: 1,
    start_time: '08:00:00',
    end_time: '17:30:00',
    is_available: false,
    created_at: new Date('2026-08-24T00:00:00Z'),
  });
  expect(schedule.startTime).toBe('08:00');
  expect(schedule.endTime).toBe('17:30');

  const override = formatOverride({
    id: 'override-1',
    provider_id: 'provider-1',
    override_date: '2026-08-31',
    is_available: true,
    start_time: '09:15:00',
    end_time: '13:45:00',
    reason: null,
    created_at: new Date('2026-08-24T00:00:00Z'),
    updated_at: new Date('2026-08-24T00:00:00Z'),
  });
  expect(override.startTime).toBe('09:15');
  expect(override.endTime).toBe('13:45');
});
