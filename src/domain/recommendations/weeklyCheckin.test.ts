import { describe, expect, it } from 'vitest';

import type { CalorieAdjustmentInput } from './calorieAdjustment';
import { assessRecovery } from './recovery';
import type { RecoveryAnswers } from './recovery';
import type { DeloadInput, VolumeAdjustmentInput } from './trainingAdjustment';
import { reviewWeek, MAX_VOLUME_RECOMMENDATIONS } from './weeklyCheckin';
import type { WeeklyCheckinInput } from './weeklyCheckin';
import type { TdeeEstimate } from '../nutrition/tdeeEstimator';
import type { MuscleId } from '@/types/domain';

const GOOD_ANSWERS: RecoveryAnswers = {
  trainingPerformance: 5,
  sleepQuality: 5,
  energy: 4,
  stress: 2,
  jointDiscomfort: 0,
};

const POOR_ANSWERS: RecoveryAnswers = {
  trainingPerformance: 2,
  sleepQuality: 1,
  energy: 1,
  stress: 5,
  jointDiscomfort: 3,
};

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
    weightChangeKgPerWeek: 0.3,
    windowStart: '2025-06-02',
    windowEnd: '2025-06-22',
    daysAnalysed: 21,
    weighInCount: 15,
    loggedDayCount: 18,
    plausibleDayCount: 18,
    isUsable: true,
    explanation: 'Over 21 days you averaged 3,000 kcal a day and your weight trend rose 0.3 kg.',
    ...over,
  };
}

function calorie(over: Partial<CalorieAdjustmentInput> = {}): CalorieAdjustmentInput {
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

function muscle(
  muscleId: MuscleId,
  over: Partial<VolumeAdjustmentInput> = {},
): VolumeAdjustmentInput {
  return {
    muscleId,
    currentSets: 12,
    targetMinSets: 8,
    targetMaxSets: 14,
    frequency: 2,
    isProgressing: true,
    isPriority: false,
    recovery: assessRecovery(GOOD_ANSWERS),
    adherenceRatio: 1,
    ...over,
  };
}

function deload(over: Partial<DeloadInput> = {}): DeloadInput {
  return {
    stalledWeeks: 0,
    rpeRise: null,
    jointDiscomfortWeeks: 0,
    recovery: assessRecovery(GOOD_ANSWERS),
    weeksInBlock: 4,
    weeksSinceLastDeload: null,
    ...over,
  };
}

function week(over: Partial<WeeklyCheckinInput> = {}): WeeklyCheckinInput {
  return {
    weekStartDate: '2025-06-16',
    answers: GOOD_ANSWERS,
    calorie: calorie(),
    muscles: [muscle('chest'), muscle('quads')],
    deload: deload(),
    ...over,
  };
}

describe('reviewWeek — a quiet week stays quiet', () => {
  it('returns exactly one recommendation when nothing needs to change', () => {
    const result = reviewWeek(week());

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.type).toBe('no_change');
  });

  it('prefers the engine that cites real numbers over a generic line', () => {
    const result = reviewWeek(week());
    // The calorie engine's "you are on target" reason quotes the rate.
    expect(result.recommendations[0]?.reason).toContain('+0.3 kg');
  });

  it('raises adherence above a bland no-change', () => {
    const result = reviewWeek(
      week({
        calorie: calorie({ estimate: estimate({ loggedDayCount: 6, plausibleDayCount: 6 }) }),
      }),
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.type).toBe('adherence');
  });

  it('says so plainly when there is nothing to read at all', () => {
    const result = reviewWeek(
      week({
        answers: {
          trainingPerformance: null,
          sleepQuality: null,
          energy: null,
          stress: null,
          jointDiscomfort: null,
        },
        calorie: null,
        deload: null,
        muscles: [],
      }),
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.reason).toMatch(/not enough logged/i);
    expect(result.recovery.band).toBe('unknown');
  });
});

