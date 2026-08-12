import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Callout, Input, Text } from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import { useSaveMealFromEntries } from '@/hooks/useSavedMeals';
import { useTheme } from '@/theme/ThemeProvider';
import type { FoodEntryRow } from '@/types/database';
import type { MealType } from '@/types/domain';

interface SaveMealSheetProps {
  visible: boolean;
  onClose: () => void;
  mealType: MealType;
  entries: readonly FoodEntryRow[];
}

/**
 * Name and save a logged meal for reuse.
 *
 * Quick-adds and recipe entries cannot be included (they have no gram-based
 * food behind them); the sheet says so up front rather than silently saving
 * less than the user sees on screen.
 */
export function SaveMealSheet({ visible, onClose, mealType, entries }: SaveMealSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Save as a meal">
      {visible ? <SheetBody onClose={onClose} mealType={mealType} entries={entries} /> : null}
    </BottomSheet>
  );
}

function SheetBody({ onClose, mealType, entries }: Omit<SaveMealSheetProps, 'visible'>) {
  const theme = useTheme();
  const saveMeal = useSaveMealFromEntries();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const savable = entries.filter((entry) => entry.food_id !== null && entry.unit === 'g');
  const skipped = entries.length - savable.length;

  const handleSave = async () => {
    if (name.trim().length === 0) {
      setError('Give the meal a name');
      return;
    }
    setError(null);
    try {
      await saveMeal.mutateAsync({ name, mealType, entries });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Please try again.');
    }
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Text variant="caption" tone="secondary">
        {`Saves the ${savable.length} ${savable.length === 1 ? 'food' : 'foods'} in ${MEAL_LABELS[
          mealType
        ].toLowerCase()} so you can log them all again with one tap.`}
      </Text>

      {skipped > 0 ? (
        <Callout tone="info">
          {`${skipped} ${skipped === 1 ? 'entry' : 'entries'} (quick adds or recipes) cannot be included — only foods logged by weight.`}
        </Callout>
      ) : null}

      <Input
        label="Name"
        placeholder="My usual breakfast"
        value={name}
        onChangeText={(next) => {
          setName(next);
          setError(null);
        }}
        autoFocus
      />

      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}

      <Button label="Save meal" loading={saveMeal.isPending} onPress={() => void handleSave()} />
    </View>
  );
}
