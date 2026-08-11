import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { queryKeys } from '@/lib/queryClient';
import {
  fetchActiveGoal,
  fetchActiveTarget,
  fetchPreferences,
  fetchProfile,
  updateProfile,
} from '@/services/profileService';
import type { UpdateDto } from '@/types/database';

/**
 * React glue for the profile aggregate.
 *
 * Queries are disabled until there is a user id, so a signed-out render never
 * issues a request that RLS would answer with an empty set — an empty set is
 * indistinguishable from "this user has no data", and that ambiguity is how
 * onboarding gates end up flapping.
 */

export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.profile(userId ?? 'anonymous'),
    queryFn: () => fetchProfile(userId as string),
    enabled: Boolean(userId),
  });
}

export function usePreferences() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.preferences(userId ?? 'anonymous'),
    queryFn: () => fetchPreferences(userId as string),
    enabled: Boolean(userId),
  });
}

export function useActiveGoal() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.activeGoal(userId ?? 'anonymous'),
    queryFn: () => fetchActiveGoal(userId as string),
    enabled: Boolean(userId),
  });
}

export function useActiveTarget() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.activeTarget(userId ?? 'anonymous'),
    queryFn: () => fetchActiveTarget(userId as string),
    enabled: Boolean(userId),
  });
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: UpdateDto<'profiles'>) => updateProfile(user?.id as string, patch),
    onSuccess: () => {
      if (user) void queryClient.invalidateQueries({ queryKey: queryKeys.profile(user.id) });
    },
  });
}

/**
 * Whether the user still needs to complete onboarding.
 *
 * Returns `null` while unknown rather than defaulting to `false`, so the router
 * waits instead of flashing the dashboard and bouncing back to onboarding.
 */
export function useOnboardingStatus(): { needsOnboarding: boolean | null; isLoading: boolean } {
  const { user, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading, isError } = useProfile();

  if (authLoading || !user) return { needsOnboarding: null, isLoading: authLoading };
  if (isLoading) return { needsOnboarding: null, isLoading: true };

  // On error, assume onboarding is done: sending a returning user back through
  // onboarding because of a transient network failure would be far worse than
  // showing them a dashboard that reports its own load error.
  if (isError) return { needsOnboarding: false, isLoading: false };

  return { needsOnboarding: profile?.onboarding_completed_at === null || !profile, isLoading: false };
}
