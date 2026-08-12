/**
 * Volume and deload recommendations.
 *
 * The single most important rule here is from SCIENTIFIC_RULES.md §4.1: **a
 * stall is not automatically a volume problem.** It is at least as often
 * adherence, frequency, recovery, execution or energy availability. An engine
 * that answers every plateau with "+2 sets" walks the user straight into more
 * fatigue than they can recover from, and it does so confidently.
 *
 * So the checks run cheapest-and-most-likely first — did they actually train?
 * is the work spread across the week? is recovery holding? — and only reach for
 * more sets when nothing else explains the stall.
 *
 * Deloads are proposed on evidence, never on a calendar (§4.6).
 */

import { describeConcerns } from './recovery';
import type { RecoveryAssessment } from './recovery';
import type { Recommendation } from './types';
import { MUSCLE_LABELS } from '../training/muscles';
import { clamp } from '@/utils/number';
import type { MuscleId } from '@/types/domain';

/** Sets added or removed in one step. Small changes, judged before the next. */
export const VOLUME_STEP_SETS = 2;

/** Above this, added sets buy fatigue rather than growth (§4.1, limited evidence). */
export const VOLUME_CEILING_SETS = 20;

/** Sessions per muscle per week below which spreading beats adding (§4.1). */
export const MIN_SESSIONS_PER_MUSCLE_PER_WEEK = 2;

/** Fraction of planned sessions that must be completed before volume moves. */
export const MIN_ADHERENCE_FOR_VOLUME_CHANGE = 0.8;

export interface VolumeAdjustmentInput {
  muscleId: MuscleId;
  /** Hard sets performed in the review week, fractional credits included. */
  currentSets: number;
  targetMinSets: number;
  targetMaxSets: number;
  /** Distinct days this muscle was trained in the week. */
  frequency: number;
  /** Whether the lifts for this muscle moved forward over the review period. */
  isProgressing: boolean;
  /** The user marked this muscle as a priority. */
  isPriority: boolean;
  recovery: RecoveryAssessment;
  /** Completed sessions ÷ planned sessions over the review period, 0–1. */
  adherenceRatio: number;
}

