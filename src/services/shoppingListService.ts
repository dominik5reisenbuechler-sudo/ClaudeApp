import { getSupabase } from '@/lib/supabase';
import type { PantryEntry, PlannedIngredient, ShoppingListLine } from '@/domain/nutrition/shoppingList';
import type { FullMealPlan } from './mealPlanService';
import type {
  IngredientRow,
  PantryItemRow,
  RecipeIngredientRow,
  ShoppingListItemRow,
  ShoppingListRow,
} from '@/types/database';

/**
 * Repository for shopping lists and the pantry.
 *
 * The aggregation itself lives in `domain/nutrition/shoppingList`. This module
 * only gathers the inputs (planned recipes → their ingredients, scaled by
 * servings) and persists the result.
 */

/**
 * Every ingredient a plan requires, already scaled by the servings each meal
 * was planned at.
 *
 * Note that recipe ingredient quantities are for the recipe's *base* serving
 * count, so the scale factor is `plannedServings / recipe.servings` — the same
 * factor `scaleRecipe` uses. Ingredient rounding is deliberately NOT applied
 * here: rounding each of twenty-one meals before summing would compound the
 * error across the week.
 */
export async function fetchPlannedIngredients(
  plan: FullMealPlan,
): Promise<PlannedIngredient[]> {
  const entries = plan.days.flatMap((day) => day.entries);
  const recipeIds = [...new Set(entries.map((entry) => entry.recipe_id).filter(Boolean))];
  if (recipeIds.length === 0) return [];

  const { data, error } = await getSupabase()
    .from('recipe_ingredients')
    .select('*, ingredients(*)')
    .in('recipe_id', recipeIds as string[]);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as (RecipeIngredientRow & {
    ingredients: IngredientRow | null;
  })[];

  const byRecipe = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byRecipe.get(row.recipe_id) ?? [];
    list.push(row);
    byRecipe.set(row.recipe_id, list);
  }

  const planned: PlannedIngredient[] = [];

  for (const entry of entries) {
    if (!entry.recipe_id || !entry.recipe) continue;
    const ingredients = byRecipe.get(entry.recipe_id) ?? [];
    const baseServings = entry.recipe.servings || 1;
    const factor = Number(entry.servings) / baseServings;

    for (const row of ingredients) {
      if (!row.ingredients) continue;
      planned.push({
        ingredientId: row.ingredient_id,
        name: row.ingredients.name,
        category: row.ingredients.category,
        // Fixed ingredients (a pinch of salt, pan oil) do not scale — the same
        // rule the recipe view applies.
        quantity: Number(row.quantity) * (row.is_scalable ? factor : 1),
        unit: row.unit,
        isOptional: row.is_optional,
      });
    }
  }

  return planned;
}

export async function fetchPantry(userId: string): Promise<PantryEntry[]> {
  const { data, error } = await getSupabase()
    .from('pantry_items')
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: PantryItemRow) => ({
    ingredientId: row.ingredient_id,
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    alwaysInStock: row.always_in_stock,
  }));
}

export interface FullShoppingList extends ShoppingListRow {
  items: ShoppingListItemRow[];
}

export async function fetchShoppingListForPlan(
  mealPlanId: string,
): Promise<FullShoppingList | null> {
  const { data, error } = await getSupabase()
    .from('shopping_lists')
    .select('*, shopping_list_items(*)')
    .eq('meal_plan_id', mealPlanId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const raw = data as unknown as ShoppingListRow & {
    shopping_list_items: ShoppingListItemRow[];
  };
  return {
    ...raw,
    items: raw.shopping_list_items
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}

/**
 * Write an aggregated list, replacing any previous one for the plan.
 *
 * Regenerating discards tick state, which is why it is an explicit action in
 * the UI rather than something that happens whenever the plan changes: nobody
 * wants their half-shopped list reset while they are in the shop.
 */
export async function saveShoppingList(
  userId: string,
  mealPlanId: string,
  lines: readonly ShoppingListLine[],
): Promise<FullShoppingList> {
  const supabase = getSupabase();

  const existing = await fetchShoppingListForPlan(mealPlanId);
  if (existing) {
    const { error } = await supabase.from('shopping_lists').delete().eq('id', existing.id);
    if (error) throw new Error(error.message);
  }

  const { data: list, error: listError } = await supabase
    .from('shopping_lists')
    .insert({ user_id: userId, meal_plan_id: mealPlanId })
    .select('*')
    .single();
  if (listError) throw new Error(listError.message);
  if (!list) throw new Error('Creating the shopping list returned no row');

  if (lines.length > 0) {
    const { error } = await supabase.from('shopping_list_items').insert(
      lines.map((line, index) => ({
        shopping_list_id: list.id,
        ingredient_id: line.ingredientId,
        display_name: line.name,
        category: line.category,
        quantity: line.quantity,
        unit: line.unit,
        covered_by_pantry: line.coveredByPantry,
        sort_order: index,
      })),
    );
    if (error) throw new Error(error.message);
  }

  const saved = await fetchShoppingListForPlan(mealPlanId);
  if (!saved) throw new Error('Shopping list was saved but could not be read back');
  return saved;
}

export async function setShoppingItemChecked(
  itemId: string,
  isChecked: boolean,
): Promise<void> {
  const { error } = await getSupabase()
    .from('shopping_list_items')
    .update({ is_checked: isChecked })
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function upsertPantryItem(
  userId: string,
  ingredientId: string,
  patch: { quantity: number | null; unit: string | null; alwaysInStock: boolean },
): Promise<void> {
  const { error } = await getSupabase().from('pantry_items').upsert(
    {
      user_id: userId,
      ingredient_id: ingredientId,
      quantity: patch.quantity,
      unit: patch.unit,
      always_in_stock: patch.alwaysInStock,
    },
    { onConflict: 'user_id,ingredient_id' },
  );
  if (error) throw new Error(error.message);
}

export async function removePantryItem(userId: string, ingredientId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('pantry_items')
    .delete()
    .eq('user_id', userId)
    .eq('ingredient_id', ingredientId);
  if (error) throw new Error(error.message);
}
