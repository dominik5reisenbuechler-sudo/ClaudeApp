import type { OnboardingDraft } from './schema';
import { missingForTargets } from './schema';
import type { InitialTargetInput } from '@/domain/nutrition/targets';
import { ageOn, todayIsoDate } from '@/utils/date';

/**
 * Mapping from the onboarding draft to the domain's target input.
 *
 * Kept in its own module, free of any service or React import, so it can be
 * unit-tested — this is the seam where a wrong field name would silently
 * produce a plausible-looking but incorrect calorie target.
 */

export class IncompleteDraftError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Onboarding draft is missing required fields: ${missing.join(', ')}`);
    this.name = 'IncompleteDraftError';
    this.missing = missing;
  }
}

/**
 * Build the domain input, or throw listing exactly what is missing.
 *
 * Throwing rather than substituting defaults is deliberate: a calorie target
 * computed from a placeholder height is worse than no target at all, because
 * the user has no way to tell it apart from a real one.
 */
export function draftToTargetInput(
  draft: OnboardingDraft,
  today = todayIsoDate(),
): InitialTargetInput {
  const missing = missingForTargets(draft);
  if (missing.length > 0) throw new IncompleteDraftError(missing);

  return {
    sex: draft.sex as NonNullable<OnboardingDraft['sex']>,
    ageYears: ageOn(draft.birthDate as string, today),
    heightCm: draft.heightCm as number,
    weightKg: draft.weightKg as number,
    bodyFatPercent: draft.bodyFatPercent ?? null,
    bodyFatIsMeasured: draft.bodyFatIsMeasured ?? false,

    occupation: draft.occupation as NonNullable<OnboardingDraft['occupation']>,
    activityLevel: draft.activityLevel as NonNullable<OnboardingDraft['activityLevel']>,
    averageDailySteps: draft.averageDailySteps as number,

    experience: draft.experience as NonNullable<OnboardingDraft['experience']>,
    trainingDaysPerWeek: draft.trainingDaysPerWeek as number,
    sessionMinutes: draft.sessionMinutes as number,

    goal: draft.goal as NonNullable<OnboardingDraft['goal']>,
    dietType: draft.dietType as NonNullable<OnboardingDraft['dietType']>,

    screening: {
      isPregnantOrBreastfeeding: draft.isPregnantOrBreastfeeding ?? false,
      hasMedicalCondition: draft.hasMedicalCondition ?? false,
      eatingDisorderRisk: draft.eatingDisorderRisk ?? false,
      reportsAcuteSymptoms: draft.reportsAcuteSymptoms ?? false,
    },
  };
}

export function canComputeTargets(draft: OnboardingDraft): boolean {
  return missingForTargets(draft).length === 0;
}
