import { getSupabase } from '@/lib/supabase';
import type {
  ProfileRow,
  UserGoalRow,
  UserPreferencesRow,
  UserTargetRow,
  UpdateDto,
} from '@/types/database';
import { todayIsoDate } from '@/utils/date';

/**
 * Repository for the profile aggregate.
 *
 * Services are the only place Supabase is touched. They return typed rows and
 * translate Postgres errors into `Error`s; they do not compute anything, and
 * they never import from `src/domain` — the direction of dependency is
 * hooks → services → database, with domain functions applied by the hook.
 */

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('Expected a row but the query returned none');
  return result.data;
}

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateProfile(
  userId: string,
  patch: UpdateDto<'profiles'>,
): Promise<ProfileRow> {
  return unwrap(
    await getSupabase().from('profiles').update(patch).eq('id', userId).select('*').single(),
  );
}

export async function fetchPreferences(userId: string): Promise<UserPreferencesRow | null> {
  const { data, error } = await getSupabase()
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertPreferences(
  userId: string,
  patch: UpdateDto<'user_preferences'>,
): Promise<UserPreferencesRow> {
  return unwrap(
    await getSupabase()
      .from('user_preferences')
      .upsert({ ...patch, user_id: userId }, { onConflict: 'user_id' })
      .select('*')
      .single(),
  );
}

/** The user's currently active goal, i.e. the one with no end date. */
export async function fetchActiveGoal(userId: string): Promise<UserGoalRow | null> {
  const { data, error } = await getSupabase()
    .from('user_goals')
    .select('*')
    .eq('user_id', userId)
    .is('ended_on', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Start a new goal, closing the previous one.
 *
 * Two statements rather than one: a partial unique index enforces "at most one
 * open goal", so the close must land first. This is a natural fit for an Edge
 * Function or an RPC later; until there is a second writer, the ordering here
 * is sufficient and the constraint catches any violation.
 */
export async function startGoal(
  userId: string,
  goal: Omit<UserGoalRow, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'started_on' | 'ended_on'>,
  today = todayIsoDate(),
): Promise<UserGoalRow> {
  const supabase = getSupabase();

  const { error: closeError } = await supabase
    .from('user_goals')
    .update({ ended_on: today })
    .eq('user_id', userId)
    .is('ended_on', null);
  if (closeError) throw new Error(closeError.message);

  return unwrap(
    await supabase
      .from('user_goals')
      .insert({ ...goal, user_id: userId, started_on: today })
      .select('*')
      .single(),
  );
}

export async function fetchActiveTarget(userId: string): Promise<UserTargetRow | null> {
  const { data, error } = await getSupabase()
    .from('user_targets')
    .select('*')
    .eq('user_id', userId)
    .is('effective_to', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Supersede the active target with a new one.
 *
 * The previous row is closed, never overwritten: "why did my target change?" is
 * only answerable if the old value and its basis still exist.
 */
export async function setActiveTarget(
  userId: string,
  target: Omit<
    UserTargetRow,
    'id' | 'user_id' | 'created_at' | 'updated_at' | 'effective_from' | 'effective_to'
  >,
  today = todayIsoDate(),
): Promise<UserTargetRow> {
  const supabase = getSupabase();

  const { error: closeError } = await supabase
    .from('user_targets')
    .update({ effective_to: today })
    .eq('user_id', userId)
    .is('effective_to', null);
  if (closeError) throw new Error(closeError.message);

  return unwrap(
    await supabase
      .from('user_targets')
      .insert({ ...target, user_id: userId, effective_from: today })
      .select('*')
      .single(),
  );
}

export async function recordConsent(
  userId: string,
  kind: 'terms' | 'privacy' | 'health_data' | 'analytics',
  granted: boolean,
): Promise<void> {
  const { error } = await getSupabase()
    .from('user_consents')
    .insert({
      user_id: userId,
      kind,
      granted,
      granted_at: granted ? new Date().toISOString() : null,
      revoked_at: granted ? null : new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}
