import { Controller } from 'react-hook-form';

import { MultiSelect } from '../controls';
import { useOnboardingDraft } from '../draft';
import { equipmentSchema } from '../schema';
import type { EquipmentValues } from '../schema';
import { StepShell } from '../StepShell';
import { errorMessage, useStepForm } from '../useStepForm';
import type { StepScreenProps } from './types';
import { Callout } from '@/components/ui';
import type { EquipmentId } from '@/types/domain';

const EQUIPMENT_OPTIONS: readonly { value: EquipmentId; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'cable', label: 'Cables' },
  { value: 'machine', label: 'Machines' },
  { value: 'smith_machine', label: 'Smith machine' },
  { value: 'kettlebell', label: 'Kettlebells' },
  { value: 'resistance_band', label: 'Bands' },
  { value: 'pull_up_bar', label: 'Pull-up bar' },
  { value: 'dip_station', label: 'Dip station' },
  { value: 'bench', label: 'Bench' },
  { value: 'bodyweight', label: 'Bodyweight only' },
];

export function EquipmentStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const form = useStepForm<EquipmentValues>(equipmentSchema, {
    availableEquipment: draft.availableEquipment ?? [],
  } as never);

  const submit = form.handleSubmit((values) => {
    update(values);
    onNext();
  });

  return (
    <StepShell
      step={step}
      title="What can you train with?"
      subtitle="We only programme exercises you can actually perform."
      onContinue={submit}
      {...(onBack ? { onBack } : {})}
    >
      <Controller
        control={form.control}
        name="availableEquipment"
        render={({ field, fieldState }) => (
          <MultiSelect
            label="Select everything you have access to"
            options={EQUIPMENT_OPTIONS}
            values={(field.value ?? []) as EquipmentId[]}
            onChange={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Callout tone="info">
        You can change this later, and swap any individual exercise for an alternative that hits
        the same muscles with the equipment you have on the day.
      </Callout>
    </StepShell>
  );
}
