import { getSupabase } from '@/lib/supabase';
import type { RankableRecipe } from '@/domain/nutrition/recipeRanking';
import type { ScalableRecipe } from '@/domain/nutrition/recipeScaling';
import type {
  IngredientRow,
  RecipeIngredientRow,
  RecipeInstructionRow,
  RecipeRow,
} from '@/types/database';

/**
 * Repository for the recipe catalogue.
 *
 * Services return typed rows plus mapping helpers into the domain shapes
 * (`ScalableRecipe`, `RankableRecipe`). The domain never sees a Postgres row,
 * so a schema rename stays a service-layer change.
 */

export async function fetchRecipes(): Promise<RecipeRow[]> {
  const { data, error } = await getSupabase()
    .from('recipes')
    .select('*')
    .order('title', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchRecipe(recipeId: string): Promise<RecipeRow | null> {
  const { data, error } = await getSupabase()
    .from('recipes')
    .select('*')
    .eq('id', recipeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export interface RecipeIngredientWithName extends RecipeIngredientRow {
  ingredient: Pick<IngredientRow, 'name' | 'category' | 'allergens'>;
}

export async function fetchRecipeIngredients(
  recipeId: string,
): Promise<RecipeIngredientWithName[]> {
  const { data, error } = await getSupabase()
    .from('recipe_ingredients')
    .select('*, ingredients(name, category, allergens)')
    .eq('recipe_id', recipeId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as (RecipeIngredientRow & {
    ingredients: Pick<IngredientRow, 'name' | 'category' | 'allergens'> | null;
  })[]).map(({ ingredients, ...row }) => ({
    ...row,
    ingredient: ingredients ?? { name: 'Unknown ingredient', category: 'other', allergens: [] },
  }));
}

export async function fetchRecipeInstructions(
  recipeId: string,
): Promise<RecipeInstructionRow[]> {
  const { data, error } = await getSupabase()
    .from('recipe_instructions')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('step_number', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchFavoriteRecipeIds(userId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from('user_recipe_favorites')
    .select('recipe_id')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.recipe_id);
}

export async function setRecipeFavorite(
  userId: string,
  recipeId: string,
  favorite: boolean,
): Promise<void> {
  const supabase = getSupabase();
  if (favorite) {
    const { error } = await supabase
      .from('user_recipe_favorites')
      .upsert({ user_id: userId, recipe_id: recipeId }, { onConflict: 'user_id,recipe_id' });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from('user_recipe_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('recipe_id', recipeId);
  if (error) throw new Error(error.message);
}

/**
 * Ingredient names for ranking against disliked foods. Fetched in one query
 * for the whole catalogue rather than per recipe — the discovery screen ranks
 * everything at once.
 */
export async function fetchIngredientNamesByRecipe(): Promise<Map<string, string[]>> {
  const { data, error } = await getSupabase()
    .from('recipe_ingredients')
    .select('recipe_id, ingredients(name)');
  if (error) throw new Error(error.message);

  const map = new Map<string, string[]>();
  for (const row of (data ?? []) as unknown as {
    recipe_id: string;
    ingredients: { name: string } | null;
  }[]) {
    if (!row.ingredients) continue;
    const names = map.get(row.recipe_id) ?? [];
    names.push(row.ingredients.name.toLowerCase());
    map.set(row.recipe_id, names);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Domain mapping
// ---------------------------------------------------------------------------

const num = (value: number | null): number | null => (value === null ? null : Number(value));

export function toRankableRecipe(
  row: RecipeRow,
  ingredientNames: readonly string[],
): RankableRecipe {
  return {
    id: row.id,
    title: row.title,
    mealType: row.meal_type,
    caloriesPerServing: Number(row.calories_per_serving),
    proteinPerServing: num(row.protein_per_serving),
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    dietaryTags: row.dietary_tags,
    allergens: row.allergens,
    ingredientNames,
    costBand: row.cost_band,
  };
}

export function toScalableRecipe(
  row: RecipeRow,
  ingredients: readonly RecipeIngredientWithName[],
): ScalableRecipe {
  return {
    servings: row.servings,
    caloriesPerServing: Number(row.calories_per_serving),
    proteinPerServing: num(row.protein_per_serving),
    carbsPerServing: num(row.carbs_per_serving),
    fatPerServing: num(row.fat_per_serving),
    fiberPerServing: num(row.fiber_per_serving),
    ingredients: ingredients.map((row) => ({
      ingredientId: row.ingredient_id,
      name: row.ingredient.name,
      quantity: Number(row.quantity),
      unit: row.unit,
      preparationNote: row.preparation_note,
      isScalable: row.is_scalable,
      isOptional: row.is_optional,
    })),
  };
}
