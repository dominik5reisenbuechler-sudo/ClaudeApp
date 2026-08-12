import { getSupabase } from '@/lib/supabase';
import type { FoodEntryRow, FoodRow, SavedMealItemRow, SavedMealRow } from '@/types/database';
import type { MealType } from '@/types/domain';

/**
 * Saved meals — "my usual breakfast" as one tap.
 *
 * A saved meal stores foods and gram quantities, not macro snapshots. When it
 * is logged, each item becomes an ordinary food entry with a fresh snapshot
 * computed from the food's *current* data. That is the correct behaviour: a
 * saved meal is a shortcut for logging foods, and if a food's data was
 * corrected since saving, the next log should use the corrected values —
 * unlike history, which must never rewrite.
 *
 * Only entries backed by a `food_id` can be saved. A quick-add has no food
 * behind it and a recipe scales by servings, not grams; both are skipped, and
 * the caller is told how many were.
 */

export interface SavedMealWithItems extends SavedMealRow {
  items: (SavedMealItemRow & { food: FoodRow })[];
}

export async function fetchSavedMeals(userId: string): Promise<SavedMealWithItems[]> {
  const { data, error } = await getSupabase()
    .from('saved_meals')
    .select('*, saved_meal_items(*, foods(*))')
    .eq('user_id', userId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as (SavedMealRow & {
    saved_meal_items: (SavedMealItemRow & { foods: FoodRow | null })[];
  })[]).map(({ saved_meal_items, ...meal }) => ({
    ...meal,
    items: saved_meal_items
      .filter((item): item is SavedMealItemRow & { foods: FoodRow } => item.foods !== null)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ foods, ...item }) => ({ ...item, food: foods })),
  }));
}

export interface SaveMealResult {
  savedMeal: SavedMealRow;
  savedCount: number;
  /** Entries that could not be included (quick-adds, recipes). */
  skippedCount: number;
}

/**
 * Save a set of logged entries as a reusable meal. Gram-based food entries
 * only; the counts in the result let the UI say what happened.
 */
export async function createSavedMealFromEntries(
  userId: string,
  name: string,
  mealType: MealType | null,
  entries: readonly FoodEntryRow[],
): Promise<SaveMealResult> {
  const supabase = getSupabase();

  const savable = entries.filter(
    (entry): entry is FoodEntryRow & { food_id: string } =>
      entry.food_id !== null && entry.unit === 'g',
  );
  if (savable.length === 0) {
    throw new Error(
      'Nothing in this meal can be saved — only foods logged by weight can go into a saved meal.',
    );
  }

  const { data: meal, error: mealError } = await supabase
    .from('saved_meals')
    .insert({ user_id: userId, name: name.trim(), meal_type: mealType })
    .select('*')
    .single();
  if (mealError) throw new Error(mealError.message);
  if (!meal) throw new Error('Saving the meal returned no row');

  const { error: itemsError } = await supabase.from('saved_meal_items').insert(
    savable.map((entry, index) => ({
      saved_meal_id: meal.id,
      food_id: entry.food_id,
      quantity_g: Number(entry.quantity),
      sort_order: index,
    })),
  );
  if (itemsError) {
    // Roll back the empty shell rather than leaving a meal with no items.
    await supabase.from('saved_meals').delete().eq('id', meal.id);
    throw new Error(itemsError.message);
  }

  return {
    savedMeal: meal,
    savedCount: savable.length,
    skippedCount: entries.length - savable.length,
  };
}

export async function deleteSavedMeal(userId: string, savedMealId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('saved_meals')
    .delete()
    .eq('id', savedMealId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
