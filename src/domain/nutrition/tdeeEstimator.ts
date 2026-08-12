/**
 * The adaptive TDEE estimator — the product's central claim.
 *
 * A predictive equation guesses expenditure from height, weight and age. This
 * measures it, from the only evidence that actually knows: what the user ate,
 * and what their weight did about it.
 *
 *     TDEE ≈ mean daily intake − (trend weight change × 7700 / days)
 *
 * Everything difficult here is about *not* over-claiming:
 *
 *   - Weight input is the smoothed trend, never a single weigh-in.
 *   - A minimum window of 14 days, 21+ preferred.
 *   - The first days of a new phase are discounted, because the glycogen and
 *     water shift on entering a surplus or deficit is not tissue change.
 *   - A confidence score gates what may be *done* with the estimate, and is
 *     built from four independent measures of how much the data can bear.
 *
 * Reference: docs/SCIENTIFIC_RULES.md §1.3.
 */

import { KCAL_PER_KG_BODY_MASS } from './energy';
import { normalizeWeightPoints, weightTrend } from './weightTrend';
import { addDays, daysBetween } from '@/utils/date';
import { clamp, mean } from '@/utils/number';
import type { IsoDate, WeightPoint } from '@/types/domain';

export const MIN_WINDOW_DAYS = 14;
export const PREFERRED_WINDOW_DAYS = 21;
export const MAX_WINDOW_DAYS = 28;

/**
 * Days after a phase change during which weight movement is dominated by
 * glycogen and water rather than tissue. Data from this period is excluded.
 */
export const PHASE_SETTLING_DAYS = 10;

/** Weigh-ins per week for full credit on that component. */
const WEIGH_INS_FOR_FULL_CREDIT = 4;
/** Logged nutrition days per week for full credit. */
const LOGGED_DAYS_FOR_FULL_CREDIT = 6;

/**
 * A day below this is almost certainly a partial log — someone who recorded
 * breakfast and forgot the rest. Counting it as a real day would drag mean
 * intake down and inflate the expenditure estimate.
 */
const IMPLAUSIBLY_LOW_KCAL = 800;

export interface IntakeDay {
  date: IsoDate;
  energyKcal: number;
}

/** Days of weigh-in history needed *before* the window to seed the smoothing. */
const SMOOTHING_LEAD_IN_DAYS = 6;

export interface TdeeEstimateInput {
  /**
   * Weigh-ins. Supply at least `SMOOTHING_LEAD_IN_DAYS` days *before* the
   * window as well: a 7-day average on the window's first day needs the six
   * days preceding it, and without them the early averages are computed over
   * partial windows and flatten the measured rate.
   */
  weights: readonly WeightPoint[];
  intake: readonly IntakeDay[];
  /** Last day of the analysis window, normally today. */
  windowEnd: IsoDate;
  windowDays?: number;
  /** When the current goal started, so early water shifts can be excluded. */
  phaseStartedOn?: IsoDate;
}

export interface ConfidenceBreakdown {
  weighInDensity: number;
  loggingDensity: number;
  loggingCompleteness: number;
  windowLength: number;
  /** The product of the four. One weak component drags the whole score down. */
  overall: number;
}

export type ConfidenceBand = 'insufficient' | 'low' | 'moderate' | 'high';

export interface TdeeEstimate {
  /** Null when the data cannot support an estimate at all. */
  estimatedTdeeKcal: number | null;
  confidence: ConfidenceBreakdown;
  band: ConfidenceBand;
  meanIntakeKcal: number | null;
  weightChangeKgPerWeek: number | null;
  windowStart: IsoDate;
  windowEnd: IsoDate;
  daysAnalysed: number;
  weighInCount: number;
  loggedDayCount: number;
  /** Logged days that looked plausibly complete. */
  plausibleDayCount: number;
  /** True when the estimate may be acted on at all. */
  isUsable: boolean;
  /** What the estimate is, or why there isn't one, in the user's terms. */
  explanation: string;
}

/**
 * How much calorie change the confidence permits.
 *
 * Confidence gates *action*, not display: the estimate is always shown, but a
 * shaky one must not move someone's food (SCIENTIFIC_RULES.md §1.3).
 */
