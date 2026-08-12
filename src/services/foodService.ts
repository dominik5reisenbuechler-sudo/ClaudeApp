import { getSupabase } from '@/lib/supabase';
import type { ProviderFood } from '@/integrations/foodProviders';
import type { FoodRow, InsertDto } from '@/types/database';

/**
 * Repository for the food catalogue.
 *
 * Foods from an external provider are cached locally on first use: the second
 * scan of the same product is instant and works offline-ish, and the provider
 * is not hit repeatedly for data that does not change. The cache key is
 * `(provider, external_id)`, which the schema enforces as unique.
 */

/** Fuzzy search over foods this user can see. RLS decides which those are. */
export async function searchLocalFoods(term: string, limit = 25): Promise<FoodRow[]> {
  const trimmed = term.trim();
  if (trimmed.length === 0) return [];

  const { data, error } = await getSupabase().rpc('search_foods', {
    search_term: trimmed,
    max_results: limit,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** One food by id, or null. Used to validate an id before logging against it. */
export async function fetchFoodById(id: string): Promise<FoodRow | null> {
  const { data, error } = await getSupabase()
    .from('foods')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function findFoodByBarcode(barcode: string): Promise<FoodRow | null> {
  const { data, error } = await getSupabase()
    .from('foods')
    .select('*')
    .eq('barcode', barcode)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function findCachedProviderFood(
  provider: string,
  externalId: string,
): Promise<FoodRow | null> {
  const { data, error } = await getSupabase()
    .from('foods')
    .select('*')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Store a provider result locally.
 *
 * `is_public` is true because a barcode product is not personal data — one
 * user's scan spares everyone else the lookup. `verified` stays false: the
 * source is crowd-sourced, and the UI tells the user so.
 */
export async function cacheProviderFood(
  food: ProviderFood,
  providerId: string,
  userId: string,
): Promise<FoodRow> {
  const existing = await findCachedProviderFood(providerId, food.externalId);
  if (existing) return existing;

  const insert: InsertDto<'foods'> = {
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    serving_size: food.servingSizeG,
    serving_unit: food.servingLabel,
    calories_per_100g: food.caloriesPer100g,
    protein_per_100g: food.proteinPer100g,
    carbs_per_100g: food.carbsPer100g,
    fat_per_100g: food.fatPer100g,
    fiber_per_100g: food.fiberPer100g,
    sugar_per_100g: food.sugarPer100g,
    sodium_mg_per_100g: food.sodiumMgPer100g,
    source: food.barcode ? 'barcode' : 'branded',
    verified: false,
    is_public: true,
    created_by: userId,
    external_id: food.externalId,
    provider: providerId,
  };

  const { data, error } = await getSupabase().from('foods').insert(insert).select('*').single();
  if (error) {
    // A concurrent scan of the same product loses the race on the unique index.
    // Re-reading is the right answer, not surfacing a conflict to the user.
    const raced = await findCachedProviderFood(providerId, food.externalId);
    if (raced) return raced;
    throw new Error(error.message);
  }
  if (!data) throw new Error('Caching the food returned no row');
  return data;
}

export interface CustomFoodInput {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  servingSizeG?: number | null;
  caloriesPer100g: number;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
  fiberPer100g?: number | null;
}

/** A food the user typed in themselves. Private to them unless shared later. */
export async function createCustomFood(
  input: CustomFoodInput,
  userId: string,
): Promise<FoodRow> {
  const { data, error } = await getSupabase()
    .from('foods')
    .insert({
      name: input.name.trim(),
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      serving_size: input.servingSizeG ?? null,
      calories_per_100g: input.caloriesPer100g,
      protein_per_100g: input.proteinPer100g ?? null,
      carbs_per_100g: input.carbsPer100g ?? null,
      fat_per_100g: input.fatPer100g ?? null,
      fiber_per_100g: input.fiberPer100g ?? null,
      source: 'user',
      verified: false,
      is_public: false,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Creating the food returned no row');
  return data;
}

/**
 * Foods the user has logged most recently. The obvious first thing to offer:
 * people eat the same things repeatedly, so recents beat search most of the
 * time.
 */
export async function fetchRecentFoods(userId: string, limit = 20): Promise<FoodRow[]> {
  const { data, error } = await getSupabase()
    .from('food_entries')
    .select('food_id, logged_on, created_at, foods(*)')
    .eq('user_id', userId)
    .not('food_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(120);
  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const foods: FoodRow[] = [];
  for (const row of (data ?? []) as unknown as { food_id: string; foods: FoodRow | null }[]) {
    if (!row.foods || seen.has(row.food_id)) continue;
    seen.add(row.food_id);
    foods.push(row.foods);
    if (foods.length >= limit) break;
  }
  return foods;
}

export async function fetchFavoriteFoods(userId: string): Promise<FoodRow[]> {
  const { data, error } = await getSupabase()
    .from('food_favorites')
    .select('food_id, foods(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as { foods: FoodRow | null }[])
    .map((row) => row.foods)
    .filter((food): food is FoodRow => food !== null);
}

export async function setFoodFavorite(
  userId: string,
  foodId: string,
  favorite: boolean,
): Promise<void> {
  const supabase = getSupabase();
  if (favorite) {
    const { error } = await supabase
      .from('food_favorites')
      .upsert({ user_id: userId, food_id: foodId }, { onConflict: 'user_id,food_id' });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from('food_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('food_id', foodId);
  if (error) throw new Error(error.message);
}
