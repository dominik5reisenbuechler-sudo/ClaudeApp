import { describe, expect, it } from 'vitest';

import {
  calorieAdjustment,
  MIN_DAYS_BETWEEN_ADJUSTMENTS,
  MIN_LOGGING_DAYS_PER_WEEK,
} from './calorieAdjustment';
import type { CalorieAdjustmentInput } from './calorieAdjustment';
import type { SafetyFlag } from '../nutrition/safety';
import type { TdeeEstimate } from '../nutrition/tdeeEstimator';

/**
 * A confident, well-logged estimate of a weight that is not moving. Every test
 * starts from data the engine has no excuse to distrust, and then spoils
 * exactly the one thing it is about.
 */
function estimate(over: Partial<TdeeEstimate> = {}): TdeeEstimate {
  return {
    estimatedTdeeKcal: 3000,
    confidence: {
      weighInDensity: 1,
      loggingDensity: 1,
      loggingCompleteness: 1,
      windowLength: 1,
      overall: 0.8,
    },
    band: 'high',
    meanIntakeKcal: 3000,
    weightChangeKgPerWeek: 0,
    windowStart: '2025-06-02',
    windowEnd: '2025-06-22',
    daysAnalysed: 21,
    weighInCount: 15,
    loggedDayCount: 18,
    plausibleDayCount: 18,
    isUsable: true,
    explanation:
      'Over 21 days you averaged 3,000 kcal a day and your weight trend held steady. That puts your actual daily expenditure at roughly 3,000 kcal.',
    ...over,
  };
}

/** 80 kg male on a lean bulk eating 3,000 kcal, with room above the floor. */
function input(over: Partial<CalorieAdjustmentInput> = {}): CalorieAdjustmentInput {
  return {
    goal: 'lean_bulk',
    currentTargetKcal: 3000,
    estimate: estimate(),
    weightKg: 80,
    sex: 'male',
    bmrKcal: 1800,
    daysSinceLastAdjustment: null,
    safetyFlags: [],
    ...over,
  };
}

describe('calorieAdjustment — gate 1: the estimate must be worth acting on', () => {
  it('makes no change when the estimator says its own number is unusable', () => {
    const result = calorieAdjustment(
      input({
        estimate: estimate({
          isUsable: false,
          explanation: 'We need at least 14 days of data before we can measure your expenditure.',
        }),
      }),
    );

    expect(result.type).toBe('no_change');
    expect(result.suggestedValue).toEqual({});
    // The estimator's own words are carried through rather than paraphrased.
    expect(result.reason).toContain('at least 14 days of data');
  });

  it('makes no change when there is no measured rate at all', () => {
    const result = calorieAdjustment(
      input({
        estimate: estimate({
          weightChangeKgPerWeek: null,
          estimatedTdeeKcal: null,
          explanation: 'We have 2 weigh-ins in this window, which is not enough.',
        }),
      }),
    );

    expect(result.type).toBe('no_change');
    expect(result.reason).toContain('3,000 kcal');
  });

  it('refuses to act at low confidence even if the rate is badly off', () => {
    // The definition of done for the adaptive engine: below the confidence
    // gate, nothing moves — whatever the data appears to be saying.
    const result = calorieAdjustment(
      input({
        estimate: estimate({
          // Deliberately inconsistent: usable, but under the action threshold.
          // The two thresholds live in different modules, and this pins down
          // that the *action* gate is what protects the user's food.
          isUsable: true,
          confidence: {
            weighInDensity: 0.5,
            loggingDensity: 0.7,
            loggingCompleteness: 1,
            windowLength: 0.8,
            overall: 0.3,
          },
          weightChangeKgPerWeek: -0.4,
        }),
      }),
    );

    expect(result.type).toBe('no_change');
    expect(result.confidence).toBe(0.3);
    expect(result.reason).toMatch(/not yet consistent enough/i);
  });
});

describe('calorieAdjustment — gate 2: adherence before arithmetic', () => {
  it('names the logging problem instead of moving a target that was not followed', () => {
    const result = calorieAdjustment(
      input({
        // 9 logged days across 21 = 3.0 a week, under the threshold.
        estimate: estimate({ loggedDayCount: 9, plausibleDayCount: 9, weightChangeKgPerWeek: 0 }),
      }),
    );

    expect(result.type).toBe('adherence');
    expect(result.suggestedValue).toEqual({});
    expect(result.reason).toContain('3.0 days a week');
    expect(result.reason).toContain('21 days');
  });

  it('accepts logging exactly at the threshold', () => {
    // 12 days across 21 = 4.0 a week, which is the minimum.
    const result = calorieAdjustment(
      input({ estimate: estimate({ loggedDayCount: 12, plausibleDayCount: 12 }) }),
    );

    expect(result.type).not.toBe('adherence');
  });

  it('measures logging per week, not in absolute days', () => {
    // 10 days in a 14-day window is 5 a week — sparse in total, fine in rate.
    const result = calorieAdjustment(
      input({
        estimate: estimate({ daysAnalysed: 14, loggedDayCount: 10, plausibleDayCount: 10 }),
      }),
    );

    expect(result.type).not.toBe('adherence');
  });

  it('states the threshold it is applying', () => {
    expect(MIN_LOGGING_DAYS_PER_WEEK).toBe(4);
  });
});

