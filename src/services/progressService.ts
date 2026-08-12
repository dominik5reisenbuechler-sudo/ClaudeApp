import { getSupabase } from '@/lib/supabase';
import type { DetectedRecord, ExistingRecord } from '@/domain/progress/personalRecords';
import type { BodyMeasurementRow, MeasurementSite, PersonalRecordRow } from '@/types/database';
import type { IsoDate } from '@/types/domain';

/**
 * Repository for measurements and personal records.
 *
 * Records are *detected* by the domain layer and merely stored here. Keeping
 * detection out of SQL means the rules — warm-ups never count, ties are not
 * records — are testable and live next to the definition of a set.
 */

export async function fetchMeasurements(
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<BodyMeasurementRow[]> {
  const { data, error } = await getSupabase()
    .from('body_measurements')
    .select('*')
    .eq('user_id', userId)
    .gte('measured_on', from)
    .lte('measured_on', to)
    .order('measured_on', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertMeasurement(
  userId: string,
  measuredOn: IsoDate,
  site: MeasurementSite,
  valueCm: number,
): Promise<BodyMeasurementRow> {
  const { data, error } = await getSupabase()
    .from('body_measurements')
    .upsert(
      { user_id: userId, measured_on: measuredOn, site, value_cm: valueCm },
      { onConflict: 'user_id,measured_on,site' },
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Saving the measurement returned no row');
  return data;
}

export async function deleteMeasurement(userId: string, id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('body_measurements')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function fetchPersonalRecords(userId: string): Promise<PersonalRecordRow[]> {
  const { data, error } = await getSupabase()
    .from('personal_records')
    .select('*')
    .eq('user_id', userId)
    .order('achieved_on', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * The user's current best per (exercise, kind, reps), in the shape the detector
 * consumes. Rows are ordered newest first, and only the highest value per key
 * matters — a later row with a lower value is an older record superseded.
 */
export function toExistingRecords(rows: readonly PersonalRecordRow[]): ExistingRecord[] {
  const best = new Map<string, ExistingRecord>();

  for (const row of rows) {
    const reps = row.kind === 'weight_for_reps' ? row.reps : null;
    const key = `${row.exercise_id}::${row.kind}::${reps ?? 'any'}`;
    const value = Number(row.value);
    const current = best.get(key);

    if (!current || value > current.value) {
      best.set(key, { exerciseId: row.exercise_id, kind: row.kind, value, reps });
    }
  }

  return [...best.values()];
}

export async function saveDetectedRecords(
  userId: string,
  records: readonly DetectedRecord[],
): Promise<void> {
  if (records.length === 0) return;

  const { error } = await getSupabase().from('personal_records').insert(
    records.map((record) => ({
      user_id: userId,
      exercise_id: record.exerciseId,
      kind: record.kind,
      value: record.value,
      reps: record.reps,
      weight_kg: record.weightKg,
      achieved_on: record.achievedOn,
      exercise_set_id: record.exerciseSetId,
    })),
  );
  if (error) throw new Error(error.message);
}
