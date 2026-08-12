/**
 * Merging health-platform samples with what the user already logged.
 *
 * The whole module exists to enforce one rule: **a manual entry always wins.**
 * If someone typed 82.4 kg this morning, a scale that synced 82.1 kg through
 * Apple Health does not get to overwrite it. They looked at a number and chose
 * to record a different one; treating that as stale data is the app deciding it
 * knows better than the person using it.
 *
 * So a sync only ever fills gaps. Nothing here produces a delete, and nothing
 * overwrites a `manual` row. Days that already have data are reported as
 * skipped, with the reason, so the UI can say "14 days imported, 3 already had
 * your own entries" instead of silently doing less than the user expected.
 *
 * Between two *synced* readings for one day, a hardware device beats a phone
 * estimate and the later reading beats the earlier one. Weight is the case that
 * matters: a smart scale is a measurement, and an app that lets you type a
 * guess is not.
 */

import type { IsoDate, LogSource } from '@/types/domain';

/**
 * Where a sample came from, so a scale reading can outrank a phone estimate.
 * Declared here rather than in `integrations/health` because the domain is what
 * reasons about it; the provider maps its platform's shape into this one.
 */
export interface HealthSampleSource {
  /** The device or app that recorded it, as the platform reports it. */
  name: string;
  /** True when the platform says this came from a hardware device. */
  isDevice: boolean;
}

export interface HealthWeightSample {
  date: IsoDate;
  weightKg: number;
  /** Recorded time, for picking between two readings on the same day. */
  recordedAt: string;
  source: HealthSampleSource;
}

export interface HealthStepSample {
  date: IsoDate;
  steps: number;
  source: HealthSampleSource;
}

export type SkipReason = 'manual_entry_exists' | 'already_synced' | 'implausible';

export interface ExistingLog {
  date: IsoDate;
  source: LogSource;
}

export interface WeightImport {
  date: IsoDate;
  weightKg: number;
  source: LogSource;
}

export interface StepImport {
  date: IsoDate;
  steps: number;
  source: LogSource;
}

export interface SkippedDay {
  date: IsoDate;
  reason: SkipReason;
}

export interface ReconcileResult<T> {
  toInsert: T[];
  skipped: SkippedDay[];
  /** What happened, for the sync summary. */
  summary: string;
}

/**
 * Bodyweight outside this range is a unit mix-up or a bad sensor reading, not a
 * person. Importing it would poison the trend that every calorie recommendation
 * rests on, so it is dropped rather than smoothed.
 */
export const MIN_PLAUSIBLE_WEIGHT_KG = 25;
export const MAX_PLAUSIBLE_WEIGHT_KG = 400;

/** Nobody walks this far. A duplicate-counting bug, most likely. */
export const MAX_PLAUSIBLE_STEPS = 100_000;

export function reconcileWeights(
  samples: readonly HealthWeightSample[],
  existing: readonly ExistingLog[],
  providerSource: LogSource,
): ReconcileResult<WeightImport> {
  const existingByDate = new Map(existing.map((log) => [log.date, log.source]));
  const best = new Map<IsoDate, HealthWeightSample>();
  const skipped: SkippedDay[] = [];

  for (const sample of samples) {
    if (
      sample.weightKg < MIN_PLAUSIBLE_WEIGHT_KG ||
      sample.weightKg > MAX_PLAUSIBLE_WEIGHT_KG
    ) {
      skipped.push({ date: sample.date, reason: 'implausible' });
      continue;
    }

    const incumbent = best.get(sample.date);
    if (incumbent === undefined || outranks(sample, incumbent)) best.set(sample.date, sample);
  }

  const toInsert: WeightImport[] = [];

  for (const [date, sample] of [...best].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const existingSource = existingByDate.get(date);

    if (existingSource === 'manual') {
      skipped.push({ date, reason: 'manual_entry_exists' });
      continue;
    }
    if (existingSource !== undefined) {
      skipped.push({ date, reason: 'already_synced' });
      continue;
    }

    toInsert.push({
      date,
      weightKg: round2(sample.weightKg),
      // A reading from a hardware device is recorded as one, whichever health
      // store it arrived through. That is what lets the trend say where the
      // number came from later.
      source: sample.source.isDevice ? 'smart_scale' : providerSource,
    });
  }

  return { toInsert, skipped, summary: buildSummary(toInsert.length, skipped, 'weigh-ins') };
}

export function reconcileSteps(
  samples: readonly HealthStepSample[],
  existing: readonly ExistingLog[],
  providerSource: LogSource,
): ReconcileResult<StepImport> {
  const existingByDate = new Map(existing.map((log) => [log.date, log.source]));
  const best = new Map<IsoDate, number>();
  const skipped: SkippedDay[] = [];

  for (const sample of samples) {
    if (sample.steps < 0 || sample.steps > MAX_PLAUSIBLE_STEPS) {
      skipped.push({ date: sample.date, reason: 'implausible' });
      continue;
    }
    // Health stores report one total per source; the highest is the one that
    // saw the whole day, since a second device usually saw part of it.
    best.set(sample.date, Math.max(best.get(sample.date) ?? 0, sample.steps));
  }

  const toInsert: StepImport[] = [];

  for (const [date, steps] of [...best].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const existingSource = existingByDate.get(date);

    if (existingSource === 'manual') {
      skipped.push({ date, reason: 'manual_entry_exists' });
      continue;
    }
    if (existingSource !== undefined) {
      skipped.push({ date, reason: 'already_synced' });
      continue;
    }

    toInsert.push({ date, steps: Math.round(steps), source: providerSource });
  }

  return { toInsert, skipped, summary: buildSummary(toInsert.length, skipped, 'step counts') };
}

/** Later beats earlier; a hardware device beats anything that is not one. */
function outranks(candidate: HealthWeightSample, incumbent: HealthWeightSample): boolean {
  if (candidate.source.isDevice !== incumbent.source.isDevice) return candidate.source.isDevice;
  return candidate.recordedAt > incumbent.recordedAt;
}

function buildSummary(
  imported: number,
  skipped: readonly SkippedDay[],
  noun: string,
): string {
  if (imported === 0 && skipped.length === 0) {
    return `Nothing new to import — no ${noun} found in that period.`;
  }

  const parts: string[] = [
    imported === 0
      ? `No new ${noun} to import.`
      : `Imported ${imported} ${imported === 1 ? noun.replace(/s$/, '') : noun}.`,
  ];

  const manual = skipped.filter((day) => day.reason === 'manual_entry_exists').length;
  const already = skipped.filter((day) => day.reason === 'already_synced').length;
  const implausible = skipped.filter((day) => day.reason === 'implausible').length;

  if (manual > 0) {
    parts.push(
      `${manual} ${manual === 1 ? 'day' : 'days'} kept your own entry — what you typed always wins.`,
    );
  }
  if (already > 0) parts.push(`${already} ${already === 1 ? 'day was' : 'days were'} already synced.`);
  if (implausible > 0) {
    parts.push(
      `${implausible} ${implausible === 1 ? 'reading looked' : 'readings looked'} wrong and ${implausible === 1 ? 'was' : 'were'} left out.`,
    );
  }

  return parts.join(' ');
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
