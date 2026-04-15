import { canTransition, VALID_TRANSITIONS, BookingStatus } from '../src/types/booking.types';

describe('Booking State Machine', () => {
  describe('canTransition', () => {
    it('should allow requested → matched', () => {
      expect(canTransition('requested', 'matched')).toBe(true);
    });

    it('should allow requested → quoted', () => {
      expect(canTransition('requested', 'quoted')).toBe(true);
    });

    it('should allow requested → cancelled_by_customer', () => {
      expect(canTransition('requested', 'cancelled_by_customer')).toBe(true);
    });

    it('should allow requested → payment_pending (fixed-price instant-pay)', () => {
      expect(canTransition('requested', 'payment_pending')).toBe(true);
    });

    it('should allow matched → payment_pending', () => {
      expect(canTransition('matched', 'payment_pending')).toBe(true);
    });

    it('should allow paid → provider_en_route', () => {
      expect(canTransition('paid', 'provider_en_route')).toBe(true);
    });

    it('should allow provider_en_route → provider_arrived', () => {
      expect(canTransition('provider_en_route', 'provider_arrived')).toBe(true);
    });

    it('should allow in_progress → completed_by_provider', () => {
      expect(canTransition('in_progress', 'completed_by_provider')).toBe(true);
    });

    it('should allow completed_by_provider → confirmed', () => {
      expect(canTransition('completed_by_provider', 'confirmed')).toBe(true);
    });

    it('should allow completed_by_provider → disputed', () => {
      expect(canTransition('completed_by_provider', 'disputed')).toBe(true);
    });

    it('should allow confirmed → payout_ready', () => {
      expect(canTransition('confirmed', 'payout_ready')).toBe(true);
    });

    it('should allow payout_ready → paid_out', () => {
      expect(canTransition('payout_ready', 'paid_out')).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('should reject requested → paid (skip payment_pending)', () => {
      expect(canTransition('requested', 'paid')).toBe(false);
    });

    it('should reject requested → in_progress (skip multiple states)', () => {
      expect(canTransition('requested', 'in_progress')).toBe(false);
    });

    it('should reject completed_by_provider → requested (backwards)', () => {
      expect(canTransition('completed_by_provider', 'requested')).toBe(false);
    });

    it('should reject paid_out → anything (terminal state)', () => {
      expect(canTransition('paid_out', 'requested')).toBe(false);
      expect(canTransition('paid_out', 'confirmed')).toBe(false);
      expect(canTransition('paid_out', 'paid_out')).toBe(false);
    });

    it('should reject cancelled_by_customer → anything (terminal state)', () => {
      expect(canTransition('cancelled_by_customer', 'requested')).toBe(false);
      expect(canTransition('cancelled_by_customer', 'matched')).toBe(false);
    });

    it('should reject cancelled_by_provider → anything (terminal state)', () => {
      expect(canTransition('cancelled_by_provider', 'requested')).toBe(false);
    });

    it('should reject cancelled_by_admin → anything (terminal state)', () => {
      expect(canTransition('cancelled_by_admin', 'requested')).toBe(false);
    });

    it('should reject confirmed → disputed (too late)', () => {
      expect(canTransition('confirmed', 'disputed')).toBe(false);
    });

    it('should reject in_progress → cancelled_by_customer', () => {
      expect(canTransition('in_progress', 'cancelled_by_customer')).toBe(false);
    });
  });

  describe('admin cancellation', () => {
    const adminCancellable: BookingStatus[] = [
      'requested', 'quoted', 'matched', 'payment_pending',
      'paid', 'provider_en_route', 'provider_arrived', 'in_progress',
    ];

    for (const status of adminCancellable) {
      it(`should allow admin cancellation from ${status}`, () => {
        expect(canTransition(status, 'cancelled_by_admin')).toBe(true);
      });
    }

    it('should NOT allow admin cancellation from terminal states', () => {
      expect(canTransition('paid_out', 'cancelled_by_admin')).toBe(false);
      expect(canTransition('cancelled_by_customer', 'cancelled_by_admin')).toBe(false);
    });
  });

  describe('escrow flow', () => {
    it('should follow the full happy path: requested → paid_out', () => {
      const happyPath: BookingStatus[] = [
        'requested', 'matched', 'payment_pending', 'paid',
        'provider_en_route', 'provider_arrived', 'in_progress',
        'completed_by_provider', 'confirmed', 'payout_ready', 'paid_out',
      ];

      for (let i = 0; i < happyPath.length - 1; i++) {
        expect(canTransition(happyPath[i]!, happyPath[i + 1]!)).toBe(true);
      }
    });

    it('should follow the fixed-price instant-pay path: requested → payment_pending → paid_out', () => {
      const fixedPath: BookingStatus[] = [
        'requested', 'payment_pending', 'paid',
        'provider_en_route', 'provider_arrived', 'in_progress',
        'completed_by_provider', 'confirmed', 'payout_ready', 'paid_out',
      ];

      for (let i = 0; i < fixedPath.length - 1; i++) {
        expect(canTransition(fixedPath[i]!, fixedPath[i + 1]!)).toBe(true);
      }
    });

    it('should follow the quote-based path', () => {
      const quotePath: BookingStatus[] = [
        'requested', 'quoted', 'matched', 'payment_pending', 'paid',
        'provider_en_route', 'provider_arrived', 'in_progress',
        'completed_by_provider', 'confirmed', 'payout_ready', 'paid_out',
      ];

      for (let i = 0; i < quotePath.length - 1; i++) {
        expect(canTransition(quotePath[i]!, quotePath[i + 1]!)).toBe(true);
      }
    });

    it('should follow the dispute path', () => {
      expect(canTransition('completed_by_provider', 'disputed')).toBe(true);
      expect(canTransition('disputed', 'resolved')).toBe(true);
      expect(canTransition('resolved', 'payout_ready')).toBe(true);
    });
  });

  describe('VALID_TRANSITIONS completeness', () => {
    const allStatuses: BookingStatus[] = [
      'requested', 'quoted', 'matched', 'payment_pending', 'paid',
      'provider_en_route', 'provider_arrived', 'in_progress',
      'completed_by_provider', 'confirmed', 'disputed', 'resolved',
      'payout_ready', 'paid_out',
      'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin',
    ];

    it('should have an entry for every status', () => {
      for (const status of allStatuses) {
        expect(VALID_TRANSITIONS).toHaveProperty(status);
      }
    });

    it('should have terminal states with empty transitions', () => {
      expect(VALID_TRANSITIONS.paid_out).toEqual([]);
      expect(VALID_TRANSITIONS.cancelled_by_customer).toEqual([]);
      expect(VALID_TRANSITIONS.cancelled_by_provider).toEqual([]);
      expect(VALID_TRANSITIONS.cancelled_by_admin).toEqual([]);
    });
  });
});