export function volumeAdjustment(input: VolumeAdjustmentInput): Recommendation {
  const muscle = MUSCLE_LABELS[input.muscleId];
  const currentValue = {
    muscleId: input.muscleId,
    weeklySets: input.currentSets,
    sessionsPerWeek: input.frequency,
  };
  const confidence = volumeConfidence(input);

  // --- Did they train the plan at all? -----------------------------------

  if (input.adherenceRatio < MIN_ADHERENCE_FOR_VOLUME_CHANGE) {
    return {
      type: 'adherence',
      currentValue,
      suggestedValue: {},
      reason: `You completed ${Math.round(input.adherenceRatio * 100)}% of your planned sessions this period. Changing the programme now would be solving the wrong problem — the ${muscle} volume on paper was never the volume you trained. Let us get a full week in first.`,
      confidence,
      evidenceRuleIds: ['volume.weekly_sets.start'],
    };
  }

  // --- Is it working? ----------------------------------------------------

  if (input.isProgressing) {
    if (input.isPriority && input.recovery.band === 'good' && input.currentSets < VOLUME_CEILING_SETS) {
      const suggested = nextVolume(input.currentSets, VOLUME_STEP_SETS);
      return {
        type: 'volume_adjustment',
        currentValue,
        suggestedValue: { muscleId: input.muscleId, weeklySets: suggested },
        reason: `Your ${muscle} lifts progressed on ${formatSets(input.currentSets)} hard sets a week and your recovery answers came back strong (${formatScore(input.recovery)}). You marked ${muscle} as a priority, so we are adding ${VOLUME_STEP_SETS} sets to ${formatSets(suggested)}. If performance or recovery dips next week we will take them back off.`,
        confidence,
        evidenceRuleIds: ['volume.weekly_sets.start', 'volume.weekly_sets.ceiling'],
      };
    }

    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason: `Your ${muscle} lifts are still progressing on ${formatSets(input.currentSets)} hard sets a week. The cheapest volume is the volume you do not have to do — we are leaving this where it is while it is still working.`,
      confidence,
      evidenceRuleIds: ['volume.weekly_sets.start'],
    };
  }

  // --- Stalled. Cheaper explanations before more sets. --------------------

  if (input.frequency < MIN_SESSIONS_PER_MUSCLE_PER_WEEK && input.currentSets > 0) {
    return {
      type: 'volume_adjustment',
      currentValue,
      suggestedValue: {
        muscleId: input.muscleId,
        weeklySets: input.currentSets,
        sessionsPerWeek: MIN_SESSIONS_PER_MUSCLE_PER_WEEK,
      },
      reason: `Your ${muscle} volume has stalled at ${formatSets(input.currentSets)} sets a week, but all of it lands in ${input.frequency === 1 ? 'a single session' : `${input.frequency} sessions`}. Before adding sets, split the same work across ${MIN_SESSIONS_PER_MUSCLE_PER_WEEK} sessions — the later sets in a long session are done tired, and the same total done fresher is worth more.`,
      confidence,
      evidenceRuleIds: ['volume.frequency'],
    };
  }

  if (input.recovery.band === 'poor') {
    const floor = input.targetMinSets;
    const concerns = describeConcerns(input.recovery);
    const detail = concerns ? ` You flagged ${concerns}.` : '';

    if (input.currentSets <= floor) {
      return {
        type: 'no_change',
        currentValue,
        suggestedValue: {},
        reason: `Your ${muscle} work has stalled and your recovery answers are low (${formatScore(input.recovery)}).${detail} You are already at the bottom of the recommended range at ${formatSets(input.currentSets)} sets, so cutting further is not the answer — sleep, stress and food are where this gets fixed.`,
        confidence,
        evidenceRuleIds: ['volume.weekly_sets.start'],
      };
    }

    const suggested = nextVolume(input.currentSets, -VOLUME_STEP_SETS, floor);
    return {
      type: 'volume_adjustment',
      currentValue,
      suggestedValue: { muscleId: input.muscleId, weeklySets: suggested },
      reason: `Your ${muscle} lifts have stalled while your recovery answers are low (${formatScore(input.recovery)}).${detail} More sets on top of that would dig the hole deeper, so we are cutting from ${formatSets(input.currentSets)} to ${formatSets(suggested)} and letting you catch up.`,
      confidence,
      evidenceRuleIds: ['volume.weekly_sets.start'],
    };
  }

  if (input.recovery.band === 'unknown') {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason: `Your ${muscle} lifts have stalled at ${formatSets(input.currentSets)} sets a week, but without your check-in answers we cannot tell whether that is a volume problem or a recovery one — and those need opposite responses. Fill in next week's check-in and we will make the call then.`,
      confidence,
      evidenceRuleIds: ['volume.weekly_sets.start'],
    };
  }

  // Stalled, training as planned, spread across the week, recovering fine.
  if (input.currentSets >= VOLUME_CEILING_SETS) {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason: `Your ${muscle} lifts have stalled at ${formatSets(input.currentSets)} sets a week, which is at the ceiling where more sets stop paying for themselves. The lever now is execution and exercise choice, not volume — try a different movement for this muscle, or work on getting closer to failure with clean technique.`,
      confidence,
      evidenceRuleIds: ['volume.weekly_sets.ceiling', 'intensity.rir.working_sets'],
    };
  }

  const suggested = nextVolume(input.currentSets, VOLUME_STEP_SETS);
  return {
    type: 'volume_adjustment',
    currentValue,
    suggestedValue: { muscleId: input.muscleId, weeklySets: suggested },
    reason: `Your ${muscle} lifts have stalled at ${formatSets(input.currentSets)} sets a week, spread over ${input.frequency} sessions, while you completed ${Math.round(input.adherenceRatio * 100)}% of your sessions and recovery held up (${formatScore(input.recovery)}). With the cheaper explanations ruled out, we are adding ${VOLUME_STEP_SETS} sets to ${formatSets(suggested)}.`,
    confidence,
    evidenceRuleIds: ['volume.weekly_sets.start', 'volume.weekly_sets.ceiling'],
  };
}

