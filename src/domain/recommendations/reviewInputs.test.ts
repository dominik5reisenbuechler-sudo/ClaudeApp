import { describe, expect, it } from 'vitest';

import { assessRecovery } from './recovery';
import {
  buildMuscleReviews,
  jointDiscomfortStreak,
  rpeRise,
  stallStreakWeeks,
  weeksBetween,
} from './reviewInputs';
import type { JointDiscomfortWeek, SessionRpe } from './reviewInputs';
import type { StrengthSet } from '../progress/strengthProgress';
import type { ContributionMap, MuscleVolumeSummary } from '../training/volume';
import { addDays } from '@/utils/date';
import type { MuscleId } from '@/types/domain';

const WEEK_END = '2025-06-22';

const RECOVERY = assessRecovery({
  trainingPerformance: 4,
  sleepQuality: 4,
  energy: 4,
  stress: 2,
  jointDiscomfort: 0,
});

function summary(muscleId: MuscleId, over: Partial<MuscleVolumeSummary> = {}): MuscleVolumeSummary {
  return {
    muscleId,
    sets: 12,
    minSets: 8,
    maxSets: 14,
    status: 'in_range',
    frequency: 2,
    ...over,
  };
}

const contributions: ContributionMap = new Map([
  ['bench-press', [{ muscleId: 'chest' as MuscleId, setCredit: 1 }, { muscleId: 'triceps' as MuscleId, setCredit: 0.3 }]],
  ['squat', [{ muscleId: 'quads' as MuscleId, setCredit: 1 }]],
]);

/** Sessions on a lift, `weeks` of them, the 1RM moving by `deltaPerWeek`. */
function progressingSets(exerciseId: string, weeks: number, deltaPerWeek: number): StrengthSet[] {
  return Array.from({ length: weeks }, (_, index) => ({
    exerciseId,
    weightKg: 100 + index * deltaPerWeek,
    reps: 5,
    setType: 'working' as const,
    isCompleted: true,
    performedOn: addDays(WEEK_END, -7 * (weeks - 1 - index)),
  }));
}

describe('buildMuscleReviews', () => {
  it('skips muscles with no measurable strength trend', () => {
    const reviews = buildMuscleReviews({
      volume: [summary('chest'), summary('quads')],
      sets: progressingSets('bench-press', 5, 2.5),
      contributions,
      priorities: {},
      recovery: RECOVERY,
      adherenceRatio: 1,
    });

    expect(reviews.map((review) => review.muscleId)).toEqual(['chest']);
  });

  it('returns nothing at all in a first week of training', () => {
    const reviews = buildMuscleReviews({
      volume: [summary('chest'), summary('quads')],
      sets: progressingSets('bench-press', 1, 0),
      contributions,
      priorities: {},
      recovery: RECOVERY,
      adherenceRatio: 1,
    });

    expect(reviews).toEqual([]);
  });

  it('ignores lifts that only credit a muscle incidentally', () => {
    // Bench gives triceps 0.3 credit — below the evidence threshold, so bench
    // progress says nothing about whether triceps volume is right.
    const reviews = buildMuscleReviews({
      volume: [summary('triceps')],
      sets: progressingSets('bench-press', 5, 2.5),
      contributions,
      priorities: {},
      recovery: RECOVERY,
      adherenceRatio: 1,
    });

    expect(reviews).toEqual([]);
  });

  it('reads a rising trend as progress', () => {
    const reviews = buildMuscleReviews({
      volume: [summary('chest')],
      sets: progressingSets('bench-press', 5, 2.5),
      contributions,
      priorities: {},
      recovery: RECOVERY,
      adherenceRatio: 1,
    });

    expect(reviews[0]?.isProgressing).toBe(true);
  });

  it('reads a flat trend as a stall', () => {
    const reviews = buildMuscleReviews({
      volume: [summary('chest')],
      sets: progressingSets('bench-press', 5, 0),
      contributions,
      priorities: {},
      recovery: RECOVERY,
      adherenceRatio: 1,
    });

    expect(reviews[0]?.isProgressing).toBe(false);
  });

  it('carries the volume band and frequency through untouched', () => {
    const reviews = buildMuscleReviews({
      volume: [summary('chest', { sets: 15.5, minSets: 10, maxSets: 18, frequency: 3 })],
      sets: progressingSets('bench-press', 5, 2.5),
      contributions,
      priorities: { chest: 3 },
      recovery: RECOVERY,
      adherenceRatio: 0.75,
    });

    expect(reviews[0]).toMatchObject({
      currentSets: 15.5,
      targetMinSets: 10,
      targetMaxSets: 18,
      frequency: 3,
      isPriority: true,
      adherenceRatio: 0.75,
    });
  });

  it('treats only the top priority level as a priority', () => {
    const reviews = buildMuscleReviews({
      volume: [summary('chest')],
      sets: progressingSets('bench-press', 5, 2.5),
      contributions,
      priorities: { chest: 2 },
      recovery: RECOVERY,
      adherenceRatio: 1,
    });

    expect(reviews[0]?.isPriority).toBe(false);
  });
});

