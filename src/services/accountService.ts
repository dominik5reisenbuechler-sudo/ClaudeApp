import { getSupabase } from '@/lib/supabase';
import { PHOTO_BUCKET } from './progressPhotoService';

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
 *
 * Stored files need explicit handling. `on delete cascade` reaches rows, not
 * bucket objects, so deleting `progress_photos` alone would leave the images
 * themselves sitting in storage after the user was told their data was gone.
 * Photos are the most sensitive thing here, so they are removed first and
 * their absence is reported rather than assumed.
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
  /** Stored photo objects removed from the bucket. */
  filesRemoved: number;
  /**
   * False when the login record still exists because no server-side deletion
   * function is deployed. The UI must not claim a full deletion in that case.
   */
  authRecordRemoved: boolean;
}

export async function deleteAllUserData(userId: string): Promise<DeletionResult> {
  const supabase = getSupabase();
  const cleared: string[] = [];

  // Files before rows. The rows are what tells us which objects exist, so
  // dropping them first would strand every image with no way left to find it.
  const filesRemoved = await deleteStoredPhotos(userId);

  for (const table of USER_SCOPED_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`Failed to delete ${table}: ${error.message}`);
    cleared.push(table);
  }

  const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
  if (profileError) throw new Error(`Failed to delete profile: ${profileError.message}`);
  cleared.push('profiles');

  return { cleared, filesRemoved, authRecordRemoved: false };
}

/**
 * Remove every stored progress photo for a user.
 *
 * Throws rather than continuing quietly on failure. A deletion that reports
 * success while images remain in the bucket is the one outcome this function
 * exists to prevent, so a storage error has to stop the whole operation and
 * surface — the user can retry, and nothing has claimed to be gone yet.
 */
async function deleteStoredPhotos(userId: string): Promise<number> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('progress_photos')
    .select('storage_path')
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to list stored photos: ${error.message}`);

  const paths = (data ?? []).map((row) => row.storage_path);
  if (paths.length === 0) return 0;

  const removal = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  if (removal.error) throw new Error(`Failed to delete stored photos: ${removal.error.message}`);

  return paths.length;
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
