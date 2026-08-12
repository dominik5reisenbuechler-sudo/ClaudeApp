import { describe, expect, it } from 'vitest';

import { assessRecovery, UNKNOWN_RECOVERY } from './recovery';
import type { RecoveryAssessment } from './recovery';
import {
  deloadRecommendation,
  volumeAdjustment,
  BLOCK_LENGTH_FATIGUE_WEEKS,
  DELOAD_SIGNALS_REQUIRED,
  DELOAD_VOLUME_PERCENT,
  MIN_SESSIONS_PER_MUSCLE_PER_WEEK,
  MIN_WEEKS_BETWEEN_DELOADS,
  VOLUME_CEILING_SETS,
  VOLUME_STEP_SETS,
} from './trainingAdjustment';
import type { DeloadInput, VolumeAdjustmentInput } from './trainingAdjustment';

const GOOD: RecoveryAssessment = assessRecovery({
  trainingPerformance: 5,
  sleepQuality: 5,
  energy: 4,
  stress: 2,
  jointDiscomfort: 0,
});

const NEUTRAL: RecoveryAssessment = assessRecovery({
  trainingPerformance: 3,
  sleepQuality: 3,
  energy: 3,
  stress: 3,
  jointDiscomfort: 2,
});

const POOR: RecoveryAssessment = assessRecovery({
  trainingPerformance: 2,
  sleepQuality: 1,
  energy: 1,
  stress: 5,
  jointDiscomfort: 3,
});

/** A muscle trained twice a week, in range, by someone who showed up. */
function volumeInput(over: Partial<VolumeAdjustmentInput> = {}): VolumeAdjustmentInput {
  return {
    muscleId: 'chest',
    currentSets: 12,
    targetMinSets: 8,
    targetMaxSets: 14,
    frequency: 2,
    isProgressing: true,
    isPriority: false,
    recovery: NEUTRAL,
    adherenceRatio: 1,
    ...over,
  };
}

describe('volumeAdjustment — adherence comes before programming', () => {
  it('refuses to change a programme that was not followed', () => {
    const result = volumeAdjustment(
      volumeInput({ adherenceRatio: 0.5, isProgressing: false, recovery: GOOD }),
    );

    expect(result.type).toBe('adherence');
    expect(result.suggestedValue).toEqual({});
    expect(result.reason).toContain('50%');
  });

  it('proceeds at the adherence threshold', () => {
    const result = volumeAdjustment(volumeInput({ adherenceRatio: 0.8 }));
    expect(result.type).not.toBe('adherence');
  });
});

describe('volumeAdjustment — when it is working', () => {
  it('leaves progressing volume alone', () => {
    const result = volumeAdjustment(volumeInput({ isProgressing: true }));

    expect(result.type).toBe('no_change');
    expect(result.reason).toContain('still progressing');
    expect(result.reason).toContain('12 hard sets');
  });

  it('adds sets only for a priority muscle that is progressing and recovering well', () => {
    const result = volumeAdjustment(
      volumeInput({ isProgressing: true, isPriority: true, recovery: GOOD }),
    );

    expect(result.type).toBe('volume_adjustment');
    expect(result.suggestedValue).toEqual({ muscleId: 'chest', weeklySets: 14 });
    expect(result.reason).toContain('priority');
  });

  it('does not add sets to a priority muscle when recovery is only neutral', () => {
    const result = volumeAdjustment(
      volumeInput({ isProgressing: true, isPriority: true, recovery: NEUTRAL }),
    );

    expect(result.type).toBe('no_change');
  });

  it('will not push a progressing priority muscle past the ceiling', () => {
    const result = volumeAdjustment(
      volumeInput({
        currentSets: VOLUME_CEILING_SETS,
        targetMaxSets: 20,
        isProgressing: true,
        isPriority: true,
        recovery: GOOD,
      }),
    );

    expect(result.type).toBe('no_change');
  });
});

