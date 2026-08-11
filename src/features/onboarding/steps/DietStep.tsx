import { Controller } from 'react-hook-form';

import { SingleSelect } from '../controls';
import { useOnboardingDraft } from '../draft';
import { dietSchema } from '../schema';
import type { DietValues } from '../schema';
import { StepShell } from '../StepShell';
import { errorMessage, useStepForm } from '../useStepForm';
import type { StepScreenProps } from './types';
import { Stepper } from '@/components/ui';

const DIET_OPTIONS = [
  { value: 'omnivore', label: 'No restrictions' },
  { value: 'pescatarian', label: 'Pescatarian', description: 'Fish, no other meat' },
  { value: 'vegetarian', label: 'Vegetarian', description: 'No meat or fish' },
  { value: 'vegan', label: 'Vegan', description: 'No animal products' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
] as const;

const PREP_OPTIONS = [
  { value: 'none', label: 'Cook fresh each time', description: 'Variety over convenience' },
  { value: 'some', label: 'Some batch cooking', description: 'A couple of meals prepped ahead' },
  { value: 'heavy', label: 'Meal prep heavily', description: 'Cook once, eat several days' },
] as const;

export function DietStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const form = useStepForm<DietValues>(dietSchema, {
    dietType: draft.dietType,
    mealsPerDay: draft.mealsPerDay ?? 3,
    mealPrepPreference: draft.mealPrepPreference ?? 'some',
    maxCookMinutes: draft.maxCookMinutes ?? 30,
  } as never);

  const submit = form.handleSubmit((values) => {
    update(values);
    onNext();
  });

  return (
    <StepShell
      step={step}
      title="How do you eat?"
      subtitle="This shapes the recipes we suggest and how we build your weekly plan."
      onContinue={submit}
      {...(onBack ? { onBack } : {})}
    >
      <Controller
        control={form.control}
        name="dietType"
        render={({ field, fieldState }) => (
          <SingleSelect
            label="Diet"
            options={DIET_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="mealsPerDay"
        render={({ field }) => (
          <Stepper
            label="Meals per day"
            value={field.value ?? 3}
            min={2}
            max={6}
            suffix="meals"
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={form.control}
        name="maxCookMinutes"
        render={({ field }) => (
          <Stepper
            label="Time you want to spend cooking"
            value={field.value ?? 30}
            min={10}
            max={90}
            step={5}
            suffix="min"
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={form.control}
        name="mealPrepPreference"
        render={({ field, fieldState }) => (
          <SingleSelect
            label="Meal prep"
            options={PREP_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />
    </StepShell>
  );
}
