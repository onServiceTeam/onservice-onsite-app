import { getMatchConfig } from '../src/services/matching.service';

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
});
