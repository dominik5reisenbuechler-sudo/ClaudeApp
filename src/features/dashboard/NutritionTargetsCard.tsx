import { View } from 'react-native';

import { Card, MacroProgress, Text } from '@/components/ui';
import type { UserTargetRow } from '@/types/database';
import { useTheme } from '@/theme/ThemeProvider';

interface NutritionTargetsCardProps {
  target: UserTargetRow;
  /** `null` until food logging exists (phase 3). */
  consumed: { energyKcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number } | null;
}

/**
 * Calories and macros on the dashboard.
 *
 * With no food logging yet there is nothing to fill a progress bar with, so the
 * card shows the targets as a plain list instead. Rendering bars pinned at zero
 * would look like a user who has eaten nothing all day — indistinguishable from
 * a real, alarming state. Once `consumed` is supplied the card switches to the
 * progress form without any change at the call site.
 */
export function NutritionTargetsCard({ target, consumed }: NutritionTargetsCardProps) {
  const theme = useTheme();

  if (consumed) {
    return (
      <Card>
        <View style={{ gap: theme.spacing.lg }}>
          <MacroProgress
            kind="energy"
            label="Calories"
            consumed={consumed.energyKcal}
            target={target.energy_kcal}
            unit="kcal"
          />
          <MacroProgress
            kind="protein"
            label="Protein"
            consumed={consumed.proteinG}
            target={target.protein_g}
          />
          <MacroProgress
            kind="carbs"
            label="Carbs"
            consumed={consumed.carbsG}
            target={target.carbs_g}
          />
          <MacroProgress kind="fat" label="Fat" consumed={consumed.fatG} target={target.fat_g} />
          <MacroProgress
            kind="fiber"
            label="Fibre"
            consumed={consumed.fiberG}
            target={target.fiber_g}
          />
        </View>
      </Card>
    );
  }

  const rows = [
    { label: 'Calories', value: `${target.energy_kcal.toLocaleString('en-US')} kcal`, color: theme.colors.accent },
    { label: 'Protein', value: `${target.protein_g} g`, color: theme.colors.protein },
    { label: 'Carbs', value: `${target.carbs_g} g`, color: theme.colors.carbs },
    { label: 'Fat', value: `${target.fat_g} g`, color: theme.colors.fat },
    { label: 'Fibre', value: `${target.fiber_g} g`, color: theme.colors.fiber },
  ];

  return (
    <Card>
      <View style={{ gap: theme.spacing.lg }}>
        <Text variant="label" tone="tertiary">
          Your daily targets
        </Text>

        <View style={{ gap: theme.spacing.md }}>
          {rows.map((row) => (
            <View
              key={row.label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
            >
              <View
                style={{
                  width: 3,
                  height: 18,
                  borderRadius: 2,
                  backgroundColor: row.color,
                }}
              />
              <Text variant="body" style={{ flex: 1 }}>
                {row.label}
              </Text>
              <Text variant="mono">{row.value}</Text>
            </View>
          ))}
        </View>

        <Text variant="caption" tone="tertiary">
          Food logging arrives in the next phase. Until then these are the targets to aim for.
        </Text>
      </View>
    </Card>
  );
}
