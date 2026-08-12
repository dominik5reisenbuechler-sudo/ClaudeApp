import { getSupabase } from '@/lib/supabase';
import type { DetectedUnlock } from '@/domain/gamification/achievements';
import type { XpEvent } from '@/domain/gamification/xp';
import type { AchievementRow, Json, UserAchievementRow, XpEventRow } from '@/types/database';
import type { IsoDate } from '@/types/domain';

/**
 * Repository for XP and achievements.
 *
 * Both tables are append-only by policy — there is no update or delete path
 * here because there is none in the database either. Awarding is idempotent
 * through `ignoreDuplicates`, so the award pass can run on every app open
 * without a read-modify-write race deciding whether it already ran.
 */

export async function fetchXpEvents(userId: string, from: IsoDate): Promise<XpEventRow[]> {
  const { data, error } = await getSupabase()
    .from('xp_events')
    .select('*')
    .eq('user_id', userId)
    .gte('earned_on', from)
    .order('earned_on', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Total XP.
 *
 * Summed in the client over a single integer column rather than through a
 * PostgREST aggregate: aggregate functions are a per-project setting that can
 * be off, and a dashboard number that silently becomes an error on someone
 * else's Supabase project is not worth the bytes saved. An active user
 * accumulates on the order of two thousand rows a year, which is a few
 * kilobytes of `int4`.
 */
export async function fetchTotalXp(userId: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from('xp_events')
    .select('xp')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  return (data ?? []).reduce((total, row) => total + row.xp, 0);
}

/**
 * Insert the events for a day, skipping any that already exist.
 *
 * The unique index on `(user_id, kind, earned_on, dedupe_key)` is what makes
 * this safe to call repeatedly — `ignoreDuplicates` turns a re-run into a
 * no-op rather than a conflict the client has to reason about.
 */
export async function awardXp(
  userId: string,
  events: readonly XpEvent[],
  dedupeKeys: readonly string[] = [],
): Promise<void> {
  if (events.length === 0) return;

  const { error } = await getSupabase()
    .from('xp_events')
    .upsert(
      events.map((event, index) => ({
        user_id: userId,
        kind: event.kind,
        xp: event.xp,
        earned_on: event.earnedOn,
        context: event.context as Json,
        dedupe_key: dedupeKeys[index] ?? '',
      })),
      { onConflict: 'user_id,kind,earned_on,dedupe_key', ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

export async function fetchAchievements(): Promise<AchievementRow[]> {
  const { data, error } = await getSupabase()
    .from('achievements')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchUserAchievements(userId: string): Promise<UserAchievementRow[]> {
  const { data, error } = await getSupabase()
    .from('user_achievements')
    .select('*')
    .eq('user_id', userId)
    .order('unlocked_on', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Record newly unlocked achievements and the XP they carry.
 *
 * The unlock is written first. If the XP insert then fails, the user has the
 * achievement without the points — recoverable on the next pass, because the
 * unlock row makes the award deterministic. The other order would hand out
 * points for an achievement nobody has, which is not recoverable at all.
 */
export async function recordUnlocks(
  userId: string,
  unlocks: readonly DetectedUnlock[],
): Promise<void> {
  if (unlocks.length === 0) return;

  const { error } = await getSupabase()
    .from('user_achievements')
    .upsert(
      unlocks.map((unlock) => ({
        user_id: userId,
        achievement_id: unlock.achievementId,
        unlocked_on: unlock.unlockedOn,
      })),
      { onConflict: 'user_id,achievement_id', ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);

  const rewarded = unlocks.filter((unlock) => unlock.xpReward > 0);
  if (rewarded.length === 0) return;

  await awardXp(
    userId,
    rewarded.map((unlock) => ({
      kind: 'achievement' as const,
      xp: unlock.xpReward,
      earnedOn: unlock.unlockedOn,
      context: { achievementId: unlock.achievementId },
    })),
    rewarded.map((unlock) => unlock.achievementId),
  );
}
