import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Callout, NumberInput, Text } from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import { nutritionForGrams, validateFoodData, FOOD_DATA_ISSUE_MESSAGES } from '@/domain/nutrition/foodMath';
import type { FoodNutrition } from '@/domain/nutrition/foodMath';
import { useLogFoodEntry } from '@/hooks/useNutrition';
import { useTheme } from '@/theme/ThemeProvider';
import type { FoodRow } from '@/types/database';
import type { IsoDate, MealType } from '@/types/domain';

interface LogFoodSheetProps {
  food: FoodRow | null;
  mealType: MealType;
  loggedOn: IsoDate;
  onClose: () => void;
  onLogged?: () => void;
}

/** Convert a database row to the domain's nutrition shape. */
export function toFoodNutrition(food: FoodRow): FoodNutrition {
  const num = (value: number | null): number | null => (value === null ? null : Number(value));
  return {
    caloriesPer100g: Number(food.calories_per_100g),
    proteinPer100g: num(food.protein_per_100g),
    carbsPer100g: num(food.carbs_per_100g),
    fatPer100g: num(food.fat_per_100g),
    fiberPer100g: num(food.fiber_per_100g),
  };
}

/**
 * Quantity entry with a live macro preview.
 *
 * The preview and the value that gets written come from the same call to
 * `nutritionForGrams`, so what the user approves is exactly what is stored —
 * there is no second implementation of the scaling maths to drift.
 */
export function LogFoodSheet({ food, mealType, loggedOn, onClose, onLogged }: LogFoodSheetProps) {
  return (
    <BottomSheet visible={food !== null} onClose={onClose} title={food?.name ?? ''}>
      {food ? (
        <SheetBody
          food={food}
          mealType={mealType}
          loggedOn={loggedOn}
          onClose={onClose}
          {...(onLogged ? { onLogged } : {})}
        />
      ) : null}
    </BottomSheet>
  );
}

function SheetBody({
  food,
  mealType,
  loggedOn,
  onClose,
  onLogged,
}: LogFoodSheetProps & { food: FoodRow }) {
  const theme = useTheme();
  const logEntry = useLogFoodEntry();

  const servingSize = food.serving_size === null ? null : Number(food.serving_size);
  const [grams, setGrams] = useState<number | null>(servingSize ?? 100);
  const [error, setError] = useState<string | null>(null);

  const nutrition = useMemo(() => toFoodNutrition(food), [food]);
  const issues = useMemo(() => validateFoodData(nutrition), [nutrition]);
  const preview = useMemo(
    () => (grams === null || grams <= 0 ? null : nutritionForGrams(nutrition, grams)),
    [nutrition, grams],
  );

  const handleLog = async () => {
    if (grams === null || grams <= 0) {
      setError('Enter how much you had');
      return;
    }
    if (grams > 5000) {
      setError('That is over 5 kg — please check the amount');
      return;
    }

    const computed = nutritionForGrams(nutrition, grams);
    setError(null);
    try {
      await logEntry.mutateAsync({
        loggedOn,
        mealType,
        displayName: food.name,
        quantity: grams,
        unit: 'g',
        foodId: food.id,
        ...computed,
      });
      onLogged?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not log that. Please try again.');
    }
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {food.brand ? (
        <Text variant="caption" tone="tertiary">
          {food.brand}
        </Text>
      ) : null}

      {issues.length > 0 ? (
        <Callout tone={issues.includes('missing_macros') && issues.length === 1 ? 'info' : 'warning'}>
          {issues.map((issue) => FOOD_DATA_ISSUE_MESSAGES[issue]).join('\n\n')}
        </Callout>
      ) : null}

      <NumberInput
        label="Amount"
        suffix="g"
        precision={0}
        value={grams}
        onChangeValue={(value) => {
          setGrams(value);
          setError(null);
        }}
        autoFocus
        {...(servingSize
          ? { hint: `One serving is ${servingSize} g${food.serving_unit ? ` (${food.serving_unit})` : ''}` }
          : {})}
      />

      {servingSize ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Button
            label={`1 serving`}
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => setGrams(servingSize)}
          />
          <Button
            label="100 g"
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => setGrams(100)}
          />
        </View>
      ) : null}

      {preview ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" tone="tertiary">
            That works out to
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
            <PreviewValue label="Calories" value={`${Math.round(preview.energyKcal)}`} unit="kcal" />
            <PreviewValue label="Protein" value={formatMacro(preview.proteinG)} unit="g" />
            <PreviewValue label="Carbs" value={formatMacro(preview.carbsG)} unit="g" />
            <PreviewValue label="Fat" value={formatMacro(preview.fatG)} unit="g" />
          </View>
        </View>
      ) : null}

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
        onPress={() => void handleLog()}
      />
    </View>
  );
}

function PreviewValue({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="heading">
        {value}
        {value === '—' ? '' : ` ${unit}`}
      </Text>
    </View>
  );
}

/** Unknown stays unknown on screen, rather than becoming a confident zero. */
function formatMacro(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 10) / 10}`;
}
