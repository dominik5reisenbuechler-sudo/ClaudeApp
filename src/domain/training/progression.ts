/**
 * The progression engine.
 *
 * Double progression by default (SCIENTIFIC_RULES.md §4.4): work up the rep
 * range at a fixed load, then add load and drop back to the bottom of the
 * range.
 *
 * The interesting part is not when to progress — it is when to REFUSE to.
 * Adding weight to a lift that hurt, that broke down technically, or that only
 * hit its reps by grinding to failure when 2 RIR was prescribed, is how people
 * get injured and how a "smart" app loses trust. Every block is explicit,
 * named, and explained back to the user.
 */

export type BlockReason =
  | 'rir_undershoot'
  | 'technique_breakdown'
  | 'pain'
  | 'unstable_performance'
  | 'insufficient_data';

export interface LoggedSet {
  weightKg: number | null;
  reps: number | null;
  /** Reps in reserve, as reported. Null when the user did not say. */
  rir: number | null;
  isCompleted: boolean;
  techniqueBreakdown: boolean;
  painReported: boolean;
}

export interface ProgressionInput {
  targetRepMin: number;
  targetRepMax: number;
  targetRir: number;
  loadIncrementKg: number;
  /** Working sets from the most recent session of this exercise. */
  lastSession: readonly LoggedSet[];
  /**
   * Earlier sessions, most recent first. Used only to judge whether performance
   * is trending or bouncing around.
   */
  previousSessions?: readonly (readonly LoggedSet[])[];
}

export type ProgressionAction = 'increase_load' | 'add_reps' | 'hold' | 'reduce_load';

export interface ProgressionRecommendation {
  action: ProgressionAction;
  /** Prescribed load for the next session, when it changes. */
  nextWeightKg: number | null;
  nextRepTarget: { min: number; max: number };
  /** Plain-language explanation, built from what was actually logged. */
  reason: string;
  blockedBy: BlockReason | null;
}

/**
 * How far below the prescribed RIR counts as "missed badly".
 *
 * Reporting 1 RIR when 2 was prescribed is ordinary noise — self-reported RIR
 * is imprecise, especially for novices. Reporting 0 when 2 was prescribed means
 * the set went to failure, and adding load on top of that is the wrong call.
 */
const RIR_UNDERSHOOT_TOLERANCE = 1;

/** Sessions needed before a stability judgement is meaningful. */
const STABILITY_LOOKBACK = 2;

function workingSets(sets: readonly LoggedSet[]): LoggedSet[] {
  return sets.filter((set) => set.isCompleted && (set.reps ?? 0) > 0);
}

/** The load used for the session — the mode of the working sets' weights. */
export function sessionLoad(sets: readonly LoggedSet[]): number | null {
  const weights = workingSets(sets)
    .map((set) => set.weightKg)
    .filter((weight): weight is number => weight !== null);
  if (weights.length === 0) return null;

  const counts = new Map<number, number>();
  for (const weight of weights) counts.set(weight, (counts.get(weight) ?? 0) + 1);

  let best = weights[0] as number;
  let bestCount = 0;
  for (const [weight, count] of counts) {
    // Ties go to the heavier load: that is the load the user was working at.
    if (count > bestCount || (count === bestCount && weight > best)) {
      best = weight;
      bestCount = count;
    }
  }
  return best;
}

export function totalReps(sets: readonly LoggedSet[]): number {
  return workingSets(sets).reduce((total, set) => total + (set.reps ?? 0), 0);
}

/**
 * Performance is unstable when total reps at a comparable load bounce up and
 * down rather than trending. A single good session after two bad ones is not
 * evidence to add load.
 */
export function isPerformanceUnstable(
  lastSession: readonly LoggedSet[],
  previousSessions: readonly (readonly LoggedSet[])[],
): boolean {
  if (previousSessions.length < STABILITY_LOOKBACK) return false;

  const history = [lastSession, ...previousSessions.slice(0, STABILITY_LOOKBACK)];
  const reps = history.map(totalReps);

  const latest = reps[0] as number;
  const earlier = reps.slice(1);

  // Stable or improving: the latest session is at least as good as the worst
  // of the recent ones and no worse than a small dip from the best.
  const best = Math.max(...earlier);
  return latest < best * 0.9;
}

