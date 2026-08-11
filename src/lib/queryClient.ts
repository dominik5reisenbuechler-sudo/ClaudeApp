import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query configuration.
 *
 * Defaults are tuned for a data set that is small, personal and changes slowly:
 * a user's own logs. Aggressive refetching would burn battery and mobile data
 * to re-fetch numbers only this user can change, from this device.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        retry: (failureCount, error) => {
          // Never retry an authorisation failure: RLS denying a row is a
          // permanent answer, and retrying just delays the error.
          const message = error instanceof Error ? error.message : '';
          if (/jwt|unauthor|forbidden|row-level security/i.test(message)) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/**
 * Query keys in one place, so an invalidation after a mutation cannot drift out
 * of step with the query that produced the data.
 */
export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  preferences: (userId: string) => ['preferences', userId] as const,
  activeGoal: (userId: string) => ['goal', userId, 'active'] as const,
  activeTarget: (userId: string) => ['target', userId, 'active'] as const,
  weightLogs: (userId: string, from: string, to: string) =>
    ['weight-logs', userId, from, to] as const,
  stepLogs: (userId: string, from: string, to: string) => ['step-logs', userId, from, to] as const,
} as const;
