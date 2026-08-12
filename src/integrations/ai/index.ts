import { createEdgeFunctionCoachProvider } from './edgeFunctionProvider';
import type { CoachProvider } from './types';

/**
 * Provider registry.
 *
 * One place decides which coach implementation the app uses. There is exactly
 * one, and it goes through an Edge Function — a client-side model call would
 * mean a billable API key in the bundle, which is not a trade-off with a
 * mitigation, just a mistake.
 */

let provider: CoachProvider | null = null;

export function getCoachProvider(): CoachProvider {
  provider ??= createEdgeFunctionCoachProvider();
  return provider;
}

/** Test/debug seam for substituting a provider. */
export function setCoachProvider(next: CoachProvider): void {
  provider = next;
}

export { COACH_FAILURE_MESSAGES } from './types';
export type {
  CoachFailure,
  CoachProvider,
  CoachRequest,
  CoachResult,
  CoachTurn,
} from './types';
