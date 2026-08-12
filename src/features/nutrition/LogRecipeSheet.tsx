import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Callout, Chip, Text } from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import { scaleRecipe } from '@/domain/nutrition/recipeScaling';
import type { ScalableRecipe } from '@/domain/nutrition/recipeScaling';
import { useLogFoodEntry } from '@/hooks/useNutrition';
import { useTheme } from '@/theme/ThemeProvider';
import { MEAL_TYPES } from '@/types/domain';
import type { IsoDate, MealType } from '@/types/domain';
import { todayIsoDate } from '@/utils/date';

interface LogRecipeSheetProps {
  visible: boolean;
  onClose: () => void;
  recipeId: string;
  recipeTitle: string;
  defaultMealType: MealType;
  recipe: ScalableRecipe;
  onLogged?: () => void;
}

/** Servings a user actually eats — halves up to four portions. */
const SERVING_CHOICES = [0.5, 1, 1.5, 2, 3, 4] as const;

/**
 * Log a recipe as a food entry.
 *
 * The entry snapshot comes from `scaleRecipe`, the same function the detail
 * screen uses for its preview — one implementation, so what the user saw is
 * what gets stored. The entry keeps `recipe_id`, so history can link back even
 * after the catalogue changes.
 */
export function LogRecipeSheet({
  visible,
  onClose,
  recipeId,
  recipeTitle,
  defaultMealType,
  recipe,
  onLogged,
}: LogRecipeSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Log ${recipeTitle}`}>
      {visible ? (
        <SheetBody
          onClose={onClose}
          recipeId={recipeId}
          recipeTitle={recipeTitle}
          defaultMealType={defaultMealType}
          recipe={recipe}
          {...(onLogged ? { onLogged } : {})}
        />
      ) : null}
    </BottomSheet>
  );
}

function SheetBody({
  onClose,
  recipeId,
  recipeTitle,
  defaultMealType,
  recipe,
  onLogged,
}: Omit<LogRecipeSheetProps, 'visible'>) {
  const theme = useTheme();
  const logEntry = useLogFoodEntry();
  const today: IsoDate = todayIsoDate();

  const [servings, setServings] = useState(1);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [error, setError] = useState<string | null>(null);

  const scaled = useMemo(() => scaleRecipe(recipe, servings), [recipe, servings]);

  const handleLog = async () => {
    setError(null);
    try {
      await logEntry.mutateAsync({
        loggedOn: today,
        mealType,
        displayName: recipeTitle,
        quantity: servings,
        unit: 'serving',
        recipeId,
        energyKcal: scaled.total.energyKcal,
        proteinG: scaled.total.proteinG,
        carbsG: scaled.total.carbsG,
        fatG: scaled.total.fatG,
        fiberG: scaled.total.fiberG,
      });
      onLogged?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not log that. Please try again.');
    }
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="caption" tone="secondary">
          Servings
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {SERVING_CHOICES.map((choice) => (
            <Chip
              key={choice}
              label={`${choice}`}
              selected={servings === choice}
              onPress={() => setServings(choice)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="caption" tone="secondary">
          Which meal?
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {MEAL_TYPES.map((meal) => (
            <Chip
              key={meal}
              label={MEAL_LABELS[meal]}
              selected={mealType === meal}
              onPress={() => setMealType(meal)}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.xl }}>
        <Preview label="Calories" value={`${Math.round(scaled.total.energyKcal)} kcal`} />
        <Preview
          label="Protein"
          value={scaled.total.proteinG === null ? '—' : `${Math.round(scaled.total.proteinG)} g`}
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
        label={`Log ${servings} ${servings === 1 ? 'serving' : 'servings'}`}
        loading={logEntry.isPending}
        onPress={() => void handleLog()}
      />
    </View>
  );
}

function Preview({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="heading">{value}</Text>
    </View>
  );
}
