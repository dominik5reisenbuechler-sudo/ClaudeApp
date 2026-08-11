import { Controller } from 'react-hook-form';

import { SingleSelect } from '../controls';
import { useOnboardingDraft } from '../draft';
import { goalSchema } from '../schema';
import type { GoalValues } from '../schema';
import { StepShell } from '../StepShell';
import { errorMessage, useStepForm } from '../useStepForm';
import type { StepScreenProps } from './types';
import { Callout, NumberInput } from '@/components/ui';
import { GOAL_DESCRIPTIONS, GOAL_LABELS } from '@/domain/nutrition/goalAdjustment';
import { blocksDeficit, screenForSafety } from '@/domain/nutrition/safety';
import { GOAL_TYPES } from '@/types/domain';
import { ageOn, todayIsoDate } from '@/utils/date';

const GOAL_OPTIONS = GOAL_TYPES.map((goal) => ({
  value: goal,
  label: GOAL_LABELS[goal],
  description: GOAL_DESCRIPTIONS[goal],
}));

export function GoalStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const form = useStepForm<GoalValues>(goalSchema, {
    goal: draft.goal,
    targetWeightKg: draft.targetWeightKg ?? null,
  } as never);

  // Screen before the choice is made, so a user whose deficit will be blocked
  // finds out here rather than being silently overridden on the review screen.
  const flags =
    draft.birthDate && draft.sex && draft.weightKg && draft.heightCm
      ? screenForSafety({
          ageYears: ageOn(draft.birthDate, todayIsoDate()),
          sex: draft.sex,
          weightKg: draft.weightKg,
          heightCm: draft.heightCm,
          isPregnantOrBreastfeeding: draft.isPregnantOrBreastfeeding ?? false,
          hasMedicalCondition: draft.hasMedicalCondition ?? false,
          eatingDisorderRisk: draft.eatingDisorderRisk ?? false,
          reportsAcuteSymptoms: draft.reportsAcuteSymptoms ?? false,
        })
      : [];

  const deficitBlocked = blocksDeficit(flags);

  const submit = form.handleSubmit((values) => {
    update(values);
    onNext();
  });

  return (
    <StepShell
      step={step}
      title="What are you working towards?"
      subtitle="You can change this at any time. Most people do, once or twice a year."
      onContinue={submit}
      {...(onBack ? { onBack } : {})}
    >
      {deficitBlocked ? (
        <Callout tone="warning" title="We will not set a calorie deficit">
          {flags
            .filter((flag) => flag.severity === 'block_deficit')
            .map((flag) => flag.message)
            .join(' ')}
        </Callout>
      ) : null}

      <Controller
        control={form.control}
        name="goal"
        render={({ field, fieldState }) => (
          <SingleSelect
            options={GOAL_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="targetWeightKg"
        render={({ field, fieldState }) => (
          <NumberInput
            label="Goal weight (optional)"
            suffix="kg"
            value={field.value ?? null}
            onChangeValue={field.onChange}
            hint="Only used to show progress. Your calorie target comes from your rate of change, not from this number."
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />
    </StepShell>
  );
}
