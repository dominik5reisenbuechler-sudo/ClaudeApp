import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/layout';
import { Callout, Card, ErrorState, LoadingState, MacroProgress, Text } from '@/components/ui';
import {
  MEAL_LABELS,
  NUTRIENT_LABELS,
  remainingAgainst,
  totalsByMeal,
  totalsFor,
} from '@/domain/nutrition/dailyTotals';
import { MealSection } from '@/features/nutrition/MealSection';
import { NutritionSubNav } from '@/features/nutrition/NutritionSubNav';
import { QuickAddSheet } from '@/features/nutrition/QuickAddSheet';
import { SaveMealSheet } from '@/features/nutrition/SaveMealSheet';
import { useDeleteFoodEntry, useFoodEntries, toLoggedEntries } from '@/hooks/useNutrition';
import { useActiveTarget } from '@/hooks/useProfile';
import { useTheme } from '@/theme/ThemeProvider';
import { MEAL_TYPES } from '@/types/domain';
import type { MealType } from '@/types/domain';
import { todayIsoDate } from '@/utils/date';

/**
 * Nutrition → Today.
 *
 * Totals are computed by `totalsFor`, which skips unknown nutrients rather than
 * counting them as zero. Where that happens the screen says so explicitly: a
 * protein total that is a lower bound must not look like a precise one.
 */
export default function NutritionTodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const today = todayIsoDate();

  const target = useActiveTarget();
  const entries = useFoodEntries(today);
  const deleteEntry = useDeleteFoodEntry();

  const [quickAddMeal, setQuickAddMeal] = useState<MealType | null>(null);
  const [saveMealFor, setSaveMealFor] = useState<MealType | null>(null);

  const rows = useMemo(() => entries.data ?? [], [entries.data]);
  const logged = useMemo(() => toLoggedEntries(rows), [rows]);
  const totals = useMemo(() => totalsFor(logged), [logged]);
  const byMeal = useMemo(() => totalsByMeal(logged), [logged]);

  const remaining = useMemo(() => {
    if (!target.data) return null;
    return remainingAgainst(totals, {
      energyKcal: target.data.energy_kcal,
      proteinG: target.data.protein_g,
      carbsG: target.data.carbs_g,
      fatG: target.data.fat_g,
      fiberG: target.data.fiber_g,
    });
  }, [totals, target.data]);

  if (target.isLoading || entries.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (target.isError || entries.isError) {
    return (
      <Screen>
        <ErrorState
          message="We could not load today's food log."
          onRetry={() => {
            void target.refetch();
            void entries.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader eyebrow="Nutrition" title="Today" />
      <NutritionSubNav active="today" />

      {target.data ? (
        <Card>
          <View style={{ gap: theme.spacing.lg }}>
            <MacroProgress
              kind="energy"
              label="Calories"
              consumed={totals.energyKcal}
              target={target.data.energy_kcal}
              unit="kcal"
            />
            <MacroProgress
              kind="protein"
              label="Protein"
              consumed={totals.proteinG}
              target={target.data.protein_g}
            />
            <MacroProgress
              kind="carbs"
              label="Carbs"
              consumed={totals.carbsG}
              target={target.data.carbs_g}
            />
            <MacroProgress
              kind="fat"
              label="Fat"
              consumed={totals.fatG}
              target={target.data.fat_g}
            />
            <MacroProgress
              kind="fiber"
              label="Fibre"
              consumed={totals.fiberG}
              target={target.data.fiber_g}
            />
          </View>
        </Card>
      ) : (
        <Callout tone="warning" title="No targets yet">
          Complete onboarding from your profile to get daily targets.
        </Callout>
      )}

      {totals.incompleteNutrients.length > 0 ? (
        <Callout tone="info" title="Some totals are incomplete">
          {`At least one thing you logged has no ${totals.incompleteNutrients
            .map((key) => NUTRIENT_LABELS[key])
            .join(' or ')} value, so those totals are a lower bound rather than an exact figure. We leave unknown values blank instead of counting them as zero.`}
        </Callout>
      ) : null}

      {remaining && remaining.overBy.energyKcal ? (
        <Callout tone="warning">
          {`You are ${Math.abs(Math.round(remaining.energyKcal))} kcal over target for today. One day rarely matters — the weekly average is what moves your weight.`}
        </Callout>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        {MEAL_TYPES.map((meal) => (
          <MealSection
            key={meal}
            mealType={meal}
            entries={rows.filter((row) => row.meal_type === meal)}
            totals={byMeal[meal]}
            onAdd={() => router.push(`/nutrition/add?meal=${meal}`)}
            onRemove={(entryId) => void deleteEntry.mutateAsync(entryId)}
            onSaveAsMeal={() => setSaveMealFor(meal)}
          />
        ))}
      </View>

      <Card padding="md" onPress={() => setQuickAddMeal('snack')}>
        <Text variant="caption" tone="accent">
          Quick add calories without a food →
        </Text>
      </Card>

      <Text variant="caption" tone="tertiary">
        {`Logging into ${MEAL_LABELS.snack.toLowerCase()} by default — you can pick a meal from any section above.`}
      </Text>

      <QuickAddSheet
        visible={quickAddMeal !== null}
        mealType={quickAddMeal ?? 'snack'}
        loggedOn={today}
        onClose={() => setQuickAddMeal(null)}
      />

      <SaveMealSheet
        visible={saveMealFor !== null}
        mealType={saveMealFor ?? 'snack'}
        entries={rows.filter((row) => row.meal_type === saveMealFor)}
        onClose={() => setSaveMealFor(null)}
      />
    </Screen>
  );
}
