import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Callout, Input, NumberInput, Text } from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import { useLogFoodEntry } from '@/hooks/useNutrition';
import { useTheme } from '@/theme/ThemeProvider';
import type { IsoDate, MealType } from '@/types/domain';

interface QuickAddSheetProps {
  visible: boolean;
  mealType: MealType;
  loggedOn: IsoDate;
  onClose: () => void;
}

/**
 * Quick add — calories and macros typed straight in, with no food behind them.
 *
 * The escape hatch that keeps a tracking app usable in the real world: a meal
 * out, someone else's cooking, a label in a language you cannot read. Without
 * it people stop logging entirely on exactly the days that matter most for the
 * adaptive engine.
 *
 * Only energy is required. Blank macros stay blank, which surfaces on the day's
 * totals as "incomplete" rather than silently reading as zero.
 */
export function QuickAddSheet({ visible, mealType, loggedOn, onClose }: QuickAddSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Quick add">
      {visible ? <SheetBody mealType={mealType} loggedOn={loggedOn} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function SheetBody({
  mealType,
  loggedOn,
  onClose,
}: Omit<QuickAddSheetProps, 'visible'>) {
  const theme = useTheme();
  const logEntry = useLogFoodEntry();

  const [name, setName] = useState('');
  const [energyKcal, setEnergyKcal] = useState<number | null>(null);
  const [proteinG, setProteinG] = useState<number | null>(null);
  const [carbsG, setCarbsG] = useState<number | null>(null);
  const [fatG, setFatG] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (energyKcal === null || energyKcal <= 0) {
      setError('Calories are required — everything else is optional');
      return;
    }

    setError(null);
    try {
      await logEntry.mutateAsync({
        loggedOn,
        mealType,
        displayName: name.trim() || 'Quick add',
        quantity: 1,
        unit: 'entry',
        energyKcal,
        proteinG,
        carbsG,
        fatG,
        fiberG: null,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that. Please try again.');
    }
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Input
        label="What was it? (optional)"
        placeholder="Lunch at the café"
        value={name}
        onChangeText={setName}
      />

      <NumberInput
        label="Calories"
        suffix="kcal"
        precision={0}
        value={energyKcal}
        onChangeValue={(value) => {
          setEnergyKcal(value);
          setError(null);
        }}
      />

      <Text variant="caption" tone="tertiary">
        Macros are optional. Anything you leave blank stays unknown rather than counting as zero,
        and your daily totals will say they are incomplete.
      </Text>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <NumberInput
          label="Protein"
          suffix="g"
          value={proteinG}
          onChangeValue={setProteinG}
          containerStyle={{ flex: 1 }}
        />
        <NumberInput
          label="Carbs"
          suffix="g"
          value={carbsG}
          onChangeValue={setCarbsG}
          containerStyle={{ flex: 1 }}
        />
        <NumberInput
          label="Fat"
          suffix="g"
          value={fatG}
          onChangeValue={setFatG}
          containerStyle={{ flex: 1 }}
        />
      </View>

      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}

      <Button
        label={`Add to ${MEAL_LABELS[mealType].toLowerCase()}`}
        loading={logEntry.isPending}
        onPress={() => void handleAdd()}
      />
    </View>
  );
}
