/**
 * Turning raw logs into the questions the recommendation engines ask.
 *
 * The engines take clean inputs — "is this muscle progressing?", "how many
 * weeks has this stalled?" — and the honest answer to several of those is
 * "we do not know". That matters more here than anywhere else in the engine:
 * a muscle with no strength history is not a stalled muscle, and treating it
 * as one would have the app cutting or adding sets on the strength of nothing.
 *
 * So muscles without evidence are **left out of the review entirely** rather
 * than defaulted, and the streak helpers return 0 when they cannot see enough
 * weeks to count.
 */

import type { RecoveryAssessment } from './recovery';
import type { VolumeAdjustmentInput } from './trainingAdjustment';
import { strengthTrend } from '../progress/strengthProgress';
import type { StrengthSet } from '../progress/strengthProgress';
import { estimatedOneRepMax } from '../training/progression';
import type { ContributionMap, MuscleVolumeSummary } from '../training/volume';
import { addDays, daysBetween } from '@/utils/date';
import type { IsoDate, MuscleId, MusclePriority } from '@/types/domain';

/**
 * Set credit at or above which an exercise counts as evidence about a muscle.
 * A movement giving a muscle a quarter credit is not the lift to judge that
 * muscle's progress by.
 */
export const EVIDENCE_CREDIT_THRESHOLD = 0.5;

/** Priority level at which the user asked for this muscle to be pushed. */
const PRIORITY_THRESHOLD: MusclePriority = 3;

export interface MuscleReviewInput {
  /** This week's volume per muscle, from `summarizeWeeklyVolume`. */
  volume: readonly MuscleVolumeSummary[];
  /** All working sets available, for judging progression. */
  sets: readonly StrengthSet[];
  contributions: ContributionMap;
  priorities: Partial<Record<MuscleId, MusclePriority>>;
  recovery: RecoveryAssessment;
  adherenceRatio: number;
}

/**
 * One review per muscle we can actually say something about.
 *
 * A muscle qualifies when at least one exercise crediting it substantially has
 * a measurable strength trend. Everything else is skipped in silence — an empty
 * review is the correct output for a first week of training.
 */
export function buildMuscleReviews(input: MuscleReviewInput): VolumeAdjustmentInput[] {
  const exercisesByMuscle = new Map<MuscleId, string[]>();
  for (const [exerciseId, credits] of input.contributions) {
    for (const credit of credits) {
      if (credit.setCredit < EVIDENCE_CREDIT_THRESHOLD) continue;
      const list = exercisesByMuscle.get(credit.muscleId) ?? [];
      list.push(exerciseId);
      exercisesByMuscle.set(credit.muscleId, list);
    }
  }

  const trendCache = new Map<string, number | null>();
  const trendFor = (exerciseId: string): number | null => {
    if (!trendCache.has(exerciseId)) {
      trendCache.set(exerciseId, strengthTrend(input.sets, exerciseId).kgPerWeek);
    }
    return trendCache.get(exerciseId) ?? null;
  };

  const reviews: VolumeAdjustmentInput[] = [];

  for (const summary of input.volume) {
    const trends = (exercisesByMuscle.get(summary.muscleId) ?? [])
      .map(trendFor)
      .filter((value): value is number => value !== null);

    // No measurable trend on any lift for this muscle: nothing to review.
    if (trends.length === 0) continue;

    reviews.push({
      muscleId: summary.muscleId,
      currentSets: summary.sets,
      targetMinSets: summary.minSets,
      targetMaxSets: summary.maxSets,
      frequency: summary.frequency,
      // One lift moving forward is enough. Progress rarely arrives on every
      // exercise at once, and demanding it would call almost every week a stall.
      isProgressing: Math.max(...trends) > 0,
      isPriority: (input.priorities[summary.muscleId] ?? 0) >= PRIORITY_THRESHOLD,
      recovery: input.recovery,
      adherenceRatio: input.adherenceRatio,
    });
  }

  return reviews;
}

/**
 * Trailing weeks in which no tracked lift beat its previous best.
 *
 * Compared against every earlier week, not just the one before, so a week that
 * merely matches a peak set two months ago does not read as progress.
 * Returns 0 when there is not enough history to judge.
 */
