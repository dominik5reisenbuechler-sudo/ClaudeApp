import { z } from 'zod';

import {
  ACTIVITY_LEVELS,
  ALLERGENS,
  DIET_TYPES,
  EQUIPMENT_IDS,
  EXPERIENCE_LEVELS,
  GOAL_TYPES,
  MEAL_PREP_PREFERENCES,
  MUSCLE_IDS,
  OCCUPATION_ACTIVITIES,
  SEXES,
  TRAINING_LOCATIONS,
  UNIT_SYSTEMS,
} from '@/types/domain';
import { ageOn, isIsoDate, todayIsoDate } from '@/utils/date';

/**
 * Onboarding validation.
 *
 * One schema per step, each validating only its own fields. The draft as a
 * whole is deliberately *not* one big schema with everything required — a
 * partially-filled draft is the normal state, and the flow must be able to
 * persist and restore it without failing validation.
 *
 * The same schemas back both the React Hook Form resolver and the final
 * pre-submit check, so a value that reaches the database has been validated by
 * the identical rule that validated it on screen.
 */

const MIN_AGE = 13;
const MAX_AGE = 100;

export const welcomeSchema = z.object({
  acceptedTerms: z.literal(true, { message: 'Please accept the terms to continue' }),
  healthDataConsent: z.literal(true, {
    message: 'We need your consent to store health data in order to personalise anything',
  }),
});

export const basicsSchema = z.object({
  displayName: z.string().trim().min(1, 'Please enter a name').max(60),
  birthDate: z
    .string()
    .refine(isIsoDate, 'Please enter a valid date')
    .refine((value) => {
      const age = ageOn(value, todayIsoDate());
      return age >= MIN_AGE && age <= MAX_AGE;
    }, `Age must be between ${MIN_AGE} and ${MAX_AGE}`),
  sex: z.enum(SEXES, { message: 'Please choose an option' }),
  heightCm: z
    .number({ message: 'Please enter your height' })
    .min(120, 'That height seems too low')
    .max(250, 'That height seems too high'),
  unitSystem: z.enum(UNIT_SYSTEMS),
});

export const bodySchema = z.object({
  weightKg: z
    .number({ message: 'Please enter your weight' })
    .min(30, 'That weight seems too low')
    .max(300, 'That weight seems too high'),
  bodyFatPercent: z.number().min(3).max(60).nullable().optional(),
  bodyFatIsMeasured: z.boolean().optional(),
});

export const activitySchema = z.object({
  occupation: z.enum(OCCUPATION_ACTIVITIES, { message: 'Please choose an option' }),
  activityLevel: z.enum(ACTIVITY_LEVELS, { message: 'Please choose an option' }),
  averageDailySteps: z
    .number({ message: 'Please enter an estimate' })
    .min(0)
    .max(50000, 'That step count seems too high'),
  averageSleepHours: z.number().min(3).max(14).nullable().optional(),
});

export const experienceSchema = z.object({
  experience: z.enum(EXPERIENCE_LEVELS, { message: 'Please choose an option' }),
  trainingLocation: z.enum(TRAINING_LOCATIONS, { message: 'Please choose an option' }),
});

export const equipmentSchema = z.object({
  availableEquipment: z.array(z.enum(EQUIPMENT_IDS)).min(1, 'Select at least one option'),
});

export const scheduleSchema = z
  .object({
    trainingDaysPerWeek: z.number().int().min(2, 'Choose at least 2 days').max(6),
    preferredTrainingDays: z.array(z.number().int().min(1).max(7)),
    sessionMinutes: z.number().int().min(20).max(180),
  })
  .refine(
    (value) =>
      value.preferredTrainingDays.length === 0 ||
      value.preferredTrainingDays.length >= value.trainingDaysPerWeek,
    {
      message: 'Pick at least as many days as you plan to train, or leave it to us',
      path: ['preferredTrainingDays'],
    },
  );

export const prioritiesSchema = z.object({
  musclePriorities: z.partialRecord(z.enum(MUSCLE_IDS), z.number().int().min(0).max(3)),
});

export const healthSchema = z.object({
  isPregnantOrBreastfeeding: z.boolean(),
  hasMedicalCondition: z.boolean(),
  medicalConditionNotes: z.string().max(500).optional(),
  injuryNotes: z.string().max(500).optional(),
  eatingDisorderRisk: z.boolean(),
  reportsAcuteSymptoms: z.boolean(),
});

export const dietSchema = z.object({
  dietType: z.enum(DIET_TYPES, { message: 'Please choose an option' }),
  mealsPerDay: z.number().int().min(2).max(6),
  mealPrepPreference: z.enum(MEAL_PREP_PREFERENCES),
  maxCookMinutes: z.number().int().min(5).max(120),
});

export const restrictionsSchema = z.object({
  allergens: z.array(z.enum(ALLERGENS)),
  intolerances: z.array(z.string().trim().min(1)),
  dislikedFoods: z.array(z.string().trim().min(1)),
});

export const goalSchema = z.object({
  goal: z.enum(GOAL_TYPES, { message: 'Please choose a goal' }),
  targetWeightKg: z.number().min(30).max(300).nullable().optional(),
});

/**
 * The accumulated draft. Every field is optional, because a partly-filled draft
 * is the normal state — it is written to storage after every step.
 *
 * Spelled out in full rather than composed from the step schemas' shapes:
 * composition by spreading `.partial().shape` collapses Zod's inference to
 * `{}`, and this type is the contract the whole feature is built on. The
 * per-step schemas remain the authority on *validation*; this one only
 * describes what may be persisted.
 */
