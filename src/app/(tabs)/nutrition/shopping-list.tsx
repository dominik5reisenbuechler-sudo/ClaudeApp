import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import {
  Button,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  Text,
} from '@/components/ui';
import { planPackaging } from '@/domain/nutrition/packaging';
import {
  CATEGORY_LABELS,
  completionSummary,
  groupByCategory,
} from '@/domain/nutrition/shoppingList';
import type { ShoppingListLine } from '@/domain/nutrition/shoppingList';
import { NutritionSubNav } from '@/features/nutrition/NutritionSubNav';
import {
  useGenerateShoppingList,
  useMealPlan,
  usePackSizes,
  useShoppingList,
  useToggleShoppingItem,
  weekStartFor,
} from '@/hooks/useMealPlan';
import { useTheme } from '@/theme/ThemeProvider';
import type { ShoppingListItemRow } from '@/types/database';

/**
 * The shopping list.
 *
 * Generated from the week's plan, grouped by aisle, with a completion readout.
 * Regeneration is deliberately an explicit action: the list is a document you
 * take to a shop, and nobody wants their ticks reset because the plan changed
 * while they were in the aisle.
 */
export default function ShoppingListScreen() {
  const theme = useTheme();
  const weekStart = weekStartFor();

  const plan = useMealPlan(weekStart);
  const list = useShoppingList(plan.data?.id ?? null);
  const generate = useGenerateShoppingList();
  const toggleItem = useToggleShoppingItem();

  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const summary = useMemo(
    () => completionSummary(items.map((item) => ({ isChecked: item.is_checked }))),
    [items],
  );
  const groups = useMemo(() => groupByCategory(items.map(toLine)), [items]);

  const ingredientIds = useMemo(
    () => items.map((item) => item.ingredient_id).filter((id): id is string => id !== null),
    [items],
  );
  const packSizes = usePackSizes(ingredientIds);

  const handleGenerate = async () => {
    if (!plan.data) return;
    setError(null);
    try {
      await generate.mutateAsync({ plan: plan.data });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build the list.');
    }
  };

  if (plan.isLoading || list.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (plan.isError || list.isError) {
    return (
      <Screen>
        <ErrorState
          message="We could not load your shopping list."
          onRetry={() => {
            void plan.refetch();
            void list.refetch();
          }}
        />
      </Screen>
    );
  }

  const planHasMeals = (plan.data?.days ?? []).some((day) => day.entries.length > 0);

  return (
    <Screen>
      <ScreenHeader eyebrow="Nutrition" title="Shopping List" />
      <NutritionSubNav active="shopping-list" />

      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}

      {!planHasMeals ? (
        <EmptyState
          title="Nothing planned this week"
          message="Add meals to your plan and we will turn them into a shopping list, with identical ingredients added together."
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No list yet"
          message="Build a shopping list from this week's plan. Identical ingredients are added together and anything in your pantry is subtracted."
          actionLabel="Build the list"
          onAction={() => void handleGenerate()}
        />
      ) : (
        <>
          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
              >
                <Text variant="label" tone="tertiary">
                  Progress
                </Text>
                <Text variant="mono">{summary.label} completed</Text>
              </View>
              <ProgressBar
                value={summary.checked}
                target={summary.total}
                showOvershoot={false}
                accessibilityLabel={`${summary.label} items completed`}
              />
              {summary.isComplete ? (
                <Text variant="caption" tone="success">
                  Everything ticked off.
                </Text>
              ) : null}
            </View>
          </Card>

          {groups.map((group) => (
            <View key={group.category}>
              <SectionHeader title={CATEGORY_LABELS[group.category]} />
              <Card padding="md">
                <View style={{ gap: theme.spacing.md }}>
                  {group.lines.map((line) => {
                    const item = items.find(
                      (candidate) =>
                        candidate.display_name === line.name && candidate.unit === line.unit,
                    );
                    if (!item) return null;
                    return (
                      <ShoppingRow
                        key={item.id}
                        item={item}
                        packSizes={
                          item.ingredient_id
                            ? packSizes.data?.get(item.ingredient_id)
                            : undefined
                        }
                        onToggle={() =>
                          void toggleItem.mutateAsync({
                            itemId: item.id,
                            isChecked: !item.is_checked,
                          })
                        }
                      />
                    );
                  })}
                </View>
              </Card>
            </View>
          ))}

          <Button
            label="Rebuild from the plan"
            variant="secondary"
            loading={generate.isPending}
            onPress={() => void handleGenerate()}
          />
          <Text variant="caption" tone="tertiary">
            Rebuilding replaces this list and clears anything you have ticked off.
          </Text>
        </>
      )}
    </Screen>
  );
}

function ShoppingRow({
  item,
  packSizes,
  onToggle,
}: {
  item: ShoppingListItemRow;
  packSizes: readonly number[] | undefined;
  onToggle: () => void;
}) {
  const theme = useTheme();

  // What to actually put in the trolley. Absent when the ingredient has no
  // known pack sizes, which is most user-added lines — better to say nothing
  // than to invent a pack size.
  const packaging = packSizes
    ? planPackaging(Number(item.quantity), item.unit, packSizes, { category: item.category })
    : null;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.is_checked }}
      accessibilityLabel={`${item.display_name}, ${item.quantity} ${item.unit}`}
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: theme.radii.sm,
          borderWidth: 2,
          borderColor: item.is_checked ? theme.colors.accent : theme.colors.borderStrong,
          backgroundColor: item.is_checked ? theme.colors.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.is_checked ? (
          <Text variant="caption" tone="onAccent">
            ✓
          </Text>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          variant="body"
          tone={item.is_checked ? 'tertiary' : 'primary'}
          style={item.is_checked ? { textDecorationLine: 'line-through' } : undefined}
        >
          {item.display_name}
        </Text>
        {item.covered_by_pantry !== null ? (
          <Text variant="caption" tone="tertiary">
            {`${Number(item.covered_by_pantry)} ${item.unit} already in your pantry`}
          </Text>
        ) : null}
        {packaging && !item.is_checked ? (
          <Text variant="caption" tone="tertiary">
            {packaging.note}
          </Text>
        ) : null}
      </View>

      <Text variant="mono" tone={item.is_checked ? 'tertiary' : 'secondary'}>
        {formatQuantity(Number(item.quantity))} {item.unit}
      </Text>
    </Pressable>
  );
}

function toLine(item: ShoppingListItemRow): ShoppingListLine {
  return {
    ingredientId: item.ingredient_id ?? item.id,
    name: item.display_name,
    category: item.category,
    quantity: Number(item.quantity),
    unit: item.unit,
    coveredByPantry: item.covered_by_pantry === null ? null : Number(item.covered_by_pantry),
    fromOptionalOnly: false,
  };
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Math.round(value * 100) / 100}`;
}