describe('reviewWeek — a deload supersedes the training side', () => {
  it('drops volume changes when a deload is proposed', () => {
    const result = reviewWeek(
      week({
        answers: POOR_ANSWERS,
        deload: deload({ stalledWeeks: 3, recovery: assessRecovery(POOR_ANSWERS) }),
        muscles: [
          muscle('chest', { isProgressing: false, recovery: assessRecovery(GOOD_ANSWERS) }),
          muscle('quads', { isProgressing: false, recovery: assessRecovery(GOOD_ANSWERS) }),
        ],
      }),
    );

    expect(result.recommendations.map((r) => r.type)).toEqual(['deload']);
  });

  it('still adjusts calories during a deload week — food is a separate lever', () => {
    const result = reviewWeek(
      week({
        answers: POOR_ANSWERS,
        deload: deload({ stalledWeeks: 3, recovery: assessRecovery(POOR_ANSWERS) }),
        calorie: calorie({ estimate: estimate({ weightChangeKgPerWeek: 0 }) }),
      }),
    );

    expect(result.recommendations.map((r) => r.type)).toEqual(['deload', 'calorie_adjustment']);
  });

  it('keeps volume changes when the deload check comes back clean', () => {
    const result = reviewWeek(
      week({
        muscles: [muscle('chest', { isProgressing: false })],
      }),
    );

    expect(result.recommendations.map((r) => r.type)).toContain('volume_adjustment');
  });
});

describe('reviewWeek — changing one thing at a time', () => {
  it('caps how many muscles move in a single week', () => {
    const stalled = (id: MuscleId): VolumeAdjustmentInput =>
      muscle(id, { isProgressing: false });

    const result = reviewWeek(
      week({
        calorie: null,
        muscles: [
          stalled('chest'),
          stalled('quads'),
          stalled('biceps'),
          stalled('lats'),
          stalled('calves'),
        ],
      }),
    );

    expect(result.recommendations).toHaveLength(MAX_VOLUME_RECOMMENDATIONS);
    expect(result.recommendations.every((r) => r.type === 'volume_adjustment')).toBe(true);
  });

  it('keeps the changes it is surest about', () => {
    const result = reviewWeek(
      week({
        calorie: null,
        muscles: [
          // Sparse check-in answers, so a lower-confidence call.
          muscle('chest', {
            isProgressing: false,
            recovery: assessRecovery({
              trainingPerformance: 5,
              sleepQuality: 5,
              energy: null,
              stress: null,
              jointDiscomfort: null,
            }),
          }),
          muscle('quads', { isProgressing: false }),
          muscle('biceps', { isProgressing: false }),
        ],
      }),
    );

    const muscles = result.recommendations.map((r) => r.currentValue.muscleId);
    expect(muscles).not.toContain('chest');
  });

  it('drops muscles that need no change rather than reporting on each one', () => {
    const result = reviewWeek(
      week({
        calorie: null,
        muscles: [muscle('chest'), muscle('quads'), muscle('biceps', { isProgressing: false })],
      }),
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.currentValue.muscleId).toBe('biceps');
  });
});

describe('reviewWeek — the snapshot', () => {
  it('records the objective inputs the engine actually saw', () => {
    const result = reviewWeek(week());

    expect(result.computed).toMatchObject({
      weekStartDate: '2025-06-16',
      recovery: { band: 'good', answeredCount: 5 },
      nutrition: {
        goal: 'lean_bulk',
        currentTargetKcal: 3000,
        estimatedTdeeKcal: 3000,
        weightChangeKgPerWeek: 0.3,
        confidence: 0.8,
        daysAnalysed: 21,
      },
    });
  });

  it('survives a round trip through JSON, because that is where it is stored', () => {
    const result = reviewWeek(week());
    expect(JSON.parse(JSON.stringify(result.computed))).toEqual(result.computed);
  });

  it('records nulls rather than inventing numbers when data is missing', () => {
    const result = reviewWeek(week({ calorie: null, deload: null, muscles: [] }));

    expect(result.computed.nutrition).toBeNull();
    expect(result.computed).toMatchObject({
      training: { muscles: [], weeksInBlock: null, stalledWeeks: null },
    });
  });
});