/**
 * Confidence in a volume call: it rests on how much of the check-in was
 * answered, since recovery is what separates "add sets" from "cut sets".
 */
function volumeConfidence(input: VolumeAdjustmentInput): number {
  const answers = clamp(input.recovery.answeredCount / 4, 0, 1);
  const adherence = clamp(input.adherenceRatio, 0, 1);
  return Math.round(clamp(0.3 + 0.4 * answers + 0.3 * adherence, 0, 1) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Deload
// ---------------------------------------------------------------------------

/** A deload proposed every third week is a training programme with no training. */
export const MIN_WEEKS_BETWEEN_DELOADS = 4;

/** Weeks of uninterrupted hard training after which accumulated fatigue is likely. */
export const BLOCK_LENGTH_FATIGUE_WEEKS = 8;

/** Consecutive stalled weeks that count as a fatigue signal. */
export const STALL_WEEKS_FOR_DELOAD = 2;

/** Rise in mean session RPE at comparable load that counts as a signal. */
export const RPE_RISE_FOR_DELOAD = 1;

/** Joint discomfort at or above this, sustained, counts on its own. */
export const JOINT_DISCOMFORT_PERSISTENT = 3;

/** Independent signals needed before a deload is proposed. */
export const DELOAD_SIGNALS_REQUIRED = 2;

/** Proportion of normal volume during the deload week. Load is maintained. */
export const DELOAD_VOLUME_PERCENT = 50;

export interface DeloadInput {
  /** Consecutive weeks in which nothing progressed. */
  stalledWeeks: number;
  /**
   * Change in mean session RPE at comparable load against the preceding weeks.
   * Null when there is not enough history to compare.
   */
  rpeRise: number | null;
  /** Consecutive weeks joint discomfort was reported at 3 or above. */
  jointDiscomfortWeeks: number;
  recovery: RecoveryAssessment;
  /** Weeks of hard training since the last deload or the block's start. */
  weeksInBlock: number;
  /** Null when the user has never deloaded. */
  weeksSinceLastDeload: number | null;
}

interface DeloadSignal {
  ruleId: string;
  description: string;
}

export function deloadRecommendation(input: DeloadInput): Recommendation {
  const currentValue = { weeksInBlock: input.weeksInBlock, volumePercent: 100 };
  const signals = collectDeloadSignals(input);

  // A deload too soon after the last one is not fatigue management, it is a
  // programme that never accumulates anything worth recovering from.
  if (
    input.weeksSinceLastDeload !== null &&
    input.weeksSinceLastDeload < MIN_WEEKS_BETWEEN_DELOADS
  ) {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason: `You deloaded ${input.weeksSinceLastDeload} ${input.weeksSinceLastDeload === 1 ? 'week' : 'weeks'} ago. Even with ${signals.length === 0 ? 'nothing' : describeSignals(signals)} showing, we wait at least ${MIN_WEEKS_BETWEEN_DELOADS} weeks between deloads — otherwise there is never enough accumulated work to recover from.`,
      confidence: 0.6,
      evidenceRuleIds: ['training.deload.evidence_based'],
    };
  }

  // Sustained joint discomfort is decisive on its own: it is the one signal
  // where waiting for a second opinion risks an injury rather than a bad week.
  const persistentJoints = input.jointDiscomfortWeeks >= 2;

  if (signals.length < DELOAD_SIGNALS_REQUIRED && !persistentJoints) {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason:
        signals.length === 0
          ? `Nothing in this week's data points to accumulated fatigue: you are ${input.weeksInBlock} weeks into this block and performance, recovery and joints are all holding. Deloads are proposed on evidence, not on a calendar, so keep training.`
          : `We can see ${describeSignals(signals)}, which on its own is as likely to be a single rough week as it is accumulated fatigue. We propose a deload when at least ${DELOAD_SIGNALS_REQUIRED} independent signals line up — one is not enough to give up a training week for.`,
      confidence: 0.5,
      evidenceRuleIds: ['training.deload.evidence_based'],
    };
  }

  const listed = describeSignals(signals);
  const reason = persistentJoints && signals.length < DELOAD_SIGNALS_REQUIRED
    ? `You have reported meaningful joint discomfort for ${input.jointDiscomfortWeeks} weeks running. That is the one signal we act on by itself — take a week at ${DELOAD_VOLUME_PERCENT}% of your normal volume with the loads unchanged, and if the discomfort is still there afterwards, see someone qualified rather than training through it.`
    : `Three weeks of good training beats four weeks of digging a hole. We can see ${listed} after ${input.weeksInBlock} weeks in this block. Take one week at ${DELOAD_VOLUME_PERCENT}% of your normal set count with the loads unchanged — you keep the skill and the stimulus to hold what you have built, and shed the fatigue that is hiding your progress.`;

  return {
    type: 'deload',
    currentValue,
    suggestedValue: {
      volumePercent: DELOAD_VOLUME_PERCENT,
      weeks: 1,
      maintainLoad: true,
    },
    reason,
    confidence: deloadConfidence(signals.length, input.recovery),
    evidenceRuleIds: [
      'training.deload.evidence_based',
      ...signals.map((signal) => signal.ruleId),
    ],
  };
}