describe('volumeAdjustment — a stall is not automatically a volume problem', () => {
  it('spreads the work before adding to it', () => {
    const result = volumeAdjustment(
      volumeInput({ isProgressing: false, frequency: 1, recovery: GOOD }),
    );

    expect(result.type).toBe('volume_adjustment');
    expect(result.suggestedValue).toEqual({
      muscleId: 'chest',
      weeklySets: 12,
      sessionsPerWeek: MIN_SESSIONS_PER_MUSCLE_PER_WEEK,
    });
    // Same total work, spread differently — this is not a volume increase.
    expect(result.reason).toContain('a single session');
  });

  it('cuts volume when a stall comes with poor recovery', () => {
    const result = volumeAdjustment(
      volumeInput({ currentSets: 16, isProgressing: false, recovery: POOR }),
    );

    expect(result.type).toBe('volume_adjustment');
    expect(result.suggestedValue).toEqual({ muscleId: 'chest', weeklySets: 14 });
    expect(result.reason).toContain('sleep');
  });

  it('will not cut below the bottom of the range', () => {
    const result = volumeAdjustment(
      volumeInput({ currentSets: 8, targetMinSets: 8, isProgressing: false, recovery: POOR }),
    );

    expect(result.type).toBe('no_change');
    expect(result.reason).toMatch(/sleep, stress and food/i);
  });

  it('says it cannot tell without the check-in', () => {
    const result = volumeAdjustment(
      volumeInput({ isProgressing: false, recovery: UNKNOWN_RECOVERY }),
    );

    expect(result.type).toBe('no_change');
    expect(result.reason).toContain('check-in');
  });

  it('adds sets only once the cheaper explanations are ruled out', () => {
    const result = volumeAdjustment(
      volumeInput({ currentSets: 12, isProgressing: false, recovery: GOOD, frequency: 3 }),
    );

    expect(result.type).toBe('volume_adjustment');
    expect(result.suggestedValue).toEqual({ muscleId: 'chest', weeklySets: 12 + VOLUME_STEP_SETS });
    expect(result.reason).toContain('3 sessions');
    expect(result.reason).toContain('100%');
  });

  it('points at execution rather than more sets at the ceiling', () => {
    const result = volumeAdjustment(
      volumeInput({
        currentSets: VOLUME_CEILING_SETS,
        targetMaxSets: 20,
        isProgressing: false,
        recovery: GOOD,
      }),
    );

    expect(result.type).toBe('no_change');
    expect(result.reason).toMatch(/exercise choice/i);
    expect(result.evidenceRuleIds).toContain('volume.weekly_sets.ceiling');
  });

  it('rounds fractional set credits before advising a whole number', () => {
    const result = volumeAdjustment(
      volumeInput({ currentSets: 11.4, isProgressing: false, recovery: GOOD }),
    );

    expect(result.suggestedValue).toEqual({ muscleId: 'chest', weeklySets: 13 });
  });

  it('names the muscle it is talking about', () => {
    const result = volumeAdjustment(volumeInput({ muscleId: 'rear_delts' }));
    expect(result.reason).toContain('rear delts');
  });
});

function deloadInput(over: Partial<DeloadInput> = {}): DeloadInput {
  return {
    stalledWeeks: 0,
    rpeRise: null,
    jointDiscomfortWeeks: 0,
    recovery: NEUTRAL,
    weeksInBlock: 4,
    weeksSinceLastDeload: null,
    ...over,
  };
}

