import { getSupabase } from '@/lib/supabase';
import type { Recommendation } from '@/domain/recommendations/types';
import type {
  EvidenceRuleRow,
  Json,
  RecommendationRow,
  WeeklyCheckinRow,
} from '@/types/database';
import type { IsoDate } from '@/types/domain';

/**
 * Repository for weekly check-ins, recommendations and evidence rules.
 *
 * Nothing here decides anything. The engine runs in `src/domain/recommendations`
 * and this layer only persists what it produced — including the `computed`
 * snapshot, so a recommendation stays explainable even after the logs it was
 * built from have been edited.
 *
 * Accepting a recommendation does not update a target here either: that writes
 * a new `user_targets` row through `profileService`, because targets are a
 * history and never a mutable row.
 */

export async function fetchCheckin(
  userId: string,
  weekStartDate: IsoDate,
): Promise<WeeklyCheckinRow | null> {
  const { data, error } = await getSupabase()
    .from('weekly_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start_date', weekStartDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function fetchRecentCheckins(
  userId: string,
  limit = 12,
): Promise<WeeklyCheckinRow[]> {
  const { data, error } = await getSupabase()
    .from('weekly_checkins')
    .select('*')
    .eq('user_id', userId)
    .order('week_start_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface CheckinAnswers {
  trainingPerformance: number | null;
  hunger: number | null;
  energy: number | null;
  sleepQuality: number | null;
  stress: number | null;
  dietAdherence: number | null;
  trainingSatisfaction: number | null;
  jointDiscomfort: number | null;
  notes: string | null;
}

export async function saveCheckin(
  userId: string,
  weekStartDate: IsoDate,
  answers: CheckinAnswers,
  computed: Json,
): Promise<WeeklyCheckinRow> {
  const { data, error } = await getSupabase()
    .from('weekly_checkins')
    .upsert(
      {
        user_id: userId,
        week_start_date: weekStartDate,
        training_performance: answers.trainingPerformance,
        hunger: answers.hunger,
        energy: answers.energy,
        sleep_quality: answers.sleepQuality,
        stress: answers.stress,
        diet_adherence: answers.dietAdherence,
        training_satisfaction: answers.trainingSatisfaction,
        joint_discomfort: answers.jointDiscomfort,
        notes: answers.notes,
        computed,
      },
      { onConflict: 'user_id,week_start_date' },
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Saving the check-in returned no row');
  return data;
}

/**
 * Store the week's recommendations.
 *
 * Previous *pending* recommendations for the same check-in are expired first,
 * so re-running a week does not leave the user with two contradictory proposals
 * open at once. Answered ones are left exactly as they are — what the user
 * decided is a record, not a draft.
 */
export async function saveRecommendations(
  userId: string,
  checkinId: string,
  recommendations: readonly Recommendation[],
): Promise<RecommendationRow[]> {
  const supabase = getSupabase();

  const { error: expireError } = await supabase
    .from('recommendations')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('weekly_checkin_id', checkinId)
    .eq('status', 'pending');
  if (expireError) throw new Error(expireError.message);

  if (recommendations.length === 0) return [];

  const { data, error } = await supabase
    .from('recommendations')
    .insert(
      recommendations.map((recommendation) => ({
        user_id: userId,
        weekly_checkin_id: checkinId,
        type: recommendation.type,
        current_value: recommendation.currentValue as Json,
        suggested_value: recommendation.suggestedValue as Json,
        reason: recommendation.reason,
        confidence: recommendation.confidence,
        evidence_rule_ids: recommendation.evidenceRuleIds,
      })),
    )
    .select('*');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchPendingRecommendations(
  userId: string,
): Promise<RecommendationRow[]> {
  const { data, error } = await getSupabase()
    .from('recommendations')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchRecommendationHistory(
  userId: string,
  limit = 50,
): Promise<RecommendationRow[]> {
  const { data, error } = await getSupabase()
    .from('recommendations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Record the user's answer. There is no delete: a rejected recommendation is
 * part of the record of what the engine advised, and dropping it would let the
 * app quietly forget advice it turned out to be wrong about.
 */
export async function respondToRecommendation(
  userId: string,
  id: string,
  status: 'accepted' | 'rejected',
  respondedAt: string,
): Promise<RecommendationRow> {
  const { data, error } = await getSupabase()
    .from('recommendations')
    .update({ status, responded_at: respondedAt })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Responding to the recommendation returned no row');
  return data;
}

export async function fetchEvidenceRules(
  ruleKeys: readonly string[],
): Promise<EvidenceRuleRow[]> {
  if (ruleKeys.length === 0) return [];

  const { data, error } = await getSupabase()
    .from('evidence_rules')
    .select('*')
    .in('rule_key', [...ruleKeys])
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return data ?? [];
}
