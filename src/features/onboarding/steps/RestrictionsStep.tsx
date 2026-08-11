import { useState } from 'react';

import { MultiSelect } from '../controls';
import { useOnboardingDraft } from '../draft';
import { StepShell } from '../StepShell';
import type { StepScreenProps } from './types';
import { Callout, Input } from '@/components/ui';
import type { Allergen } from '@/types/domain';

const ALLERGEN_OPTIONS: readonly { value: Allergen; label: string }[] = [
  { value: 'milk', label: 'Milk' },
  { value: 'eggs', label: 'Eggs' },
  { value: 'fish', label: 'Fish' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'tree_nuts', label: 'Tree nuts' },
  { value: 'peanuts', label: 'Peanuts' },
  { value: 'wheat', label: 'Wheat / gluten' },
  { value: 'soy', label: 'Soy' },
  { value: 'sesame', label: 'Sesame' },
];

/** Split a comma-separated list into trimmed, non-empty entries. */
function parseList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function RestrictionsStep({ step, onNext, onBack }: StepScreenProps) {
  const { draft, update } = useOnboardingDraft();

  const [allergens, setAllergens] = useState<Allergen[]>((draft.allergens ?? []) as Allergen[]);
  const [intolerances, setIntolerances] = useState((draft.intolerances ?? []).join(', '));
  const [dislikes, setDislikes] = useState((draft.dislikedFoods ?? []).join(', '));

  const handleContinue = () => {
    update({
      allergens,
      intolerances: parseList(intolerances),
      dislikedFoods: parseList(dislikes),
    });
    onNext();
  };

  return (
    <StepShell
      step={step}
      title="Anything to avoid?"
      subtitle="Allergens are excluded outright. Dislikes are simply ranked down, so nothing gets suggested that you would not actually eat."
      onContinue={handleContinue}
      {...(onBack ? { onBack } : {})}
    >
      <MultiSelect
        label="Allergies"
        options={ALLERGEN_OPTIONS}
        values={allergens}
        onChange={setAllergens}
      />

      <Input
        label="Intolerances (optional)"
        placeholder="lactose, fructose"
        value={intolerances}
        onChangeText={setIntolerances}
        hint="Separate with commas."
      />

      <Input
        label="Foods you would rather not eat (optional)"
        placeholder="cottage cheese, olives"
        value={dislikes}
        onChangeText={setDislikes}
        hint="Separate with commas."
      />

      <Callout tone="warning" title="Always check the label">
        We exclude recipes tagged with your allergens, but ingredient data — especially from
        scanned barcodes — can be incomplete or wrong. If an allergy is severe, check packaging
        yourself every time.
      </Callout>
    </StepShell>
  );
}
