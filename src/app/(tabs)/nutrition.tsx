import { Screen, ScreenHeader } from '@/components/layout';
import { EmptyState } from '@/components/ui';

/** Placeholder for phase 3. See `docs/MVP_PLAN.md`. */
export default function NutritionScreen() {
  return (
    <Screen>
      <ScreenHeader
        title="Nutrition"
        subtitle="Today, food, recipes, meal plan and shopping list."
      />
      <EmptyState
        title="Coming in phase 3"
        message="Food logging, barcode scanning and the recipe system build on the calorie and macro engine that is already in place and tested — your targets are real numbers derived from your own data."
      />
    </Screen>
  );
}
