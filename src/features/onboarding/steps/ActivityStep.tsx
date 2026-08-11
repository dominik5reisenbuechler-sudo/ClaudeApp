import { Controller } from 'react-hook-form';

import { SingleSelect } from '../controls';
import { useOnboardingDraft } from '../draft';
import { activitySchema } from '../schema';
import type { ActivityValues } from '../schema';
import { StepShell } from '../StepShell';
import { errorMessage, useStepForm } from '../useStepForm';
import type { StepScreenProps } from './types';
import { NumberInput } from '@/components/ui';

const OCCUPATION_OPTIONS = [
  { value: 'desk', label: 'Mostly seated', description: 'Office work, driving, studying' },
  { value: 'light', label: 'On my feet sometimes', description: 'Teaching, retail, lab work' },
  { value: 'active', label: 'On my feet most of the day', description: 'Hospitality, nursing' },
  { value: 'manual', label: 'Physical work', description: 'Construction, warehouse, farming' },
] as const;

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Not much', description: 'Little beyond daily life and training' },
  { value: 'light', label: 'A little', description: 'The odd walk, occasional sport' },
  { value: 'moderate', label: 'Some', description: 'Regular walks or a sport once a week' },
  { value: 'high', label: 'Quite a lot', description: 'Sport several times a week' },
  { value: 'very_high', label: 'A great deal', description: 'Daily cycling, sport, manual hobbies' },
] as const;

export function ActivityStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const form = useStepForm<ActivityValues>(activitySchema, {
    occupation: draft.occupation,
    activityLevel: draft.activityLevel,
    averageDailySteps: draft.averageDailySteps ?? 6000,
    averageSleepHours: draft.averageSleepHours ?? null,
  } as never);

  const submit = form.handleSubmit((values) => {
    update(values);
    onNext();
  });

  return (
    <StepShell
      step={step}
      title="How active are your days?"
      subtitle="Work, walking and other activity are counted separately so we can explain where your energy needs come from."
      onContinue={submit}
      {...(onBack ? { onBack } : {})}
    >
      <Controller
        control={form.control}
        name="occupation"
        render={({ field, fieldState }) => (
          <SingleSelect
            label="Your work"
            options={OCCUPATION_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="averageDailySteps"
        render={({ field, fieldState }) => (
          <NumberInput
            label="Average daily steps"
            suffix="steps"
            precision={0}
            value={field.value ?? null}
            onChangeValue={field.onChange}
            hint="A rough estimate is fine — your phone's health app usually knows."
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="activityLevel"
        render={({ field, fieldState }) => (
          <SingleSelect
            label="Activity outside work and walking"
            options={ACTIVITY_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="averageSleepHours"
        render={({ field, fieldState }) => (
          <NumberInput
            label="Average sleep (optional)"
            suffix="hours"
            value={field.value ?? null}
            onChangeValue={field.onChange}
            hint="Used later to make sense of recovery and training performance."
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />
    </StepShell>
  );
}