export function stallStreakWeeks(
  sets: readonly StrengthSet[],
  weekEnd: IsoDate,
  weeksToScan = 8,
): number {
  const bestsByWeek: Map<string, number>[] = [];

  for (let week = weeksToScan - 1; week >= 0; week -= 1) {
    const end = addDays(weekEnd, -7 * week);
    const start = addDays(end, -6);
    const bests = new Map<string, number>();

    for (const set of sets) {
      if (set.performedOn < start || set.performedOn > end) continue;
      if (!set.isCompleted || set.setType === 'warmup') continue;
      const oneRm = estimatedOneRepMax(set.weightKg ?? 0, set.reps ?? 0);
      if (oneRm === null) continue;
      bests.set(set.exerciseId, Math.max(bests.get(set.exerciseId) ?? 0, oneRm));
    }

    bestsByWeek.push(bests);
  }

  // Weeks with no training at all cannot be called stalled — that is an
  // adherence question, and the volume engine already asks it.
  if (bestsByWeek.every((week) => week.size === 0)) return 0;

  let streak = 0;
  for (let index = bestsByWeek.length - 1; index >= 1; index -= 1) {
    const week = bestsByWeek[index] as Map<string, number>;
    if (week.size === 0) break;

    const priorBest = new Map<string, number>();
    for (let earlier = 0; earlier < index; earlier += 1) {
      for (const [exerciseId, value] of bestsByWeek[earlier] as Map<string, number>) {
        priorBest.set(exerciseId, Math.max(priorBest.get(exerciseId) ?? 0, value));
      }
    }

    const progressed = [...week].some(([exerciseId, value]) => {
      const previous = priorBest.get(exerciseId);
      // A lift with no history is new, not progress.
      return previous !== undefined && value > previous;
    });

    if (progressed) break;
    streak += 1;
  }

  return streak;
}

export interface SessionRpe {
  date: IsoDate;
  /** Session RPE as reported, 1–10. */
  rpe: number | null;
}

/**
 * How much harder the same training is feeling: mean session RPE over the last
 * week against the three weeks before it.
 *
 * This is a coarse comparison — it does not verify that the loads were
 * genuinely equivalent, and session RPE is self-reported. It is one signal out
 * of several for exactly that reason, and never decides a deload alone.
 */
export function rpeRise(
  sessions: readonly SessionRpe[],
  weekEnd: IsoDate,
): number | null {
  const recent: number[] = [];
  const baseline: number[] = [];

  for (const session of sessions) {
    if (session.rpe === null) continue;
    const age = daysBetween(session.date, weekEnd);
    if (age < 0) continue;
    if (age < 7) recent.push(session.rpe);
    else if (age < 28) baseline.push(session.rpe);
  }

  // Two sessions either side, minimum. One session is a mood.
  if (recent.length < 2 || baseline.length < 2) return null;

  const mean = (values: number[]): number =>
    values.reduce((total, value) => total + value, 0) / values.length;

  return Math.round((mean(recent) - mean(baseline)) * 10) / 10;
}

export interface JointDiscomfortWeek {
  weekStartDate: IsoDate;
  /** 0–4, or null when the question was skipped. */
  jointDiscomfort: number | null;
}

/** The value at or above which discomfort counts as meaningful. */
export const JOINT_DISCOMFORT_MEANINGFUL = 3;

/**
 * Consecutive most-recent weeks in which meaningful joint discomfort was
 * reported. A skipped answer ends the streak: we do not know, and guessing
 * upward on a signal that can trigger a deload by itself would be wrong.
 */
export function jointDiscomfortStreak(weeks: readonly JointDiscomfortWeek[]): number {
  const ordered = [...weeks].sort((a, b) => (a.weekStartDate < b.weekStartDate ? 1 : -1));

  let streak = 0;
  for (const week of ordered) {
    if (week.jointDiscomfort === null) break;
    if (week.jointDiscomfort < JOINT_DISCOMFORT_MEANINGFUL) break;
    streak += 1;
  }
  return streak;
}

/** Whole weeks between two dates, floored at 0. */
export function weeksBetween(from: IsoDate, to: IsoDate): number {
  return Math.max(0, Math.floor(daysBetween(from, to) / 7));
}
