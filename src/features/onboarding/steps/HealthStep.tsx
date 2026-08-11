import { Controller } from 'react-hook-form';

import { ToggleRow } from '../controls';
import { useOnboardingDraft } from '../draft';
import { healthSchema } from '../schema';
import type { HealthValues } from '../schema';
import { StepShell } from '../StepShell';
import { errorMessage, useStepForm } from '../useStepForm';
import type { StepScreenProps } from './types';
import { Callout, Input } from '@/components/ui';

/**
 * Health screening.
 *
 * These answers drive `src/domain/nutrition/safety.ts`, which can override the
 * user's chosen goal. The copy says so plainly — a screening question that
 * quietly changes the outcome is worse than one that explains itself.
 */
export function HealthStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const form = useStepForm<HealthValues>(healthSchema, {
    isPregnantOrBreastfeeding: draft.isPregnantOrBreastfeeding ?? false,
    hasMedicalCondition: draft.hasMedicalCondition ?? false,
    medicalConditionNotes: draft.medicalConditionNotes ?? '',
    injuryNotes: draft.injuryNotes ?? '',
    eatingDisorderRisk: draft.eatingDisorderRisk ?? false,
    reportsAcuteSymptoms: draft.reportsAcuteSymptoms ?? false,
  } as never);

  const hasMedicalCondition = form.watch('hasMedicalCondition');

  const submit = form.handleSubmit((values) => {
    update(values);
    onNext();
  });

  return (
    <StepShell
      step={step}
      title="A few health questions"
      subtitle="These change what we are willing to recommend. Answer honestly — nothing here is shared with anyone."
      onContinue={submit}
      {...(onBack ? { onBack } : {})}
    >
      <Controller
        control={form.control}
        name="isPregnantOrBreastfeeding"
        render={({ field }) => (
          <ToggleRow
            label="Are you pregnant or breastfeeding?"
            description="If yes, we will not set a calorie deficit."
            value={field.value ?? false}
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={form.control}
        name="eatingDisorderRisk"
        render={({ field }) => (
          <ToggleRow
            label="Do you have a current or past eating disorder?"
            description="If yes, we will not set a weight-loss target, and we will keep the focus on training and protein rather than restriction."
            value={field.value ?? false}
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={form.control}
        name="hasMedicalCondition"
        render={({ field }) => (
          <ToggleRow
            label="Any medical condition we should know about?"
            description="Diabetes, thyroid or heart conditions, and anything else affecting diet or exercise."
            value={field.value ?? false}
            onChange={field.onChange}
          />
        )}
      />

      {hasMedicalCondition ? (
        <Controller
          control={form.control}
          name="medicalConditionNotes"
          render={({ field, fieldState }) => (
            <Input
              label="Anything you would like to note"
              value={field.value ?? ''}
              onChangeText={field.onChange}
              multiline
              hint="Optional. We cannot account for medical needs — please check your targets with your doctor."
              {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
            />
          )}
        />
      ) : null}

      <Controller
        control={form.control}
        name="reportsAcuteSymptoms"
        render={({ field }) => (
          <ToggleRow
            label="Chest pain, dizziness or fainting during exercise?"
            description="If yes, please speak to a doctor before starting a programme."
            value={field.value ?? false}
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={form.control}
        name="injuryNotes"
        render={({ field, fieldState }) => (
          <Input
            label="Injuries or movements to avoid (optional)"
            placeholder="e.g. left shoulder — no overhead pressing"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            multiline
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Callout tone="warning" title="If in doubt, ask a professional">
        This app gives general fitness guidance. It cannot diagnose anything, and it is not a
        substitute for advice from your doctor or a registered dietitian.
      </Callout>
    </StepShell>
  );
}
