import { getSupabase } from '@/lib/supabase';
import type { StepLogRow, WeightLogRow } from '@/types/database';
import type { IsoDate, LogSource, WeightPoint } from '@/types/domain';

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

/**
 * Which days already have a log, and where each came from.
 *
 * Just the date and the source: reconciliation only needs to know whether a
 * day is taken and whether the user typed it, and pulling whole rows to answer
 * that would be a large read for two columns.
 */
export async function fetchLogSources(
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<{
  weights: { date: IsoDate; source: LogSource }[];
  steps: { date: IsoDate; source: LogSource }[];
}> {
  const supabase = getSupabase();

  const [weights, steps] = await Promise.all([
    supabase
      .from('weight_logs')
      .select('logged_on, source')
      .eq('user_id', userId)
      .gte('logged_on', from)
      .lte('logged_on', to),
    supabase
      .from('step_logs')
      .select('logged_on, source')
      .eq('user_id', userId)
      .gte('logged_on', from)
      .lte('logged_on', to),
  ]);

  if (weights.error) throw new Error(weights.error.message);
  if (steps.error) throw new Error(steps.error.message);

  return {
    weights: (weights.data ?? []).map((row) => ({ date: row.logged_on, source: row.source })),
    steps: (steps.data ?? []).map((row) => ({ date: row.logged_on, source: row.source })),
  };
}

/**
 * Insert imported weigh-ins.
 *
 * `ignoreDuplicates` rather than an upsert: reconciliation has already decided
 * these days are empty, and if one is not — a log written between the read and
 * this write — the existing row wins. A sync must never overwrite, and the
 * database is where that guarantee is cheapest to make.
 */
export async function importWeightLogs(
  userId: string,
  rows: readonly { date: IsoDate; weightKg: number; source: LogSource }[],
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await getSupabase()
    .from('weight_logs')
    .upsert(
      rows.map((row) => ({
        user_id: userId,
        logged_on: row.date,
        weight_kg: row.weightKg,
        source: row.source,
      })),
      { onConflict: 'user_id,logged_on', ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

export async function importStepLogs(
  userId: string,
  rows: readonly { date: IsoDate; steps: number; source: LogSource }[],
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await getSupabase()
    .from('step_logs')
    .upsert(
      rows.map((row) => ({
        user_id: userId,
        logged_on: row.date,
        steps: row.steps,
        source: row.source,
      })),
      { onConflict: 'user_id,logged_on', ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}