describe('stallStreakWeeks', () => {
  it('is zero while lifts are still climbing', () => {
    expect(stallStreakWeeks(progressingSets('bench-press', 6, 2.5), WEEK_END)).toBe(0);
  });

  it('counts the trailing weeks without a new best', () => {
    // Climbs to 107.5 three weeks ago, then repeats it for the last three.
    const weekly = (weeksAgo: number, weightKg: number): StrengthSet => ({
      exerciseId: 'bench-press',
      weightKg,
      reps: 5,
      setType: 'working',
      isCompleted: true,
      performedOn: addDays(WEEK_END, -7 * weeksAgo),
    });

    const sets = [
      weekly(6, 100),
      weekly(5, 102.5),
      weekly(4, 105),
      weekly(3, 107.5),
      weekly(2, 107.5),
      weekly(1, 107.5),
      weekly(0, 107.5),
    ];

    expect(stallStreakWeeks(sets, WEEK_END)).toBe(3);
  });

  it('does not call a peak from months ago progress', () => {
    const sets = [
      {
        exerciseId: 'bench-press',
        weightKg: 120,
        reps: 5,
        setType: 'working' as const,
        isCompleted: true,
        performedOn: addDays(WEEK_END, -7 * 5),
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        exerciseId: 'bench-press',
        weightKg: 110,
        reps: 5,
        setType: 'working' as const,
        isCompleted: true,
        performedOn: addDays(WEEK_END, -7 * (2 - index)),
      })),
    ];

    expect(stallStreakWeeks(sets, WEEK_END)).toBe(3);
  });

  it('is zero when nothing was trained — that is adherence, not a stall', () => {
    expect(stallStreakWeeks([], WEEK_END)).toBe(0);
  });

  it('stops counting at a week with no training rather than counting it', () => {
    const sets = [
      ...progressingSets('bench-press', 3, 2.5),
      // Nothing in the most recent week.
    ].map((set) => ({ ...set, performedOn: addDays(set.performedOn, -7) }));

    expect(stallStreakWeeks(sets, WEEK_END)).toBe(0);
  });
});

describe('rpeRise', () => {
  const session = (daysAgo: number, rpe: number | null): SessionRpe => ({
    date: addDays(WEEK_END, -daysAgo),
    rpe,
  });

  it('reports how much harder the recent week felt', () => {
    const sessions = [
      session(1, 9),
      session(3, 9),
      session(10, 7),
      session(14, 7),
      session(21, 7),
    ];

    expect(rpeRise(sessions, WEEK_END)).toBe(2);
  });

  it('returns null without enough sessions on either side', () => {
    expect(rpeRise([session(1, 9), session(10, 7)], WEEK_END)).toBeNull();
  });

  it('ignores sessions where RPE was not reported', () => {
    const sessions = [
      session(1, 8),
      session(2, null),
      session(3, 8),
      session(10, 8),
      session(12, 8),
    ];

    expect(rpeRise(sessions, WEEK_END)).toBe(0);
  });
});

describe('jointDiscomfortStreak', () => {
  const week = (weeksAgo: number, value: number | null): JointDiscomfortWeek => ({
    weekStartDate: addDays(WEEK_END, -7 * weeksAgo),
    jointDiscomfort: value,
  });

  it('counts consecutive weeks of meaningful discomfort', () => {
    expect(jointDiscomfortStreak([week(0, 3), week(1, 4), week(2, 1)])).toBe(2);
  });

  it('stops at a week below the threshold', () => {
    expect(jointDiscomfortStreak([week(0, 2), week(1, 4)])).toBe(0);
  });

  it('stops at a skipped answer rather than assuming the worst', () => {
    expect(jointDiscomfortStreak([week(0, null), week(1, 4), week(2, 4)])).toBe(0);
  });

  it('reads the weeks newest-first however they arrive', () => {
    expect(jointDiscomfortStreak([week(2, 1), week(1, 4), week(0, 3)])).toBe(2);
  });
});

describe('weeksBetween', () => {
  it('floors to whole weeks', () => {
    expect(weeksBetween('2025-06-01', '2025-06-21')).toBe(2);
  });

  it('never goes negative', () => {
    expect(weeksBetween('2025-06-21', '2025-06-01')).toBe(0);
  });
});
