import { getSupabase } from '@/lib/supabase';
import type { GeneratedPlan } from '@/domain/nutrition/mealPlanGeneration';
import type {
  Json,
  MealPlanDayRow,
  MealPlanEntryRow,
  MealPlanRow,
  RecipeRow,
} from '@/types/database';
import type { IsoDate, MealType, PlanMode } from '@/types/domain';
import { addDays } from '@/utils/date';

/**
 * Repository for weekly meal plans.
 *
 * A plan is always seven day rows, created up front. The grid then renders from
 * data rather than synthesising empty columns, and adding a meal to Thursday
 * needs no "does Thursday exist yet?" branch.
 */

export interface MealPlanEntryWithRecipe extends MealPlanEntryRow {
  recipe: RecipeRow | null;
}

export interface MealPlanDayWithEntries extends MealPlanDayRow {
  entries: MealPlanEntryWithRecipe[];
}

export interface FullMealPlan extends MealPlanRow {
  days: MealPlanDayWithEntries[];
}

/**
 * Week starts that have a plan, newest first.
 *
 * Just the dates — the meal-planning streak needs to know *whether* a week was
 * planned, not what was in it, and pulling every entry to answer that would be
 * a large query for a small number.
 */
export async function fetchPlannedWeekStarts(
  userId: string,
  from: IsoDate,
): Promise<IsoDate[]> {
  const { data, error } = await getSupabase()
    .from('meal_plans')
    .select('week_start_date')
    .eq('user_id', userId)
    .gte('week_start_date', from)
    .order('week_start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.week_start_date);
}

export async function fetchMealPlan(
  userId: string,
  weekStart: IsoDate,
): Promise<FullMealPlan | null> {
  const { data, error } = await getSupabase()
    .from('meal_plans')
    .select('*, meal_plan_days(*, meal_plan_entries(*, recipes(*)))')
    .eq('user_id', userId)
    .eq('week_start_date', weekStart)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const raw = data as unknown as MealPlanRow & {
    meal_plan_days: (MealPlanDayRow & {
      meal_plan_entries: (MealPlanEntryRow & { recipes: RecipeRow | null })[];
    })[];
  };

  return {
    ...raw,
    days: raw.meal_plan_days
      .slice()
      .sort((a, b) => a.day_index - b.day_index)
      .map(({ meal_plan_entries, ...day }) => ({
        ...day,
        entries: meal_plan_entries
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(({ recipes, ...entry }) => ({ ...entry, recipe: recipes })),
      })),
  };
}

/** Create the plan shell plus its seven days. Idempotent per (user, week). */
export async function ensureMealPlan(
  userId: string,
  weekStart: IsoDate,
): Promise<FullMealPlan> {
  const existing = await fetchMealPlan(userId, weekStart);
  if (existing) return existing;

  const supabase = getSupabase();

  const { data: plan, error } = await supabase
    .from('meal_plans')
    .insert({ user_id: userId, week_start_date: weekStart })
    .select('*')
    .single();
  if (error) {
    // Lost a race against another device; the row now exists either way.
    const raced = await fetchMealPlan(userId, weekStart);
    if (raced) return raced;
    throw new Error(error.message);
  }
  if (!plan) throw new Error('Creating the meal plan returned no row');

  const { error: daysError } = await supabase.from('meal_plan_days').insert(
    Array.from({ length: 7 }, (_, dayIndex) => ({
      meal_plan_id: plan.id,
      day_index: dayIndex,
      day_date: addDays(weekStart, dayIndex),
    })),
  );
  if (daysError) throw new Error(daysError.message);

  const created = await fetchMealPlan(userId, weekStart);
  if (!created) throw new Error('Meal plan was created but could not be read back');
  return created;
}

export async function addPlanEntry(input: {
  mealPlanDayId: string;
  mealType: MealType;
  recipeId: string;
  servings: number;
  sortOrder?: number;
}): Promise<MealPlanEntryRow> {
  const { data, error } = await getSupabase()
    .from('meal_plan_entries')
    .insert({
      meal_plan_day_id: input.mealPlanDayId,
      meal_type: input.mealType,
      recipe_id: input.recipeId,
      servings: input.servings,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Adding the meal returned no row');
  return data;
}

export async function removePlanEntry(entryId: string): Promise<void> {
  const { error } = await getSupabase().from('meal_plan_entries').delete().eq('id', entryId);
  if (error) throw new Error(error.message);
}

export async function updatePlanEntryServings(
  entryId: string,
  servings: number,
): Promise<void> {
  const { error } = await getSupabase()
    .from('meal_plan_entries')
    .update({ servings })
    .eq('id', entryId);
  if (error) throw new Error(error.message);
}

/** Replace every entry in a plan. Used by generation and by "clear week". */
export async function replacePlanEntries(
  plan: FullMealPlan,
  entries: readonly {
    dayIndex: number;
    mealType: MealType;
    recipeId: string;
    servings: number;
  }[],
): Promise<void> {
  const supabase = getSupabase();
  const dayIds = plan.days.map((day) => day.id);

  if (dayIds.length > 0) {
    const { error } = await supabase
      .from('meal_plan_entries')
      .delete()
      .in('meal_plan_day_id', dayIds);
    if (error) throw new Error(error.message);
  }

  if (entries.length === 0) return;

  const dayIdByIndex = new Map(plan.days.map((day) => [day.day_index, day.id]));
  const rows = entries
    .map((entry, index) => {
      const dayId = dayIdByIndex.get(entry.dayIndex);
      if (!dayId) return null;
      return {
        meal_plan_day_id: dayId,
        meal_type: entry.mealType,
        recipe_id: entry.recipeId,
        servings: entry.servings,
        sort_order: index,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const { error } = await supabase.from('meal_plan_entries').insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * Persist a generated plan, recording the mode and the inputs it ran with so
 * the week can be explained or reproduced later.
 */
export async function saveGeneratedPlan(
  plan: FullMealPlan,
  generated: GeneratedPlan,
  params: Record<string, unknown>,
): Promise<void> {
  await replacePlanEntries(
    plan,
    generated.meals.map((meal) => ({
      dayIndex: meal.dayIndex,
      mealType: meal.mealType,
      recipeId: meal.recipeId,
      servings: meal.servings,
    })),
  );

  const { error } = await getSupabase()
    .from('meal_plans')
    .update({
      mode: generated.mode as PlanMode,
      generated_at: new Date().toISOString(),
      generation_params: params as Json,
    })
    .eq('id', plan.id);
  if (error) throw new Error(error.message);
}

/** Copy one day's meals over another. Existing entries on the target are replaced. */
export async function copyDay(
  plan: FullMealPlan,
  fromDayIndex: number,
  toDayIndex: number,
): Promise<void> {
  const source = plan.days.find((day) => day.day_index === fromDayIndex);
  const target = plan.days.find((day) => day.day_index === toDayIndex);
  if (!source || !target || source.id === target.id) return;

  const supabase = getSupabase();

  const { error: clearError } = await supabase
    .from('meal_plan_entries')
    .delete()
    .eq('meal_plan_day_id', target.id);
  if (clearError) throw new Error(clearError.message);

  const rows = source.entries
    .filter((entry) => entry.recipe_id !== null)
    .map((entry, index) => ({
      meal_plan_day_id: target.id,
      meal_type: entry.meal_type,
      recipe_id: entry.recipe_id,
      servings: Number(entry.servings),
      sort_order: index,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from('meal_plan_entries').insert(rows);
  if (error) throw new Error(error.message);
}

/** Copy a whole week onto another week, creating the target plan if needed. */
export async function copyWeek(
  userId: string,
  fromWeekStart: IsoDate,
  toWeekStart: IsoDate,
): Promise<void> {
  const source = await fetchMealPlan(userId, fromWeekStart);
  if (!source) return;

  const target = await ensureMealPlan(userId, toWeekStart);

  await replacePlanEntries(
    target,
    source.days.flatMap((day) =>
      day.entries
        .filter((entry) => entry.recipe_id !== null)
        .map((entry) => ({
          dayIndex: day.day_index,
          mealType: entry.meal_type,
          recipeId: entry.recipe_id as string,
          servings: Number(entry.servings),
        })),
    ),
  );
}
