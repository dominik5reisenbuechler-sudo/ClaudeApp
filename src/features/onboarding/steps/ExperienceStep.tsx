import { Controller } from 'react-hook-form';

import { SingleSelect } from '../controls';
import { useOnboardingDraft } from '../draft';
import { experienceSchema } from '../schema';
import type { ExperienceValues } from '../schema';
import { StepShell } from '../StepShell';
import { errorMessage, useStepForm } from '../useStepForm';
import type { StepScreenProps } from './types';

const EXPERIENCE_OPTIONS = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'Under a year of consistent lifting, or coming back after a long break',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'One to five years, familiar with the main lifts, progress has slowed',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Five years or more of consistent training; gains come slowly and deliberately',
  },
] as const;

const LOCATION_OPTIONS = [
  { value: 'commercial_gym', label: 'Commercial gym', description: 'Full range of equipment' },
  { value: 'home_gym', label: 'Home gym', description: 'Barbell, rack and some dumbbells' },
  { value: 'minimal_equipment', label: 'Minimal equipment', description: 'Dumbbells or bands' },
  { value: 'bodyweight', label: 'Bodyweight only', description: 'No equipment at all' },
] as const;

export function ExperienceStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const form = useStepForm<ExperienceValues>(experienceSchema, {
    experience: draft.experience,
    trainingLocation: draft.trainingLocation,
  } as never);

  const submit = form.handleSubmit((values) => {
    update(values);
    onNext();
  });

  return (
    <StepShell
      step={step}
      title="Your training background"
      subtitle="Experience changes how fast you can add muscle, and therefore how large a surplus is worth running."
      onContinue={submit}
      {...(onBack ? { onBack } : {})}
    >
      <Controller
        control={form.control}
        name="experience"
        render={({ field, fieldState }) => (
          <SingleSelect
            label="Training experience"
            options={EXPERIENCE_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />

      <Controller
        control={form.control}
        name="trainingLocation"
        render={({ field, fieldState }) => (
          <SingleSelect
            label="Where do you train?"
            options={LOCATION_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            {...(errorMessage(fieldState.error) ? { error: errorMessage(fieldState.error) } : {})}
          />
        )}
      />
    </StepShell>
  );
}