export function computeProgression(input: ProgressionInput): ProgressionRecommendation {
  const nextRepTarget = { min: input.targetRepMin, max: input.targetRepMax };
  const sets = workingSets(input.lastSession);
  const load = sessionLoad(input.lastSession);

  if (sets.length === 0 || load === null) {
    return {
      action: 'hold',
      nextWeightKg: load,
      nextRepTarget,
      reason: 'No completed working sets logged yet, so there is nothing to progress from.',
      blockedBy: 'insufficient_data',
    };
  }

  // --- Blocking conditions, in order of seriousness -----------------------

  if (input.lastSession.some((set) => set.painReported)) {
    return {
      action: 'hold',
      nextWeightKg: load,
      nextRepTarget,
      reason:
        'You reported pain on this exercise last session, so we are not adding load. Consider swapping it for an alternative, and see someone qualified if it persists.',
      blockedBy: 'pain',
    };
  }

  if (input.lastSession.some((set) => set.techniqueBreakdown)) {
    return {
      action: 'hold',
      nextWeightKg: load,
      nextRepTarget,
      reason:
        'Technique broke down on at least one set last time. Repeat this load until all sets are clean — adding weight now would only make the breakdown worse.',
      blockedBy: 'technique_breakdown',
    };
  }

  const reportedRir = sets
    .map((set) => set.rir)
    .filter((rir): rir is number => rir !== null);

  const badlyMissedRir = reportedRir.some(
    (rir) => rir < input.targetRir - RIR_UNDERSHOOT_TOLERANCE,
  );

  if (badlyMissedRir) {
    return {
      action: 'hold',
      nextWeightKg: load,
      nextRepTarget,
      reason: `You were closer to failure than the ${input.targetRir} RIR we prescribed, so the reps you hit cost more than they look. Repeat this load and aim to finish each set with ${input.targetRir} clean reps left.`,
      blockedBy: 'rir_undershoot',
    };
  }

  if (isPerformanceUnstable(input.lastSession, input.previousSessions ?? [])) {
    return {
      action: 'hold',
      nextWeightKg: load,
      nextRepTarget,
      reason:
        'Your reps on this lift have been moving up and down rather than trending upward. Hold the load until performance settles — that usually means recovery, not programming.',
      blockedBy: 'unstable_performance',
    };
  }

  // --- Double progression ------------------------------------------------

  const allAtTop = sets.every((set) => (set.reps ?? 0) >= input.targetRepMax);
  if (allAtTop) {
    const nextWeightKg = round2(load + input.loadIncrementKg);
    return {
      action: 'increase_load',
      nextWeightKg,
      nextRepTarget,
      reason: `You hit ${input.targetRepMax} reps on every set at ${formatWeight(load)} kg with the reps in reserve we asked for. Move to ${formatWeight(nextWeightKg)} kg and work back up from ${input.targetRepMin}.`,
      blockedBy: null,
    };
  }

  const allBelowMin = sets.every((set) => (set.reps ?? 0) < input.targetRepMin);
  if (allBelowMin) {
    const nextWeightKg = round2(Math.max(0, load - input.loadIncrementKg));
    return {
      action: 'reduce_load',
      nextWeightKg,
      nextRepTarget,
      reason: `Every set came in under ${input.targetRepMin} reps, which means the load is too heavy to train the range we want. Drop to ${formatWeight(nextWeightKg)} kg.`,
      blockedBy: null,
    };
  }

  const lowestReps = Math.min(...sets.map((set) => set.reps ?? 0));
  return {
    action: 'add_reps',
    nextWeightKg: load,
    nextRepTarget,
    reason: `Stay at ${formatWeight(load)} kg and add reps. Your lowest set was ${lowestReps}; once every set reaches ${input.targetRepMax}, the load goes up.`,
    blockedBy: null,
  };
}

/**
 * Estimated one-rep max, Epley formula.
 *
 * Only meaningful up to about 10 reps — beyond that the estimate drifts badly
 * and is more a measure of endurance than strength, so it returns null rather
 * than a confident wrong number.
 */
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps <= 0) return null;
  if (reps > 10) return null;
  if (reps === 1) return round2(weightKg);
  return round2(weightKg * (1 + reps / 30));
}

export const BLOCK_REASON_LABELS: Record<BlockReason, string> = {
  rir_undershoot: 'Closer to failure than prescribed',
  technique_breakdown: 'Technique broke down',
  pain: 'Pain reported',
  unstable_performance: 'Performance is unstable',
  insufficient_data: 'Not enough logged yet',
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

function formatWeight(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${round2(value)}`;
}