export const draftSchema = z.object({
  acceptedTerms: z.boolean().optional(),
  healthDataConsent: z.boolean().optional(),

  displayName: z.string().optional(),
  birthDate: z.string().optional(),
  sex: z.enum(SEXES).optional(),
  heightCm: z.number().optional(),
  unitSystem: z.enum(UNIT_SYSTEMS).optional(),

  weightKg: z.number().optional(),
  bodyFatPercent: z.number().nullable().optional(),
  bodyFatIsMeasured: z.boolean().optional(),

  occupation: z.enum(OCCUPATION_ACTIVITIES).optional(),
  activityLevel: z.enum(ACTIVITY_LEVELS).optional(),
  averageDailySteps: z.number().optional(),
  averageSleepHours: z.number().nullable().optional(),

  experience: z.enum(EXPERIENCE_LEVELS).optional(),
  trainingLocation: z.enum(TRAINING_LOCATIONS).optional(),

  availableEquipment: z.array(z.enum(EQUIPMENT_IDS)).optional(),

  trainingDaysPerWeek: z.number().optional(),
  preferredTrainingDays: z.array(z.number()).optional(),
  sessionMinutes: z.number().optional(),

  musclePriorities: z.partialRecord(z.enum(MUSCLE_IDS), z.number()).optional(),

  isPregnantOrBreastfeeding: z.boolean().optional(),
  hasMedicalCondition: z.boolean().optional(),
  medicalConditionNotes: z.string().optional(),
  injuryNotes: z.string().optional(),
  eatingDisorderRisk: z.boolean().optional(),
  reportsAcuteSymptoms: z.boolean().optional(),

  dietType: z.enum(DIET_TYPES).optional(),
  mealsPerDay: z.number().optional(),
  mealPrepPreference: z.enum(MEAL_PREP_PREFERENCES).optional(),
  maxCookMinutes: z.number().optional(),

  allergens: z.array(z.enum(ALLERGENS)).optional(),
  intolerances: z.array(z.string()).optional(),
  dislikedFoods: z.array(z.string()).optional(),

  goal: z.enum(GOAL_TYPES).optional(),
  targetWeightKg: z.number().nullable().optional(),
});

export type OnboardingDraft = z.infer<typeof draftSchema>;

export type WelcomeValues = z.infer<typeof welcomeSchema>;
export type BasicsValues = z.infer<typeof basicsSchema>;
export type BodyValues = z.infer<typeof bodySchema>;
export type ActivityValues = z.infer<typeof activitySchema>;
export type ExperienceValues = z.infer<typeof experienceSchema>;
export type EquipmentValues = z.infer<typeof equipmentSchema>;
export type ScheduleValues = z.infer<typeof scheduleSchema>;
export type PrioritiesValues = z.infer<typeof prioritiesSchema>;
export type HealthValues = z.infer<typeof healthSchema>;
export type DietValues = z.infer<typeof dietSchema>;
export type RestrictionsValues = z.infer<typeof restrictionsSchema>;
export type GoalValues = z.infer<typeof goalSchema>;

/** Defaults chosen so a user who accepts everything still gets a sane plan. */
export const draftDefaults: OnboardingDraft = {
  unitSystem: 'metric',
  bodyFatIsMeasured: false,
  averageDailySteps: 6000,
  availableEquipment: [],
  trainingDaysPerWeek: 4,
  preferredTrainingDays: [],
  sessionMinutes: 60,
  musclePriorities: {},
  isPregnantOrBreastfeeding: false,
  hasMedicalCondition: false,
  eatingDisorderRisk: false,
  reportsAcuteSymptoms: false,
  mealsPerDay: 3,
  mealPrepPreference: 'some',
  maxCookMinutes: 30,
  allergens: [],
  intolerances: [],
  dislikedFoods: [],
};

/** Ordered step slugs. The route reads this to know what comes next. */
export const ONBOARDING_STEPS = [
  'welcome',
  'basics',
  'body',
  'activity',
  'experience',
  'equipment',
  'schedule',
  'priorities',
  'health',
  'diet',
  'restrictions',
  'goal',
  'review',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[index + 1] ?? null;
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index > 0 ? (ONBOARDING_STEPS[index - 1] as OnboardingStep) : null;
}

export function stepProgress(step: OnboardingStep): { index: number; total: number } {
  return { index: ONBOARDING_STEPS.indexOf(step) + 1, total: ONBOARDING_STEPS.length };
}

/**
 * Fields that must be present before the review step can compute targets.
 * Checked explicitly rather than inferred, so a user who deep-links to
 * `/review` with a half-filled draft is sent back rather than shown a target
 * derived from defaults.
 */
export const REQUIRED_FOR_TARGETS = [
  'birthDate',
  'sex',
  'heightCm',
  'weightKg',
  'occupation',
  'activityLevel',
  'averageDailySteps',
  'experience',
  'trainingDaysPerWeek',
  'sessionMinutes',
  'dietType',
  'goal',
] as const satisfies readonly (keyof OnboardingDraft)[];

export function missingForTargets(draft: OnboardingDraft): string[] {
  return REQUIRED_FOR_TARGETS.filter((key) => {
    const value = draft[key];
    return value === undefined || value === null || value === '';
  });
}
