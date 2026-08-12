/**
 * Assembling the context an AI coach answers from.
 *
 * The coach is **grounded**: it answers from the numbers below or it says it
 * does not know. That is the entire reason this module exists as a pure,
 * tested function rather than a string built at the call site — what the model
 * is shown determines what it can truthfully say, and that deserves the same
 * scrutiny as any other calculation in the app.
 *
 * Three rules shape what goes in:
 *
 * **Minimum necessary.** No name, no email, no user id, no birth date. The
 * coach needs an age, not a date of birth; a goal, not an identity. Sending a
 * whole profile because it was convenient would be sending health data to a
 * third party for no reason (CLAUDE.md §56).
 *
 * **Bounded.** Summaries, not logs. Thirty days of food entries would be
 * thousands of rows, would cost real money per question, and would bury the
 * three numbers that actually answer most questions.
 *
 * **Explicitly incomplete.** Where the app does not know something, the context
 * says so rather than omitting it. A model shown no weight data will happily
 * invent a trend; one shown `"weightTrend": null` with `"unknown"` in the notes
 * has been told what it cannot answer.
 */

import type { GoalType, IsoDate, MacroTargets, Sex } from '@/types/domain';

/** Days of history the coach is given. Beyond this, summaries stop being current. */
export const COACH_HISTORY_DAYS = 28;

/** Recent exercises included. Enough to answer "should I add weight to bench?". */
export const COACH_MAX_EXERCISES = 8;

export interface CoachProfileContext {
  ageYears: number | null;
  sex: Sex | null;
  heightCm: number | null;
  experience: string | null;
  goal: GoalType | null;
  dietType: string | null;
  allergens: readonly string[];
  /** Flags that must change what the coach is willing to say. */
  safetyFlags: readonly string[];
}

export interface CoachNutritionContext {
  targets: MacroTargets | null;
  /** Mean over the days that were logged, not over the window. */
  meanIntakeKcal: number | null;
  meanProteinG: number | null;
  daysLogged: number;
  daysInWindow: number;
  estimatedTdeeKcal: number | null;
  tdeeConfidence: number | null;
}

export interface CoachBodyContext {
  latestWeightKg: number | null;
  trendWeightKg: number | null;
  weightChangeKgPerWeek: number | null;
  weighInCount: number;
}

export interface CoachExerciseContext {
  name: string;
  lastWeightKg: number | null;
  lastReps: number | null;
  lastRir: number | null;
  estimatedOneRmKg: number | null;
  /** kg per week on the estimated 1RM. Null when there is too little history. */
  trendKgPerWeek: number | null;
}

export interface CoachTrainingContext {
  sessionsCompleted: number;
  plannedPerWeek: number | null;
  weeklySetsByMuscle: Readonly<Record<string, number>>;
  recentExercises: readonly CoachExerciseContext[];
}

export interface CoachContext {
  generatedOn: IsoDate;
  windowDays: number;
  profile: CoachProfileContext;
  nutrition: CoachNutritionContext;
  body: CoachBodyContext;
  training: CoachTrainingContext;
  /** What the coach must treat as unknown, named explicitly. */
  unknown: string[];
}

export interface BuildCoachContextInput {
  today: IsoDate;
  profile: CoachProfileContext;
  nutrition: CoachNutritionContext;
  body: CoachBodyContext;
  training: CoachTrainingContext;
}

export function buildCoachContext(input: BuildCoachContextInput): CoachContext {
  const unknown: string[] = [];

  if (input.body.weighInCount === 0) unknown.push('bodyweight — nothing has been weighed in');
  else if (input.body.weightChangeKgPerWeek === null) {
    unknown.push('rate of weight change — not enough weigh-ins for a trend');
  }

  if (input.nutrition.daysLogged === 0) unknown.push('food intake — nothing has been logged');
  else if (input.nutrition.daysLogged < input.nutrition.daysInWindow / 2) {
    unknown.push(
      `typical intake — only ${input.nutrition.daysLogged} of ${input.nutrition.daysInWindow} days were logged, so the average may not represent normal eating`,
    );
  }

  if (input.nutrition.estimatedTdeeKcal === null) {
    unknown.push('measured expenditure — not enough data yet, targets still come from an equation');
  }

  if (input.training.sessionsCompleted === 0) unknown.push('training — no sessions logged');
  if (input.training.recentExercises.length === 0) {
    unknown.push('exercise progression — no logged sets to judge from');
  }

  return {
    generatedOn: input.today,
    windowDays: COACH_HISTORY_DAYS,
    profile: input.profile,
    nutrition: input.nutrition,
    body: input.body,
    training: {
      ...input.training,
      recentExercises: input.training.recentExercises.slice(0, COACH_MAX_EXERCISES),
    },
    unknown,
  };
}

/**
 * The system prompt.
 *
 * Written here, next to the context it describes, because the two are one
 * artefact: a rule about what the coach may say is only meaningful alongside
 * what it can see. Kept in the domain so it is diffable, reviewable and
 * testable rather than buried in an Edge Function nobody reads.
 */
export function coachSystemPrompt(context: CoachContext): string {
  return [
    'You are a strength-training and nutrition coach inside a fitness app.',
    'You answer only from the JSON context provided with the user message.',
    '',
    'Rules you must follow:',
    '1. If the context does not contain what you need, say so plainly and say what the user would have to log for you to answer. Never estimate a number the context does not contain.',
    '2. Everything listed under "unknown" is genuinely unknown. Do not work around it.',
    '3. Give concrete answers with the actual numbers from the context, not general advice.',
    '4. You are not a medical professional. For anything involving injury, illness, medication, pregnancy or disordered eating, say clearly that it is outside what you can help with and suggest a qualified professional.',
    '5. Never recommend a calorie target below the one already set without saying why, and never recommend rapid weight loss.',
    '6. You cannot change anything yourself. If a change makes sense, propose it as an action and let the user decide.',
    '7. Be brief. Two or three short paragraphs at most.',
    '',
    `Today is ${context.generatedOn}. The context covers the last ${context.windowDays} days.`,
    context.profile.safetyFlags.length > 0
      ? `Safety notes about this user that override normal advice: ${context.profile.safetyFlags.join('; ')}.`
      : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * The context as the payload actually sent.
 *
 * Keys are sorted at every level, so identical state produces an identical
 * string. That makes the request cacheable and — more usefully — makes a diff
 * between two questions readable when an answer comes back wrong.
 */
export function serializeCoachContext(context: CoachContext): string {
  return JSON.stringify(sortKeys(context));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  return Object.fromEntries(entries.map(([key, nested]) => [key, sortKeys(nested)]));
}
