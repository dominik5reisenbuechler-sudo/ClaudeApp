import { Controller } from 'react-hook-form';

import { MultiSelect } from '../controls';
import { useOnboardingDraft } from '../draft';
import { scheduleSchema } from '../schema';
import type { ScheduleValues } from '../schema';
import { StepShell } from '../StepShell';
import { errorMessage, useStepForm } from '../useStepForm';
import type { StepScreenProps } from './types';
import { Callout, Stepper } from '@/components/ui';

const WEEKDAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
] as const;

/** Guidance shown for the chosen number of days, per SCIENTIFIC_RULES.md §4.8. */
const SPLIT_HINTS: Record<number, string> = {
  2: 'Two days works best as two full-body sessions, so every muscle is still trained twice a week.',
  3: 'Three days suits full body ×3, or an upper/lower/full rotation.',
  4: 'Four days is a natural upper/lower split — each muscle trained twice a week.',
  5: 'Five days lets us give priority muscles a third exposure without crowding recovery.',
  6: 'Six days usually means push/pull/legs twice over. It only pays off if recovery and sleep are good.',
};

export function ScheduleStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const form = useStepForm<ScheduleValues>(scheduleSchema, {
    trainingDaysPerWeek: draft.trainingDaysPerWeek ?? 4,
    preferredTrainingDays: draft.preferredTrainingDays ?? [],
    sessionMinutes: draft.sessionMinutes ?? 60,
  } as never);

  const daysPerWeek = form.watch('trainingDaysPerWeek') ?? 4;

  const submit = form.handleSubmit((values) => {
    update(values);
    onNext();
  });

  return (
    <StepShell
      step={step}
      title="How often can you train?"
      subtitle="Be honest rather than optimistic — a plan you follow beats a better plan you skip."
      onContinue={submit}
      {...(onBack ? { onBack } : {})}
    >
      <Controller
        control={form.control}
        name="trainingDaysPerWeek"
        render={({ field }) => (
          <Stepper
            label="Training days per week"
            value={field.value ?? 4}
            min={2}
            max={6}
            suffix="days"
            onChange={field.onChange}
          />
        )}
      />

      {SPLIT_HINTS[daysPerWeek] ? <Callout tone="info">{SPLIT_HINTS[daysPerWeek]}</Callout> : null}

      <Controller
        control={form.control}
        name="sessionMinutes"
        render={({ field }) => (
          <Stepper
            label="Time available per session"
            value={field.value ?? 60}
            min={20}
            max={120}
            step={10}
            suffix="min"
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={form.control}
        name="preferredTrainingDays"
        render={({ field, fieldState }) => (
          <MultiSelect
            label="Preferred days (optional)"
            options={WEEKDAYS}
            values={(field.value ?? []).map(String)}
            onChange={(values) => field.onChange(values.map(Number))}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />
    </StepShell>
  );
}
