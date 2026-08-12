/**
 * A coarse readiness signal from the weekly check-in.
 *
 * Every input here is subjective and noisy (SCIENTIFIC_RULES.md §6). This is
 * not a physiological measurement and the app must never present it as one —
 * it exists to gate volume increases and inform deload timing, both of which
 * are decisions where "probably under-recovered" is enough to act on.
 *
 * A skipped question is not a 3. Unanswered components are excluded from the
 * mean rather than filled in, so a user who answered two questions gets a score
 * built from two questions and a count that says so.
 */

export interface RecoveryAnswers {
  /** 1–5, how training felt. Higher is better. */
  trainingPerformance: number | null;
  /** 1–5. Higher is better. */
  sleepQuality: number | null;
  /** 1–5. Higher is better. */
  energy: number | null;
  /** 1–5. Higher is *worse* — this is stress, not calm. */
  stress: number | null;
  /** 0–4. Higher is worse. */
  jointDiscomfort: number | null;
}

export type RecoveryBand = 'poor' | 'neutral' | 'good' | 'unknown';

export interface RecoveryAssessment {
  /** 0–1, or null when nothing was answered. */
  score: number | null;
  band: RecoveryBand;
  answeredCount: number;
  /** Components that scored badly, named so an explanation can cite them. */
  concerns: string[];
}

export const RECOVERY_POOR_BELOW = 0.4;
export const RECOVERY_GOOD_FROM = 0.6;

/**
 * Answers needed before the band means anything. One answer is a mood, not a
 * recovery picture, and gating training changes on it would be over-claiming.
 */
export const MIN_ANSWERS_FOR_BAND = 2;

/** Normalised component value below which the component is called out. */
const CONCERN_THRESHOLD = 0.3;

interface Component {
  label: string;
  value: number;
}

export function assessRecovery(answers: RecoveryAnswers): RecoveryAssessment {
  const components: Component[] = [];

  const add = (label: string, value: number | null, normalize: (v: number) => number): void => {
    if (value === null) return;
    components.push({ label, value: clamp01(normalize(value)) });
  };

  const fromFive = (v: number): number => (v - 1) / 4;

  add('training performance', answers.trainingPerformance, fromFive);
  add('sleep', answers.sleepQuality, fromFive);
  add('energy', answers.energy, fromFive);
  // Stress and joint discomfort run the other way: high answers are bad.
  add('stress', answers.stress, (v) => 1 - fromFive(v));
  add('joint discomfort', answers.jointDiscomfort, (v) => 1 - v / 4);

  if (components.length === 0) {
    return { score: null, band: 'unknown', answeredCount: 0, concerns: [] };
  }

  const score =
    Math.round((components.reduce((sum, c) => sum + c.value, 0) / components.length) * 100) / 100;

  const concerns = components.filter((c) => c.value <= CONCERN_THRESHOLD).map((c) => c.label);

  return {
    score,
    band: recoveryBand(score, components.length),
    answeredCount: components.length,
    concerns,
  };
}

export function recoveryBand(score: number | null, answeredCount: number): RecoveryBand {
  if (score === null || answeredCount < MIN_ANSWERS_FOR_BAND) return 'unknown';
  if (score < RECOVERY_POOR_BELOW) return 'poor';
  if (score < RECOVERY_GOOD_FROM) return 'neutral';
  return 'good';
}

/** The assessment for a check-in that was never filled in. */
export const UNKNOWN_RECOVERY: RecoveryAssessment = {
  score: null,
  band: 'unknown',
  answeredCount: 0,
  concerns: [],
};

/**
 * The concerns as a phrase for a recommendation reason, or null when there is
 * nothing specific to name.
 */
export function describeConcerns(assessment: RecoveryAssessment): string | null {
  const { concerns } = assessment;
  if (concerns.length === 0) return null;
  if (concerns.length === 1) return concerns[0] as string;
  const head = concerns.slice(0, -1).join(', ');
  return `${head} and ${concerns[concerns.length - 1] as string}`;
}

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);
