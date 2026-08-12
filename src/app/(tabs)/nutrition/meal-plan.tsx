import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/layout';
import {
  BottomSheet,
  Button,
  Callout,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  Text,
} from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import {
  PLAN_MODE_DESCRIPTIONS,
  PLAN_MODE_LABELS,
} from '@/domain/nutrition/mealPlanGeneration';
import { NutritionSubNav } from '@/features/nutrition/NutritionSubNav';
import { PlanDayCard } from '@/features/nutrition/PlanDayCard';
import { RecipeCard } from '@/features/nutrition/RecipeCard';
import {
  useAddPlanEntry,
  useClearWeek,
  useCopyDay,
  useEnsureMealPlan,
  useGenerateMealPlan,
  useMealPlan,
  useRemovePlanEntry,
  weekStartFor,
} from '@/hooks/useMealPlan';
import { useActiveTarget } from '@/hooks/useProfile';
import { useRecipeCatalog } from '@/hooks/useRecipes';
import { useTheme } from '@/theme/ThemeProvider';
import { PLAN_MODES } from '@/types/domain';
import type { MealType, PlanMode } from '@/types/domain';
import { addDays, fromIsoDate } from '@/utils/date';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The weekly meal planner.
 *
 * The week is built by hand, generated, or both — a generated plan is an
 * ordinary plan afterwards, editable slot by slot. Generation warnings are
 * surfaced rather than swallowed: a week that lands 20% under target should say
 * so, not look identical to one that fits.
 */
export default function MealPlanScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(
    () => weekStartFor(addDays(weekStartFor(), weekOffset * 7)),
    [weekOffset],
  );

  const plan = useMealPlan(weekStart);
  const target = useActiveTarget();
  const catalog = useRecipeCatalog();

  const ensurePlan = useEnsureMealPlan();
  const generate = useGenerateMealPlan();
  const addEntry = useAddPlanEntry();
  const removeEntry = useRemovePlanEntry();
  const copyDay = useCopyDay();
  const clearWeek = useClearWeek();

  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  const [picker, setPicker] = useState<{ dayId: string; mealType: MealType } | null>(null);
  const [copySource, setCopySource] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (mode: PlanMode) => {
    setModeSheetOpen(false);
    setError(null);
    try {
      const generated = await generate.mutateAsync({ weekStart, mode });
      setWarnings(generated.warnings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate a plan.');
    }
  };

  if (plan.isLoading || target.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (plan.isError) {
    return (
      <Screen>
        <ErrorState message="We could not load your plan." onRetry={() => void plan.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader eyebrow="Nutrition" title="Meal Plan" />
      <NutritionSubNav active="meal-plan" />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Button
          label="←"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => setWeekOffset((current) => current - 1)}
        />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="bodyStrong">{formatWeekRange(weekStart)}</Text>
          <Text variant="caption" tone="tertiary">
            {weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : `Week ${weekOffset > 0 ? '+' : ''}${weekOffset}`}
          </Text>
        </View>
        <Button
          label="→"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => setWeekOffset((current) => current + 1)}
        />
      </View>

      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}

      {warnings.length > 0 ? (
        <Callout tone="warning" title="Worth knowing about this plan">
          {warnings.join('\n\n')}
        </Callout>
      ) : null}

      {!plan.data ? (
        <EmptyState
          title="No plan for this week yet"
          message="Build it meal by meal, or let us generate a week that fits your targets."
          actionLabel="Start a plan"
          onAction={() => void ensurePlan.mutateAsync(weekStart)}
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button
              label={plan.data.generated_at ? 'Regenerate' : 'Auto-generate'}
              size="sm"
              fullWidth={false}
              loading={generate.isPending}
              disabled={!generate.isReady}
              onPress={() => setModeSheetOpen(true)}
            />
            <Button
              label="Shopping list"
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={() => router.push('/nutrition/shopping-list')}
            />
            <Button
              label="Clear"
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={() => {
                if (!plan.data) return;
                setWarnings([]);
                void clearWeek.mutateAsync(plan.data);
              }}
            />
          </View>

          {plan.data.mode ? (
            <Text variant="caption" tone="tertiary">
              {`Generated in ${PLAN_MODE_LABELS[plan.data.mode].toLowerCase()} mode. Edit any slot — it stays your plan.`}
            </Text>
          ) : null}

          <View style={{ gap: theme.spacing.md }}>
            {plan.data.days.map((day) => (
              <PlanDayCard
                key={day.id}
                day={day}
                targetKcal={target.data?.energy_kcal ?? null}
                onAdd={(mealType) => setPicker({ dayId: day.id, mealType })}
                onRemove={(entryId) => void removeEntry.mutateAsync(entryId)}
                onOpenRecipe={(recipeId) => router.push(`/nutrition/recipe/${recipeId}`)}
                onCopy={() => setCopySource(day.day_index)}
              />
            ))}
          </View>
        </>
      )}

      {/* Mode picker */}
      <BottomSheet
        visible={modeSheetOpen}
        onClose={() => setModeSheetOpen(false)}
        title="How should we build the week?"
      >
        {modeSheetOpen ? (
          <ScrollView style={{ maxHeight: 420 }}>
            <View style={{ gap: theme.spacing.sm }}>
              {PLAN_MODES.map((mode) => (
                <Card key={mode} padding="sm" onPress={() => void handleGenerate(mode)}>
                  <Text variant="bodyStrong">{PLAN_MODE_LABELS[mode]}</Text>
                  <Text variant="caption" tone="secondary">
                    {PLAN_MODE_DESCRIPTIONS[mode]}
                  </Text>
                </Card>
              ))}
            </View>
          </ScrollView>
        ) : null}
      </BottomSheet>

      {/* Recipe picker for one slot */}
      <BottomSheet
        visible={picker !== null}
        onClose={() => setPicker(null)}
        title={picker ? `Add to ${MEAL_LABELS[picker.mealType].toLowerCase()}` : ''}
      >
        {picker ? (
          <ScrollView style={{ maxHeight: 420 }}>
            <View style={{ gap: theme.spacing.sm }}>
              {(catalog.data ?? [])
                .filter((recipe) => recipe.meal_type === picker.mealType)
                .map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    onPress={() => {
                      void addEntry.mutateAsync({
                        mealPlanDayId: picker.dayId,
                        mealType: picker.mealType,
                        recipeId: recipe.id,
                        servings: 1,
                      });
                      setPicker(null);
                    }}
                  />
                ))}
            </View>
          </ScrollView>
        ) : null}
      </BottomSheet>

      {/* Copy-day target picker */}
      <BottomSheet
        visible={copySource !== null}
        onClose={() => setCopySource(null)}
        title="Copy this day to…"
      >
        {copySource !== null && plan.data ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="caption" tone="secondary">
              The target day&apos;s meals are replaced.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {WEEKDAY_SHORT.map((label, dayIndex) => (
                <Chip
                  key={label}
                  label={label}
                  disabled={dayIndex === copySource}
                  onPress={() => {
                    if (!plan.data) return;
                    void copyDay.mutateAsync({
                      plan: plan.data,
                      fromDayIndex: copySource,
                      toDayIndex: dayIndex,
                    });
                    setCopySource(null);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function formatWeekRange(weekStart: string): string {
  const start = fromIsoDate(weekStart);
  const end = fromIsoDate(addDays(weekStart, 6));
  const format = (date: Date) =>
    date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${format(start)} – ${format(end)}`;
}
