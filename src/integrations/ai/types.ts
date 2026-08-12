/**
 * The `CoachProvider` interface (ARCHITECTURE.md ADR-003).
 *
 * The app never names a model vendor. It asks a provider a question with a
 * context and gets a reply back — which is what lets the Edge Function swap
 * models, or a test substitute a canned answer, without touching a screen.
 */

import type { CoachReply } from '@/domain/coach/actions';
import type { CoachContext } from '@/domain/coach/context';

export interface CoachTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CoachRequest {
  question: string;
  context: CoachContext;
  /** Earlier turns. Trimmed by the provider; the caller need not manage it. */
  history: readonly CoachTurn[];
}

export type CoachFailure =
  | 'not_configured'
  | 'not_signed_in'
  | 'rate_limited'
  | 'unavailable'
  | 'network';

export const COACH_FAILURE_MESSAGES: Record<CoachFailure, string> = {
  not_configured:
    'The coach is not switched on for this build. Everything else in the app works without it.',
  not_signed_in: 'You need to be signed in to ask the coach anything.',
  rate_limited: 'That is a lot of questions in one hour. Try again a little later.',
  unavailable: 'The coach could not answer just now. Try again shortly.',
  network: 'No connection. The coach needs one; the rest of the app does not.',
};

export type CoachResult =
  | { ok: true; reply: CoachReply }
  | { ok: false; failure: CoachFailure };

export interface CoachProvider {
  readonly id: string;
  /** False when the deployment has no coach configured. */
  isConfigured(): boolean;
  ask(request: CoachRequest): Promise<CoachResult>;
}
