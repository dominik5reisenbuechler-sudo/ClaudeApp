import { getSupabase } from '@/lib/supabase';

/**
 * Account data export and deletion (GDPR — CLAUDE.md §56).
 *
 * Deletion here removes every row the user owns, using their own credentials
 * and their own RLS policies. That is the part the client can legitimately do.
 *
 * It cannot delete the `auth.users` record itself: that requires the
 * service-role key, which must never be in the app bundle. The remaining step
 * belongs in a Supabase Edge Function calling `auth.admin.deleteUser`, and once
 * that exists the `on delete cascade` on every table makes it a single call.
 * Until then this function is the honest maximum, and it says so to the caller.
 */

/** Order matters only in that children go before parents. */
const USER_SCOPED_TABLES = [
  'progress_photos',
  'recovery_logs',
  'activity_logs',
  'step_logs',
  'body_measurements',
  'weight_logs',
  'user_consents',
  'user_targets',
  'user_goals',
  'user_preferences',
] as const;

export interface DeletionResult {
  /** Tables successfully cleared. */
  cleared: string[];
  /**
   * False when the login record still exists because no server-side deletion
   * function is deployed. The UI must not claim a full deletion in that case.
   */
  authRecordRemoved: boolean;
}

export async function deleteAllUserData(userId: string): Promise<DeletionResult> {
  const supabase = getSupabase();
  const cleared: string[] = [];

  for (const table of USER_SCOPED_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`Failed to delete ${table}: ${error.message}`);
    cleared.push(table);
  }

  const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
  if (profileError) throw new Error(`Failed to delete profile: ${profileError.message}`);
  cleared.push('profiles');

  return { cleared, authRecordRemoved: false };
}

/**
 * Everything the app holds about this user, as a plain object ready to be
 * serialised. Built from the same tables deletion covers, so the two cannot
 * drift apart in what they consider "your data".
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const result: Record<string, unknown> = { exportedAt: new Date().toISOString(), userId };

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId);
  result.profiles = profile ?? [];

  for (const table of USER_SCOPED_TABLES) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
    if (error) throw new Error(`Failed to export ${table}: ${error.message}`);
    result[table] = data ?? [];
  }

  return result;
}
