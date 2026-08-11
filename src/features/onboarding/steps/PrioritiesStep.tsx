import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useOnboardingDraft } from '../draft';
import { StepShell } from '../StepShell';
import type { StepScreenProps } from './types';
import { Callout, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { MuscleId, MusclePriority } from '@/types/domain';

/**
 * Muscle priorities.
 *
 * Offered for the muscles people actually have preferences about. The full
 * eighteen-muscle model still receives volume; asking the user to rank all of
 * them would be tedious and would not improve the programme.
 */
const PRIORITISABLE: readonly { id: MuscleId; label: string }[] = [
  { id: 'chest', label: 'Chest' },
  { id: 'lats', label: 'Back (lats)' },
  { id: 'upper_back', label: 'Upper back' },
  { id: 'side_delts', label: 'Side delts' },
  { id: 'rear_delts', label: 'Rear delts' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'quads', label: 'Quads' },
  { id: 'hamstrings', label: 'Hamstrings' },
  { id: 'glutes', label: 'Glutes' },
  { id: 'calves', label: 'Calves' },
  { id: 'abs', label: 'Abs' },
];

const MAX_HIGH_PRIORITY = 3;

export function PrioritiesStep({ step, onNext, onBack }: StepScreenProps) {
  const theme = useTheme();
  const { draft, update } = useOnboardingDraft();

  const [priorities, setPriorities] = useState<Partial<Record<MuscleId, MusclePriority>>>(
    (draft.musclePriorities ?? {}) as Partial<Record<MuscleId, MusclePriority>>,
  );

  const highCount = Object.values(priorities).filter((value) => value === 3).length;

  const cycle = (id: MuscleId) => {
    setPriorities((current) => {
      const next = (((current[id] ?? 0) + 1) % 4) as MusclePriority;
      // Cap the number of top-priority muscles: recovery is finite, and marking
      // everything as a priority is the same as marking nothing.
      if (next === 3 && highCount >= MAX_HIGH_PRIORITY && current[id] !== 3) {
        return { ...current, [id]: 0 };
      }
      return { ...current, [id]: next };
    });
  };

  const handleContinue = () => {
    update({ musclePriorities: priorities });
    onNext();
  };

  return (
    <StepShell
      step={step}
      title="Anything you want to prioritise?"
      subtitle="Tap to cycle from no emphasis up to three stars. Optional — an even spread is a perfectly good plan."
      onContinue={handleContinue}
      {...(onBack ? { onBack } : {})}
    >
      <View style={{ gap: theme.spacing.sm }}>
        {PRIORITISABLE.map((muscle) => {
          const level = priorities[muscle.id] ?? 0;
          return (
            <Pressable key={muscle.id} onPress={() => cycle(muscle.id)} accessibilityRole="button">
              <Card padding="sm" tone={level > 0 ? 'accent' : 'raised'}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text variant="body" tone={level > 0 ? 'accent' : 'primary'}>
                    {muscle.label}
                  </Text>
                  <Text variant="body" tone={level > 0 ? 'accent' : 'tertiary'}>
                    {level === 0 ? '—' : '★'.repeat(level)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Callout tone="info">
        Priority muscles get somewhat more weekly sets, taken from lower-priority ones. Total
        training volume stays inside what you can recover from — you cannot prioritise everything at
        once, so we cap top priorities at {MAX_HIGH_PRIORITY}.
      </Callout>
    </StepShell>
  );
}
