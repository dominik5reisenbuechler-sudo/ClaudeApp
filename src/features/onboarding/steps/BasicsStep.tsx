import { Controller } from 'react-hook-form';

import { SingleSelect } from '../controls';
import { useOnboardingDraft } from '../draft';
import { basicsSchema } from '../schema';
import type { BasicsValues } from '../schema';
import { StepShell } from '../StepShell';
import { errorMessage, useStepForm } from '../useStepForm';
import type { StepScreenProps } from './types';
import { Input, NumberInput } from '@/components/ui';

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

const UNIT_OPTIONS = [
  { value: 'metric', label: 'Metric', description: 'kg, cm' },
  { value: 'imperial', label: 'Imperial', description: 'lb, ft/in' },
] as const;

export function BasicsStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const form = useStepForm<BasicsValues>(basicsSchema, {
    displayName: draft.displayName ?? '',
    birthDate: draft.birthDate ?? '',
    sex: draft.sex,
    heightCm: draft.heightCm,
    unitSystem: draft.unitSystem ?? 'metric',
  } as never);

  const submit = form.handleSubmit((values) => {
    update(values);
    onNext();
  });

  return (
    <StepShell
      step={step}
      title="About you"
      subtitle="Age, sex and height feed the equation we use to estimate your energy needs."
      onContinue={submit}
      {...(onBack ? { onBack } : {})}
    >
      <Controller
        control={form.control}
        name="displayName"
        render={({ field, fieldState }) => (
          <Input
            label="What should we call you?"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            autoCapitalize="words"
            autoComplete="name"
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="birthDate"
        render={({ field, fieldState }) => (
          <Input
            label="Date of birth"
            placeholder="YYYY-MM-DD"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            hint="We use this to work out your age, which changes your energy needs."
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="sex"
        render={({ field, fieldState }) => (
          <SingleSelect
            label="Sex"
            options={SEX_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="heightCm"
        render={({ field, fieldState }) => (
          <NumberInput
            label="Height"
            suffix="cm"
            value={field.value ?? null}
            onChangeValue={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="unitSystem"
        render={({ field }) => (
          <SingleSelect
            label="Units"
            options={UNIT_OPTIONS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </StepShell>
  );
}