describe('deloadRecommendation — evidence, not a calendar', () => {
  it('proposes nothing when nothing is wrong', () => {
    const result = deloadRecommendation(deloadInput());

    expect(result.type).toBe('no_change');
    expect(result.reason).toContain('4 weeks into this block');
    expect(result.reason).toMatch(/on evidence, not on a calendar/i);
  });

  it('will not give up a training week for a single signal', () => {
    const result = deloadRecommendation(deloadInput({ stalledWeeks: 2 }));

    expect(result.type).toBe('no_change');
    expect(result.reason).toContain('2 weeks without progress');
    expect(result.reason).toContain(`${DELOAD_SIGNALS_REQUIRED} independent signals`);
  });

  it('proposes a deload once two independent signals line up', () => {
    const result = deloadRecommendation(deloadInput({ stalledWeeks: 3, recovery: POOR }));

    expect(result.type).toBe('deload');
    expect(result.suggestedValue).toEqual({
      volumePercent: DELOAD_VOLUME_PERCENT,
      weeks: 1,
      maintainLoad: true,
    });
    expect(result.reason).toContain('3 weeks without progress');
    expect(result.reason).toContain('low recovery scores');
    expect(result.evidenceRuleIds).toContain('training.deload.stalled_weeks');
    expect(result.evidenceRuleIds).toContain('training.deload.recovery');
  });

  it('counts a rising RPE at the same load as a signal, and quotes it', () => {
    const result = deloadRecommendation(deloadInput({ stalledWeeks: 2, rpeRise: 1.2 }));

    expect(result.type).toBe('deload');
    expect(result.reason).toContain('1.2 RPE harder');
  });

  it('ignores an RPE rise that is within noise', () => {
    const result = deloadRecommendation(deloadInput({ stalledWeeks: 2, rpeRise: 0.4 }));
    expect(result.type).toBe('no_change');
  });

  it('counts a long block as accumulated fatigue', () => {
    const result = deloadRecommendation(
      deloadInput({ stalledWeeks: 2, weeksInBlock: BLOCK_LENGTH_FATIGUE_WEEKS + 2 }),
    );

    expect(result.type).toBe('deload');
    expect(result.reason).toContain('10 straight weeks');
  });

  it('acts on sustained joint discomfort by itself', () => {
    const result = deloadRecommendation(deloadInput({ jointDiscomfortWeeks: 2 }));

    expect(result.type).toBe('deload');
    expect(result.reason).toContain('2 weeks running');
    expect(result.reason).toMatch(/see someone qualified/i);
  });

  it('treats one week of joint discomfort as one signal, not a verdict', () => {
    const result = deloadRecommendation(deloadInput({ jointDiscomfortWeeks: 1 }));
    expect(result.type).toBe('no_change');
  });

  it('refuses to deload again too soon, however bad the week looks', () => {
    const result = deloadRecommendation(
      deloadInput({
        stalledWeeks: 4,
        recovery: POOR,
        jointDiscomfortWeeks: 2,
        weeksSinceLastDeload: 2,
      }),
    );

    expect(result.type).toBe('no_change');
    expect(result.reason).toContain('2 weeks ago');
    expect(result.reason).toContain(`${MIN_WEEKS_BETWEEN_DELOADS} weeks between deloads`);
  });

  it('allows one once the interval has passed', () => {
    const result = deloadRecommendation(
      deloadInput({
        stalledWeeks: 4,
        recovery: POOR,
        weeksSinceLastDeload: MIN_WEEKS_BETWEEN_DELOADS,
      }),
    );

    expect(result.type).toBe('deload');
  });

  it('is less confident when it never saw the check-in', () => {
    const withAnswers = deloadRecommendation(
      deloadInput({ stalledWeeks: 3, weeksInBlock: 10, recovery: NEUTRAL }),
    );
    const without = deloadRecommendation(
      deloadInput({ stalledWeeks: 3, weeksInBlock: 10, recovery: UNKNOWN_RECOVERY }),
    );

    expect(withAnswers.type).toBe('deload');
    expect(without.type).toBe('deload');
    expect(without.confidence).toBeLessThan(withAnswers.confidence);
  });

  it('grows more confident as signals accumulate', () => {
    const two = deloadRecommendation(deloadInput({ stalledWeeks: 2, recovery: POOR }));
    const four = deloadRecommendation(
      deloadInput({ stalledWeeks: 2, recovery: POOR, rpeRise: 1.5, weeksInBlock: 12 }),
    );

    expect(four.confidence).toBeGreaterThan(two.confidence);
  });
});

describe('training recommendations — the explainability contract', () => {
  it('gives every outcome a substantial reason and at least one rule', () => {
    const volumeCases: VolumeAdjustmentInput[] = [
      volumeInput({ adherenceRatio: 0.4 }),
      volumeInput({ isProgressing: true, isPriority: true, recovery: GOOD }),
      volumeInput({ isProgressing: true }),
      volumeInput({ isProgressing: false, frequency: 1 }),
      volumeInput({ isProgressing: false, recovery: POOR, currentSets: 16 }),
      volumeInput({ isProgressing: false, recovery: POOR, currentSets: 8, targetMinSets: 8 }),
      volumeInput({ isProgressing: false, recovery: UNKNOWN_RECOVERY }),
      volumeInput({ isProgressing: false, recovery: GOOD }),
      volumeInput({ isProgressing: false, recovery: GOOD, currentSets: 20 }),
    ];

    const deloadCases: DeloadInput[] = [
      deloadInput(),
      deloadInput({ stalledWeeks: 2 }),
      deloadInput({ stalledWeeks: 3, recovery: POOR }),
      deloadInput({ jointDiscomfortWeeks: 2 }),
      deloadInput({ stalledWeeks: 4, weeksSinceLastDeload: 1 }),
    ];

    const results = [
      ...volumeCases.map(volumeAdjustment),
      ...deloadCases.map(deloadRecommendation),
    ];

    for (const result of results) {
      // `recommendations.reason` carries a `length(trim(reason)) >= 20` check.
      expect(result.reason.trim().length).toBeGreaterThanOrEqual(20);
      expect(result.evidenceRuleIds.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.reason).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});
