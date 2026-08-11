import { getSupabase } from '@/lib/supabase';
import type { StepLogRow, WeightLogRow } from '@/types/database';
import type { IsoDate, WeightPoint } from '@/types/domain';

/**
 * Repository for daily logs.
 *
 * Writes are upserts on `(user_id, logged_on)`: correcting today's weigh-in is
 * the normal case, not an edge case, and it must not create a second row that
 * quietly skews the moving average.
 */

export async function fetchWeightLogs(
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<WeightLogRow[]> {
  const { data, error } = await getSupabase()
    .from('weight_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_on', from)
    .lte('logged_on', to)
    .order('logged_on', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Map rows to the shape the domain layer consumes. */
export function toWeightPoints(rows: readonly WeightLogRow[]): WeightPoint[] {
  return rows.map((row) => ({ date: row.logged_on, weightKg: Number(row.weight_kg) }));
}

export async function upsertWeightLog(
  userId: string,
  loggedOn: IsoDate,
  weightKg: number,
  note?: string,
): Promise<WeightLogRow> {
  const { data, error } = await getSupabase()
    .from('weight_logs')
    .upsert(
      { user_id: userId, logged_on: loggedOn, weight_kg: weightKg, note: note ?? null },
      { onConflict: 'user_id,logged_on' },
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Weight log upsert returned no row');
  return data;
}

export async function fetchStepLogs(
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<StepLogRow[]> {
  const { data, error } = await getSupabase()
    .from('step_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_on', from)
    .lte('logged_on', to)
    .order('logged_on', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertStepLog(
  userId: string,
  loggedOn: IsoDate,
  steps: number,
): Promise<StepLogRow> {
  const { data, error } = await getSupabase()
    .from('step_logs')
    .upsert(
      { user_id: userId, logged_on: loggedOn, steps },
      { onConflict: 'user_id,logged_on' },
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Step log upsert returned no row');
  return data;
}