describe('calorieAdjustment — gate 3: the rate must genuinely be off', () => {
  it('changes nothing when the rate sits inside the goal band', () => {
    // A lean bulk at 80 kg wants 0.2–0.4 kg/week; 0.3 is squarely inside.
    const result = calorieAdjustment(
      input({ estimate: estimate({ weightChangeKgPerWeek: 0.3 }) }),
    );

    expect(result.type).toBe('no_change');
    expect(result.reason).toContain('+0.3 kg');
    expect(result.reason).toContain('3,000 kcal');
  });

  it('leaves a maintenance user who is holding steady alone', () => {
    const result = calorieAdjustment(input({ goal: 'maintenance' }));
    expect(result.type).toBe('no_change');
  });
});

describe('calorieAdjustment — gate 4: one change at a time', () => {
  it('waits out the interval after a recent change', () => {
    const result = calorieAdjustment(
      input({ estimate: estimate({ weightChangeKgPerWeek: 0 }), daysSinceLastAdjustment: 5 }),
    );

    expect(result.type).toBe('no_change');
    expect(result.reason).toContain('5 days ago');
    expect(result.reason).toContain(`${MIN_DAYS_BETWEEN_ADJUSTMENTS} days`);
  });

  it('acts once the interval has passed', () => {
    const result = calorieAdjustment(
      input({
        estimate: estimate({ weightChangeKgPerWeek: 0 }),
        daysSinceLastAdjustment: MIN_DAYS_BETWEEN_ADJUSTMENTS,
      }),
    );

    expect(result.type).toBe('calorie_adjustment');
  });

  it('acts when nothing has ever been adjusted', () => {
    const result = calorieAdjustment(
      input({ estimate: estimate({ weightChangeKgPerWeek: 0 }), daysSinceLastAdjustment: null }),
    );

    expect(result.type).toBe('calorie_adjustment');
  });
});

describe('calorieAdjustment — sizing the change', () => {
  it('raises calories for a stalled bulk', () => {
    const result = calorieAdjustment(input({ estimate: estimate({ weightChangeKgPerWeek: 0 }) }));

    expect(result.type).toBe('calorie_adjustment');
    // Gap to the 0.3 kg/week midpoint implies +330 kcal; the high-confidence
    // cap holds it to +200.
    expect(result.suggestedValue).toEqual({ energyKcal: 3200, deltaKcal: 200 });
    expect(result.currentValue).toEqual({ energyKcal: 3000, goal: 'lean_bulk' });
  });

  it('lowers calories for a bulk running away', () => {
    const result = calorieAdjustment(input({ estimate: estimate({ weightChangeKgPerWeek: 0.8 }) }));

    expect(result.type).toBe('calorie_adjustment');
    expect(result.suggestedValue).toEqual({ energyKcal: 2800, deltaKcal: -200 });
  });

  it('caps the change harder when confidence is only moderate', () => {
    const result = calorieAdjustment(
      input({
        estimate: estimate({
          weightChangeKgPerWeek: 0,
          confidence: {
            weighInDensity: 0.8,
            loggingDensity: 0.9,
            loggingCompleteness: 1,
            windowLength: 0.85,
            overall: 0.6,
          },
        }),
      }),
    );

    expect(result.suggestedValue).toEqual({ energyKcal: 3100, deltaKcal: 100 });
  });

  it('tolerates a rate that is off the midpoint but inside the band', () => {
    // A cut at 80 kg wants −0.8 to −0.4 kg/week, midpoint −0.6. Losing 0.45 is
    // short of the midpoint but still inside the band, and chasing the midpoint
    // every week would mean changing someone's food for no reason.
    const result = calorieAdjustment(
      input({
        goal: 'cut',
        currentTargetKcal: 2400,
        estimate: estimate({ weightChangeKgPerWeek: -0.45 }),
      }),
    );

    expect(result.type).toBe('no_change');
    expect(result.suggestedValue).toEqual({});
  });

  it('scales the target rate with bodyweight, not as a flat kilogram figure', () => {
    const light = calorieAdjustment(
      input({ weightKg: 55, estimate: estimate({ weightChangeKgPerWeek: 0 }) }),
    );
    const heavy = calorieAdjustment(
      input({ weightKg: 110, estimate: estimate({ weightChangeKgPerWeek: 0 }) }),
    );

    // Both are stalled, but the heavier user's intended rate — and so the
    // implied energy gap — is larger.
    expect(light.type).toBe('calorie_adjustment');
    expect(heavy.type).toBe('calorie_adjustment');
    expect(light.reason).toContain('+0.21 kg');
    expect(heavy.reason).toContain('+0.41 kg');
  });
});