export function maxAdjustmentKcal(confidence: number): number {
  if (confidence < 0.4) return 0;
  if (confidence <= 0.7) return 100;
  return 200;
}

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence < 0.25) return 'insufficient';
  if (confidence < 0.4) return 'low';
  if (confidence <= 0.7) return 'moderate';
  return 'high';
}

/**
 * Days that look like a complete log.
 *
 * The threshold is relative as well as absolute: someone eating 3,500 kcal a
 * day who logs 1,200 has clearly missed meals, even though 1,200 clears the
 * absolute floor.
 */
export function plausibleIntakeDays(intake: readonly IntakeDay[]): IntakeDay[] {
  const values = intake.map((day) => day.energyKcal).sort((a, b) => a - b);
  const median = values.length > 0 ? (values[Math.floor(values.length / 2)] as number) : 0;
  const threshold = Math.max(IMPLAUSIBLY_LOW_KCAL, median * 0.5);

  return intake.filter((day) => day.energyKcal >= threshold);
}

export function computeConfidence(input: {
  weighInCount: number;
  plausibleDayCount: number;
  loggedDayCount: number;
  daysAnalysed: number;
}): ConfidenceBreakdown {
  const weeks = Math.max(input.daysAnalysed / 7, 1 / 7);

  const weighInDensity = clamp(input.weighInCount / weeks / WEIGH_INS_FOR_FULL_CREDIT, 0, 1);
  const loggingDensity = clamp(input.loggedDayCount / weeks / LOGGED_DAYS_FOR_FULL_CREDIT, 0, 1);

  // Of the days that were logged, how many look like a full day?
  const loggingCompleteness =
    input.loggedDayCount === 0 ? 0 : clamp(input.plausibleDayCount / input.loggedDayCount, 0, 1);

  const windowLength = clamp(input.daysAnalysed / PREFERRED_WINDOW_DAYS, 0, 1);

  return {
    weighInDensity: round2(weighInDensity),
    loggingDensity: round2(loggingDensity),
    loggingCompleteness: round2(loggingCompleteness),
    windowLength: round2(windowLength),
    // A product, not an average: four decent components should not be able to
    // cover for one that is missing entirely.
    overall: round2(weighInDensity * loggingDensity * loggingCompleteness * windowLength),
  };
}