function collectDeloadSignals(input: DeloadInput): DeloadSignal[] {
  const signals: DeloadSignal[] = [];

  if (input.stalledWeeks >= STALL_WEEKS_FOR_DELOAD) {
    signals.push({
      ruleId: 'training.deload.stalled_weeks',
      description: `${input.stalledWeeks} weeks without progress`,
    });
  }

  if (input.rpeRise !== null && input.rpeRise >= RPE_RISE_FOR_DELOAD) {
    signals.push({
      ruleId: 'training.deload.rpe_rise',
      description: `the same loads feeling ${round1(input.rpeRise)} RPE harder than they did`,
    });
  }

  if (input.jointDiscomfortWeeks >= 1) {
    signals.push({
      ruleId: 'training.deload.joint_discomfort',
      description: `joint discomfort reported ${input.jointDiscomfortWeeks === 1 ? 'this week' : `for ${input.jointDiscomfortWeeks} weeks running`}`,
    });
  }

  if (input.recovery.band === 'poor') {
    const concerns = describeConcerns(input.recovery);
    signals.push({
      ruleId: 'training.deload.recovery',
      description: concerns
        ? `low recovery scores, particularly ${concerns}`
        : 'low recovery scores',
    });
  }

  if (input.weeksInBlock >= BLOCK_LENGTH_FATIGUE_WEEKS) {
    signals.push({
      ruleId: 'training.deload.block_length',
      description: `${input.weeksInBlock} straight weeks of hard training`,
    });
  }

  return signals;
}

/**
 * More independent signals means more confidence — but a deload proposed
 * without any check-in answers is reading half the evidence, and says so.
 */
function deloadConfidence(signalCount: number, recovery: RecoveryAssessment): number {
  const fromSignals = clamp(0.4 + 0.15 * signalCount, 0, 0.9);
  const penalty = recovery.band === 'unknown' ? 0.15 : 0;
  return Math.round(clamp(fromSignals - penalty, 0, 1) * 100) / 100;
}

function describeSignals(signals: readonly DeloadSignal[]): string {
  const parts = signals.map((signal) => signal.description);
  if (parts.length === 0) return 'nothing';
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] as string}`;
}

function nextVolume(current: number, step: number, floor = 0): number {
  // Volume carries fractional credits, so round to whole sets before advising.
  const target = Math.round(current) + step;
  return Math.max(floor, Math.min(target, VOLUME_CEILING_SETS));
}

function formatSets(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Math.round(value * 10) / 10}`;
}

function formatScore(recovery: RecoveryAssessment): string {
  if (recovery.score === null) return 'not answered';
  return `${Math.round(recovery.score * 100)}% across ${recovery.answeredCount} check-in answers`;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
