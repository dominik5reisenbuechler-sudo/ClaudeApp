import { draftToTargetInput } from './targetInput';
import type { OnboardingDraft } from './schema';
import { computeInitialTargets } from '@/domain/nutrition/targets';
import type { InitialTargetResult } from '@/domain/nutrition/targets';
import { GOAL_RATE_BANDS } from '@/domain/nutrition/goalAdjustment';
import {
  recordConsent,
  setActiveTarget,
  startGoal,
  updateProfile,
  upsertPreferences,
} from '@/services/profileService';
import { upsertWeightLog } from '@/services/logService';
import type { Json } from '@/types/database';
import { todayIsoDate } from '@/utils/date';

/**
 * Completing onboarding.
 *
 * Writes, in order: preferences → goal → target → first weigh-in → profile.
 * The profile is stamped last, because `onboarding_completed_at` is what the
 * router gates on: if an earlier write fails, the user is returned to
 * onboarding with their draft intact rather than landing on a dashboard with
 * no targets.
 *
 * This is not a transaction. Making it atomic needs a Postgres function, which
 * is the right move once the write set stops changing — for now the ordering
 * plus an intact local draft gives a safe, resumable failure mode.
 */

export interface CompleteOnboardingResult {
  targets: InitialTargetResult;
}

export async function completeOnboarding(
  userId: string,
  draft: OnboardingDraft,
  today = todayIsoDate(),
): Promise<CompleteOnboardingResult> {
  const targets = computeInitialTargets(draftToTargetInput(draft, today));

  await upsertPreferences(userId, {
    experience: draft.experience ?? null,
    training_location: draft.trainingLocation ?? null,
    training_days_per_week: draft.trainingDaysPerWeek ?? null,
    preferred_training_days: draft.preferredTrainingDays ?? [],
    session_minutes: draft.sessionMinutes ?? null,
    available_equipment: draft.availableEquipment ?? [],
    injury_notes: draft.injuryNotes ?? null,
    muscle_priorities: (draft.musclePriorities ?? {}) as Json,

    activity_level: draft.activityLevel ?? null,
    occupation_activity: draft.occupation ?? null,
    average_daily_steps: draft.averageDailySteps ?? null,
    average_sleep_hours: draft.averageSleepHours ?? null,

    diet_type: draft.dietType ?? null,
    allergens: draft.allergens ?? [],
    intolerances: draft.intolerances ?? [],
    disliked_foods: draft.dislikedFoods ?? [],
    meals_per_day: draft.mealsPerDay ?? null,
    meal_prep_preference: draft.mealPrepPreference ?? null,
    max_cook_minutes: draft.maxCookMinutes ?? null,

    is_pregnant_or_breastfeeding: draft.isPregnantOrBreastfeeding ?? false,
    has_medical_condition: draft.hasMedicalCondition ?? false,
    medical_condition_notes: draft.medicalConditionNotes ?? null,
    eating_disorder_risk: draft.eatingDisorderRisk ?? false,
    reports_acute_symptoms: draft.reportsAcuteSymptoms ?? false,
  });

  // The resolved goal, not the requested one — a user whose cut was blocked for
  // safety must not have `cut` recorded as their active phase.
  const band = GOAL_RATE_BANDS[targets.resolvedGoal];
  await startGoal(
    userId,
    {
      goal: targets.resolvedGoal,
      target_weight_kg: draft.targetWeightKg ?? null,
      target_rate_pct_per_week: (band.minPercentPerWeek + band.maxPercentPerWeek) / 2,
    },
    today,
  );

  await setActiveTarget(
    userId,
    {
      energy_kcal: targets.energyKcal,
      protein_g: targets.macros.proteinG,
      carbs_g: targets.macros.carbsG,
      fat_g: targets.macros.fatG,
      fiber_g: targets.macros.fiberG,
      step_goal: targets.stepGoal,
      basis: targets.basis as Json,
      source: 'onboarding',
    },
    today,
  );

  // The weight entered during onboarding is a real weigh-in. Logging it here
  // means the trend engine has a starting point from day one.
  if (typeof draft.weightKg === 'number') {
    await upsertWeightLog(userId, today, draft.weightKg);
  }

  if (draft.healthDataConsent) await recordConsent(userId, 'health_data', true);
  if (draft.acceptedTerms) await recordConsent(userId, 'terms', true);

  await updateProfile(userId, {
    display_name: draft.displayName ?? null,
    birth_date: draft.birthDate ?? null,
    sex: draft.sex ?? null,
    height_cm: draft.heightCm ?? null,
    unit_system: draft.unitSystem ?? 'metric',
    accepted_terms_at: draft.acceptedTerms ? new Date().toISOString() : null,
    health_data_consent_at: draft.healthDataConsent ? new Date().toISOString() : null,
    onboarding_completed_at: new Date().toISOString(),
  });

  return { targets };
}
