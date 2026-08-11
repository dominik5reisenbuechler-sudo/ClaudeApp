import { Screen, ScreenHeader } from '@/components/layout';
import { EmptyState } from '@/components/ui';
import { NutritionSubNav } from '@/features/nutrition/NutritionSubNav';

/** Placeholder for phase 5. See `docs/MVP_PLAN.md`. */
export default function ShoppingListScreen() {
  return (
    <Screen>
      <ScreenHeader eyebrow="Nutrition" title="Shopping List" />
      <NutritionSubNav active="shopping-list" />
      <EmptyState
        title="Coming in phase 5"
        message="Generated from your weekly plan, with identical ingredients aggregated and units normalised. The unit-conversion module that does the aggregating is already written and tested."
      />
    </Screen>
  );
}
