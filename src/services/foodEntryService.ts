import { getSupabase } from '@/lib/supabase';
import type { LoggedEntry } from '@/domain/nutrition/dailyTotals';
import type { FoodEntryRow, InsertDto } from '@/types/database';
import type { IsoDate, MealType } from '@/types/domain';

/**
 * Repository for logged food.
 *
 * Every write records the macro snapshot the caller computed. The service does
 * not compute macros itself — that belongs to `domain/nutrition/foodMath`, and
 * having exactly one implementation of the scaling maths is what keeps the
 * logged value and the previewed value identical.
 */

export async function fetchFoodEntries(
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<FoodEntryRow[]> {
  const { data, error } = await getSupabase()
    .from('food_entries')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_on', from)
    .lte('logged_on', to)
    .order('logged_on', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Map rows to the shape the domain aggregation consumes. */
export function toLoggedEntries(rows: readonly FoodEntryRow[]): LoggedEntry[] {
  return rows.map((row) => ({
    mealType: row.meal_type,
    energyKcal: Number(row.energy_kcal),
    proteinG: row.protein_g === null ? null : Number(row.protein_g),
    carbsG: row.carbs_g === null ? null : Number(row.carbs_g),
    fatG: row.fat_g === null ? null : Number(row.fat_g),
    fiberG: row.fiber_g === null ? null : Number(row.fiber_g),
  }));
}

export interface CreateFoodEntryInput {
  loggedOn: IsoDate;
  mealType: MealType;
  displayName: string;
  quantity: number;
  unit?: string;
  foodId?: string | null;
  savedMealId?: string | null;
  recipeId?: string | null;
  energyKcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  note?: string | null;
}

export async function createFoodEntry(
  userId: string,
  input: CreateFoodEntryInput,
): Promise<FoodEntryRow> {
  const insert: InsertDto<'food_entries'> = {
    user_id: userId,
    logged_on: input.loggedOn,
    meal_type: input.mealType,
    display_name: input.displayName,
    quantity: input.quantity,
    unit: input.unit ?? 'g',
    food_id: input.foodId ?? null,
    saved_meal_id: input.savedMealId ?? null,
    recipe_id: input.recipeId ?? null,
    energy_kcal: input.energyKcal,
    protein_g: input.proteinG,
    carbs_g: input.carbsG,
    fat_g: input.fatG,
    fiber_g: input.fiberG,
    note: input.note ?? null,
  };

  const { data, error } = await getSupabase()
    .from('food_entries')
    .insert(insert)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Logging the food returned no row');
  return data;
}

export async function deleteFoodEntry(userId: string, entryId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('food_entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function updateFoodEntryQuantity(
  userId: string,
  entryId: string,
  patch: {
    quantity: number;
    energyKcal: number;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
  },
): Promise<FoodEntryRow> {
  const { data, error } = await getSupabase()
    .from('food_entries')
    .update({
      quantity: patch.quantity,
      energy_kcal: patch.energyKcal,
      protein_g: patch.proteinG,
      carbs_g: patch.carbsG,
      fat_g: patch.fatG,
      fiber_g: patch.fiberG,
    })
    .eq('id', entryId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Updating the entry returned no row');
  return data;
}
