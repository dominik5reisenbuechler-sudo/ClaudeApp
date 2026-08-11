import { Controller } from 'react-hook-form';

import { ToggleRow } from '../controls';
import { useOnboardingDraft } from '../draft';
import { bodySchema } from '../schema';
import type { BodyValues } from '../schema';
import { StepShell } from '../StepShell';
import { errorMessage, useStepForm } from '../useStepForm';
import type { StepScreenProps } from './types';
import { Callout, NumberInput } from '@/components/ui';

export function BodyStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const form = useStepForm<BodyValues>(bodySchema, {
    weightKg: draft.weightKg,
    bodyFatPercent: draft.bodyFatPercent ?? null,
    bodyFatIsMeasured: draft.bodyFatIsMeasured ?? false,
  } as never);

  const bodyFatPercent = form.watch('bodyFatPercent');

  const submit = form.handleSubmit((values) => {
    update(values);
    onNext();
  });

  return (
    <StepShell
      step={step}
      title="Your current weight"
      subtitle="This is a starting point. From here we track the trend, not the daily number."
      onContinue={submit}
      {...(onBack ? { onBack } : {})}
    >
      <Controller
        control={form.control}
        name="weightKg"
        render={({ field, fieldState }) => (
          <NumberInput
            label="Bodyweight"
            suffix="kg"
            value={field.value ?? null}
            onChangeValue={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="bodyFatPercent"
        render={({ field, fieldState }) => (
          <NumberInput
            label="Body fat (optional)"
            suffix="%"
            value={field.value ?? null}
            onChangeValue={field.onChange}
            hint="Only if you know it. Leave blank if you would be guessing."
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      {typeof bodyFatPercent === 'number' ? (
        <Controller
          control={form.control}
          name="bodyFatIsMeasured"
          render={({ field }) => (
            <ToggleRow
              label="Was that actually measured?"
              description="DEXA, a BIA scale or calipers count as measured. A visual estimate does not — we only switch to the lean-mass equation for a real measurement, because a guess would quietly shift your calorie target."
              value={field.value ?? false}
              onChange={field.onChange}
            />
          )}
        />
      ) : null}

      <Callout tone="info">
        Weigh yourself under the same conditions each time — ideally first thing in the morning,
        after the toilet, before eating. Day-to-day swings of 1–2 kg are normal and mostly water.
      </Callout>
    </StepShell>
  );
}