export function estimateAdaptiveTdee(input: TdeeEstimateInput): TdeeEstimate {
  const requestedWindow = clamp(
    input.windowDays ?? PREFERRED_WINDOW_DAYS,
    MIN_WINDOW_DAYS,
    MAX_WINDOW_DAYS,
  );

  // Exclude the settling period after a phase change, if one applies.
  const earliestUsable = input.phaseStartedOn
    ? addDays(input.phaseStartedOn, PHASE_SETTLING_DAYS)
    : null;

  const naturalStart = addDays(input.windowEnd, -(requestedWindow - 1));
  const windowStart =
    earliestUsable && earliestUsable > naturalStart ? earliestUsable : naturalStart;

  const daysAnalysed = daysBetween(windowStart, input.windowEnd) + 1;

  const allWeights = normalizeWeightPoints(input.weights);

  // Weigh-ins inside the window — the right basis for measuring how densely
  // the user is weighing themselves.
  const weights = allWeights.filter(
    (point) => point.date >= windowStart && point.date <= input.windowEnd,
  );

  // …but the smoothing needs a run-up, so the trend is fitted over a slice that
  // reaches back before the window.
  const trendWeights = allWeights.filter(
    (point) =>
      point.date >= addDays(windowStart, -SMOOTHING_LEAD_IN_DAYS) &&
      point.date <= input.windowEnd,
  );
  const intake = input.intake.filter(
    (day) => day.date >= windowStart && day.date <= input.windowEnd,
  );
  const plausible = plausibleIntakeDays(intake);

  const confidence = computeConfidence({
    weighInCount: weights.length,
    plausibleDayCount: plausible.length,
    loggedDayCount: intake.length,
    daysAnalysed,
  });

  const base = {
    confidence,
    band: confidenceBand(confidence.overall),
    windowStart,
    windowEnd: input.windowEnd,
    daysAnalysed,
    weighInCount: weights.length,
    loggedDayCount: intake.length,
    plausibleDayCount: plausible.length,
  };

  if (daysAnalysed < MIN_WINDOW_DAYS) {
    return {
      ...base,
      estimatedTdeeKcal: null,
      meanIntakeKcal: null,
      weightChangeKgPerWeek: null,
      isUsable: false,
      explanation: `We need at least ${MIN_WINDOW_DAYS} days of data before we can measure your expenditure. ${
        earliestUsable && earliestUsable > naturalStart
          ? 'Your goal changed recently, and the first week or so of weight change is mostly water rather than tissue, so we are not counting it yet.'
          : `You have ${daysAnalysed} so far.`
      }`,
    };
  }

  /*
   * The rate comes from a least-squares fit over the whole smoothed series
   * (`weightTrend`), not from differencing two trailing averages.
   *
   * Differencing is the obvious approach and it is wrong: a 7-day trailing
   * average taken at day 6 is centred on day 3, and one taken at day 20 is
   * centred on day 17 — so their difference spans 14 days, not 20. Dividing it
   * by the window length understates the rate by about a third, which would
   * bias every calorie recommendation the engine ever makes.
   */
  const trend = weightTrend(trendWeights, daysAnalysed, 7);
  const meanIntakeKcal = mean(plausible.map((day) => day.energyKcal));

  if (trend === null || meanIntakeKcal === null) {
    return {
      ...base,
      estimatedTdeeKcal: null,
      meanIntakeKcal: meanIntakeKcal === null ? null : Math.round(meanIntakeKcal),
      weightChangeKgPerWeek: null,
      isUsable: false,
      explanation:
        trend === null
          ? `We have ${weights.length} weigh-ins in this window, which is not enough to separate a real trend from day-to-day water. Weighing in at least four times a week is what makes this work.`
          : 'We do not have enough complete days of food logging in this window to work out your average intake.',
    };
  }

  const weightChangeKgPerWeek = trend.kgPerWeek;

  // The core identity: intake minus the energy that went into (or came out of)
  // body mass is what was actually expended.
  const dailyEnergyFromMass = (weightChangeKgPerWeek / 7) * KCAL_PER_KG_BODY_MASS;
  const estimatedTdeeKcal = Math.round((meanIntakeKcal - dailyEnergyFromMass) / 10) * 10;

  const isUsable = confidence.overall >= 0.4;

  return {
    ...base,
    estimatedTdeeKcal,
    meanIntakeKcal: Math.round(meanIntakeKcal),
    weightChangeKgPerWeek,
    isUsable,
    explanation: buildExplanation({
      estimatedTdeeKcal,
      meanIntakeKcal: Math.round(meanIntakeKcal),
      weightChangeKgPerWeek,
      daysAnalysed,
      weighInCount: weights.length,
      loggedDayCount: intake.length,
      confidence: confidence.overall,
      isUsable,
    }),
  };
}

function buildExplanation(input: {
  estimatedTdeeKcal: number;
  meanIntakeKcal: number;
  weightChangeKgPerWeek: number;
  daysAnalysed: number;
  weighInCount: number;
  loggedDayCount: number;
  confidence: number;
  isUsable: boolean;
}): string {
  const direction =
    Math.abs(input.weightChangeKgPerWeek) < 0.05
      ? 'held steady'
      : input.weightChangeKgPerWeek > 0
        ? `rose ${Math.abs(input.weightChangeKgPerWeek)} kg per week`
        : `fell ${Math.abs(input.weightChangeKgPerWeek)} kg per week`;

  const core = `Over ${input.daysAnalysed} days you averaged ${input.meanIntakeKcal.toLocaleString('en-US')} kcal a day and your weight trend ${direction}. That puts your actual daily expenditure at roughly ${input.estimatedTdeeKcal.toLocaleString('en-US')} kcal.`;

  if (input.isUsable) {
    return `${core} This is measured from your own data rather than estimated from an equation.`;
  }

  return `${core} We are not acting on it yet — with ${input.weighInCount} weigh-ins and ${input.loggedDayCount} logged days in this window, the number could still move a fair way. More consistent logging will tighten it up.`;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
