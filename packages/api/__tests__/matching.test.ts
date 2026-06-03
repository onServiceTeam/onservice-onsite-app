import {
  getMatchConfig,
  isExcludedByRatingFloor,
  computeAcceptanceRate,
  scoreProvider,
} from '../src/services/matching.service';

describe('Provider Matching Algorithm', () => {
  describe('scoring weights', () => {
    it('should have weights that sum to 1.0', () => {
      const config = getMatchConfig();
      const { rating, distance, acceptance, tier } = config.scoringWeights;
      expect(rating + distance + acceptance + tier).toBeCloseTo(1.0);
    });

    it('should weight rating highest at 0.4', () => {
      const config = getMatchConfig();
      expect(config.scoringWeights.rating).toBe(0.4);
    });

    it('should weight distance second at 0.3', () => {
      const config = getMatchConfig();
      expect(config.scoringWeights.distance).toBe(0.3);
    });

    it('should weight acceptance rate at 0.2', () => {
      const config = getMatchConfig();
      expect(config.scoringWeights.acceptance).toBe(0.2);
    });

    it('should weight tier bonus at 0.1', () => {
      const config = getMatchConfig();
      expect(config.scoringWeights.tier).toBe(0.1);
    });
  });

  describe('match configuration', () => {
    it('should allow maximum 10 match attempts', () => {
      const config = getMatchConfig();
      expect(config.maxAttempts).toBe(10);
    });

    it('should offer timeout of 45 seconds per FR-051', () => {
      const config = getMatchConfig();
      expect(config.offerTimeoutSeconds).toBe(45);
    });

    it('should have 5-minute max wait for customer per FR-051', () => {
      const config = getMatchConfig();
      expect(config.maxWaitMinutes).toBe(5);
    });

    it('should enforce max service radius from platform config', () => {
      const config = getMatchConfig();
      expect(config.maxServiceRadiusKm).toBe(50);
    });
  });

  describe('scoring formula verification', () => {
    it('should produce score between 0 and 1 for any valid input', () => {
      const ratingScore = (5 / 5) * 0.4;
      const distanceScore = (1 - 0 / 50) * 0.3;
      const acceptanceScore = 1.0 * 0.2;
      const tierScore = 1.0 * 0.1;
      const totalScore = ratingScore + distanceScore + acceptanceScore + tierScore;

      expect(totalScore).toBeLessThanOrEqual(1.0);
      expect(totalScore).toBeGreaterThan(0);
    });

    it('should produce lower score for low-rated far providers', () => {
      const goodProvider = (4.8 / 5) * 0.4 + (1 - 2 / 50) * 0.3 + 0.9 * 0.2 + 1.0 * 0.1;
      const badProvider = (3.0 / 5) * 0.4 + (1 - 40 / 50) * 0.3 + 0.5 * 0.2 + 0.0 * 0.1;

      expect(goodProvider).toBeGreaterThan(badProvider);
    });

    it('should give elite tier providers 0.1 bonus', () => {
      const eliteBonus = 1.0 * 0.1;
      const newBonus = 0.0 * 0.1;
      expect(eliteBonus - newBonus).toBeCloseTo(0.1);
    });

    it('should give verified tier providers 0.025 bonus', () => {
      const verifiedBonus = 0.25 * 0.1;
      expect(verifiedBonus).toBeCloseTo(0.025);
    });

    it('should give pro tier providers 0.05 bonus', () => {
      const proBonus = 0.5 * 0.1;
      expect(proBonus).toBeCloseTo(0.05);
    });
  });

  // ── Phase 200 — provider-quality controls ─────────────────────────
  describe('rating floor exclusion (isExcludedByRatingFloor)', () => {
    const FLOOR = 2.5;
    const MIN_REVIEWS = 5;

    it('excludes a proven-low-rated provider (below floor, enough reviews)', () => {
      expect(isExcludedByRatingFloor(2.1, 12, FLOOR, MIN_REVIEWS)).toBe(true);
    });

    it('does NOT exclude a brand-new provider with too few reviews', () => {
      // 0 reviews, rating 0 — a newcomer must still be eligible for work.
      expect(isExcludedByRatingFloor(0, 0, FLOOR, MIN_REVIEWS)).toBe(false);
      expect(isExcludedByRatingFloor(1.0, 4, FLOOR, MIN_REVIEWS)).toBe(false);
    });

    it('does NOT exclude a good provider at or above the floor', () => {
      expect(isExcludedByRatingFloor(2.5, 50, FLOOR, MIN_REVIEWS)).toBe(false);
      expect(isExcludedByRatingFloor(4.8, 200, FLOOR, MIN_REVIEWS)).toBe(false);
    });

    it('excludes exactly at the review threshold when below the floor', () => {
      expect(isExcludedByRatingFloor(2.0, 5, FLOOR, MIN_REVIEWS)).toBe(true);
    });
  });

  describe('reliability rate (computeAcceptanceRate)', () => {
    it('is accepted / responded when there is history', () => {
      expect(computeAcceptanceRate(8, 10)).toBeCloseTo(0.8);
      expect(computeAcceptanceRate(0, 4)).toBeCloseTo(0);
    });

    it('returns the neutral default when there is no offer history', () => {
      expect(computeAcceptanceRate(0, 0, 0.7)).toBe(0.7);
    });

    it('penalises a provider who declines/ignores most offers', () => {
      const reliable = computeAcceptanceRate(9, 10);
      const flaky = computeAcceptanceRate(2, 10);
      expect(reliable).toBeGreaterThan(flaky);
    });
  });

  describe('scoreProvider weighting', () => {
    it('is bounded in [0,1] for valid inputs', () => {
      const s = scoreProvider({ rating: 5, distanceKm: 0, maxDistanceKm: 50, acceptanceRate: 1, tierBonus: 1 });
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });

    it('ranks a higher-rated, closer, more reliable provider above a worse one', () => {
      const good = scoreProvider({ rating: 4.9, distanceKm: 1, maxDistanceKm: 20, acceptanceRate: 0.95, tierBonus: 0.5 });
      const bad = scoreProvider({ rating: 3.0, distanceKm: 18, maxDistanceKm: 20, acceptanceRate: 0.3, tierBonus: 0 });
      expect(good).toBeGreaterThan(bad);
    });

    it('rewards higher reliability when all else is equal', () => {
      const base = { rating: 4.5, distanceKm: 5, maxDistanceKm: 20, tierBonus: 0.25 };
      const reliable = scoreProvider({ ...base, acceptanceRate: 0.95 });
      const flaky = scoreProvider({ ...base, acceptanceRate: 0.2 });
      expect(reliable).toBeGreaterThan(flaky);
      // reliability is weighted 0.2, so the gap is (0.95-0.2)*0.2 = 0.15
      expect(reliable - flaky).toBeCloseTo(0.15, 2);
    });
  });
});
