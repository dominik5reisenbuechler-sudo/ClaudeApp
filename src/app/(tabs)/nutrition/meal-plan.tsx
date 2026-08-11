import { Screen, ScreenHeader } from '@/components/layout';
import { EmptyState } from '@/components/ui';
import { NutritionSubNav } from '@/features/nutrition/NutritionSubNav';

/** Placeholder for phase 5. See `docs/MVP_PLAN.md`. */
export default function MealPlanScreen() {
  return (
    <Screen>
      <ScreenHeader eyebrow="Nutrition" title="Meal Plan" />
      <NutritionSubNav active="meal-plan" />
      <EmptyState
        title="Coming in phase 5"
        message="A week of meals you can build by hand or have generated to fit your targets, with a meal-prep mode that deliberately reuses ingredients across days."
      />
    </Screen>
  );
}