describe('calorieAdjustment — safety wins over the maths', () => {
  it('never recommends below the calorie floor', () => {
    // 2,000 kcal minus the implied 200 would be 1,800, under the 1,980 floor
    // for an 1,800 kcal BMR.
    const result = calorieAdjustment(
      input({
        goal: 'cut',
        currentTargetKcal: 2000,
        estimate: estimate({ weightChangeKgPerWeek: 0 }),
      }),
    );

    expect(result.type).toBe('calorie_adjustment');
    expect(result.suggestedValue).toEqual({ energyKcal: 1980, deltaKcal: -20 });
    expect(result.reason).toMatch(/minimum intake/i);
  });

  it('refuses a reduction when a safety flag blocks deficits', () => {
    const flag: SafetyFlag = {
      code: 'low_bmi',
      severity: 'block_deficit',
      message: 'Below the typical healthy weight range.',
    };

    const result = calorieAdjustment(
      input({
        goal: 'maintenance',
        estimate: estimate({ weightChangeKgPerWeek: 0.3 }),
        safetyFlags: [flag],
      }),
    );

    expect(result.type).toBe('no_change');
    expect(result.evidenceRuleIds).toContain('safety.block_deficit');
    expect(result.reason).toMatch(/doctor or registered dietitian/i);
  });

  it('still allows an increase for a flagged user', () => {
    const flag: SafetyFlag = {
      code: 'low_bmi',
      severity: 'block_deficit',
      message: 'Below the typical healthy weight range.',
    };

    const result = calorieAdjustment(
      input({ estimate: estimate({ weightChangeKgPerWeek: 0 }), safetyFlags: [flag] }),
    );

    expect(result.type).toBe('calorie_adjustment');
    expect(result.suggestedValue).toEqual({ energyKcal: 3200, deltaKcal: 200 });
  });

  it('ignores warn-level flags, which are informational', () => {
    const flag: SafetyFlag = {
      code: 'medical_condition',
      severity: 'warn',
      message: 'Please check these targets with your doctor.',
    };

    const result = calorieAdjustment(
      input({
        goal: 'maintenance',
        estimate: estimate({ weightChangeKgPerWeek: 0.3 }),
        safetyFlags: [flag],
      }),
    );

    expect(result.type).toBe('calorie_adjustment');
  });
});

describe('calorieAdjustment — every recommendation cites its actual numbers', () => {
  it('quotes the observed rate, the intended rate, and the data behind both', () => {
    const result = calorieAdjustment(input({ estimate: estimate({ weightChangeKgPerWeek: 0.05 }) }));

    expect(result.type).toBe('calorie_adjustment');
    expect(result.reason).toContain('from 3,000 to 3,200');
    expect(result.reason).toContain('+0.05 kg');
    expect(result.reason).toContain('+0.3 kg');
    expect(result.reason).toContain('21 days');
    expect(result.reason).toContain('18 days of food');
    expect(result.reason).toContain('15 times');
  });

  it('describes a flat trend as such rather than inventing a rate', () => {
    const result = calorieAdjustment(input({ estimate: estimate({ weightChangeKgPerWeek: 0 }) }));
    expect(result.reason).toContain('less than 0.01 kg');
  });

  it('gives every outcome a substantial reason, as the database demands', () => {
    const cases: CalorieAdjustmentInput[] = [
      input({ estimate: estimate({ isUsable: false }) }),
      input({ estimate: estimate({ loggedDayCount: 6, plausibleDayCount: 6 }) }),
      input({ estimate: estimate({ weightChangeKgPerWeek: 0.3 }) }),
      input({ estimate: estimate({ weightChangeKgPerWeek: 0 }), daysSinceLastAdjustment: 3 }),
      input({ estimate: estimate({ weightChangeKgPerWeek: 0 }) }),
    ];

    for (const testCase of cases) {
      const result = calorieAdjustment(testCase);
      // `recommendations.reason` carries a `length(trim(reason)) >= 20` check.
      expect(result.reason.trim().length).toBeGreaterThanOrEqual(20);
      expect(result.evidenceRuleIds.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('carries the estimate confidence through to the recommendation', () => {
    const result = calorieAdjustment(input({ estimate: estimate({ weightChangeKgPerWeek: 0 }) }));
    expect(result.confidence).toBe(0.8);
  });
});
