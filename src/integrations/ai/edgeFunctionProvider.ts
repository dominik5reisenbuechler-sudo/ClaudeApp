import { parseCoachReply } from '@/domain/coach/actions';
import { coachSystemPrompt, serializeCoachContext } from '@/domain/coach/context';
import { getSupabase, hasSupabase } from '@/lib/supabase';
import type { CoachFailure, CoachProvider, CoachRequest, CoachResult } from './types';

/**
 * The coach, over a Supabase Edge Function.
 *
 * There is no client-side model call and there never will be: an API key that
 * bills per token cannot live in a bundle anyone can download. The function
 * holds the key, verifies the caller's session and rate-limits them; this file
 * assembles the request and validates what comes back.
 *
 * Validation happens **here**, on the client, rather than in the function. That
 * looks backwards until you notice where the rules live: the action vocabulary
 * is in `domain/coach/actions.ts`, where it is tested, and a second copy of it
 * in Deno would be a second copy to keep in step. The function returns raw text
 * and this parses it — untrusted output treated as untrusted output.
 */

const FUNCTION_NAME = 'coach';

/** Turns of history sent. Enough for a follow-up, short enough to stay cheap. */
const HISTORY_TURNS = 6;

export function createEdgeFunctionCoachProvider(): CoachProvider {
  return {
    id: 'supabase-edge',

    isConfigured: () => hasSupabase,

    async ask(request: CoachRequest): Promise<CoachResult> {
      if (!hasSupabase) return { ok: false, failure: 'not_configured' };

      try {
        const supabase = getSupabase();

        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return { ok: false, failure: 'not_signed_in' };

        const { data, error } = await supabase.functions.invoke<{
          raw?: string;
          error?: string;
        }>(FUNCTION_NAME, {
          body: {
            question: request.question,
            systemPrompt: coachSystemPrompt(request.context),
            context: serializeCoachContext(request.context),
            history: request.history.slice(-HISTORY_TURNS),
          },
        });

        if (error) return { ok: false, failure: classify(error) };
        if (!data?.raw) return { ok: false, failure: 'unavailable' };

        return { ok: true, reply: parseCoachReply(extractJson(data.raw)) };
      } catch {
        return { ok: false, failure: 'network' };
      }
    },
  };
}

/**
 * Pull the JSON object out of a reply that may be wrapped in prose or a fenced
 * code block. Models do this occasionally whatever the instruction says, and
 * discarding an otherwise good answer over a pair of backticks would be a poor
 * trade. Anything that still will not parse falls through to `parseCoachReply`,
 * which returns a usable message rather than throwing.
 */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Fall through.
      }
    }
  }

  // Not JSON at all — but it is still an answer, so keep the words.
  return { message: raw.trim() };
}

function classify(error: { message?: string; context?: { status?: number } }): CoachFailure {
  const status = error.context?.status;
  if (status === 401) return 'not_signed_in';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'not_configured';
  return 'unavailable';
}
