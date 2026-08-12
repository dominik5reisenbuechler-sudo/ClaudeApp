/**
 * Display names for the eighteen tracked muscles.
 *
 * Kept beside the training model rather than in a UI file because
 * recommendation reasons are assembled in the domain and have to name the
 * muscle they are talking about.
 */

import type { MuscleId } from '@/types/domain';

export const MUSCLE_LABELS: Record<MuscleId, string> = {
  chest: 'chest',
  lats: 'lats',
  upper_back: 'upper back',
  traps: 'traps',
  front_delts: 'front delts',
  side_delts: 'side delts',
  rear_delts: 'rear delts',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  adductors: 'adductors',
  abductors: 'abductors',
  calves: 'calves',
  abs: 'abs',
  lower_back: 'lower back',
};
