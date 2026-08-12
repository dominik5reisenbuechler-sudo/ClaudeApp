/**
 * The AI coach Edge Function.
 *
 * This exists for exactly one reason: **the model API key must never be in the
 * app bundle.** Anything prefixed `EXPO_PUBLIC_` is readable by anyone who
 * downloads the app, and a key that bills per token is not something to hand
 * out. So the client sends a question plus its context, this function adds the
 * key, and the key never leaves the server (CLAUDE.md §56, ARCHITECTURE.md §6).
 *
 * Two further things it is responsible for, which a client-side call could not
 * do at all:
 *
 * **Identity.** The caller's JWT is verified against Supabase Auth. An
 * unauthenticated request is rejected before it costs anything.
 *
 * **Rate limiting.** Per user, per hour. Without it, one loop in a client
 * build — or one person deciding to be tiresome — is an unbounded bill.
 *
 * What it deliberately does NOT do is decide anything. It does not read the
 * database, does not write to it, and does not interpret the model's reply.
 * The context is assembled by `domain/coach/context.ts` on the client, where it
 * is testable, and the reply is parsed by `domain/coach/actions.ts`, where the
 * action vocabulary is enforced. This function is a key holder and a meter.
 *
 * Deploy:  supabase functions deploy coach
 * Secrets: supabase secrets set ANTHROPIC_API_KEY=...
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1024;

/** Questions per user per hour. Generous for a person, useless for a loop. */
const RATE_LIMIT_PER_HOUR = 30;

/** Refuse oversized payloads before spending a token on them. */
const MAX_QUESTION_CHARS = 2000;
const MAX_CONTEXT_CHARS = 24_000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CoachRequest {
  question: string;
  systemPrompt: string;
  context: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

/** In-memory, per-instance. Coarse, and enough to stop a runaway client. */
const recentCalls = new Map<string, number[]>();

function withinRateLimit(userId: string, now: number): boolean {
  const hourAgo = now - 3_600_000;
  const calls = (recentCalls.get(userId) ?? []).filter((at) => at > hourAgo);

  if (calls.length >= RATE_LIMIT_PER_HOUR) {
    recentCalls.set(userId, calls);
    return false;
  }

  calls.push(now);
  recentCalls.set(userId, calls);
  return true;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // Never echo which variable is missing to the client.
    console.error('coach: ANTHROPIC_API_KEY is not set');
    return json({ error: 'The coach is not configured on this deployment.' }, 503);
  }

  // --- Who is asking? ------------------------------------------------------

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in.' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) return json({ error: 'Not signed in.' }, 401);

  if (!withinRateLimit(auth.user.id, Date.now())) {
    return json(
      { error: 'That is a lot of questions in one hour. Try again a little later.' },
      429,
    );
  }

  // --- What are they asking? ----------------------------------------------

  let body: CoachRequest;
  try {
    body = (await request.json()) as CoachRequest;
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  if (
    typeof body.question !== 'string' ||
    body.question.trim() === '' ||
    body.question.length > MAX_QUESTION_CHARS ||
    typeof body.context !== 'string' ||
    body.context.length > MAX_CONTEXT_CHARS ||
    typeof body.systemPrompt !== 'string'
  ) {
    return json({ error: 'Malformed request.' }, 400);
  }

  // --- Ask ----------------------------------------------------------------

  const messages = [
    ...(body.history ?? []).slice(-6),
    {
      role: 'user' as const,
      // The context is labelled as data, not instruction. It contains values
      // the user typed, and a food name is not a place to take orders from.
      content: `<user_data>\n${body.context}\n</user_data>\n\nQuestion: ${body.question}`,
    },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: body.systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      console.error('coach: upstream returned', response.status);
      return json({ error: 'The coach could not answer just now. Try again shortly.' }, 502);
    }

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };

    const text = (payload.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();

    if (text === '') {
      return json({ error: 'The coach could not answer just now. Try again shortly.' }, 502);
    }

    // Returned as raw text. The client parses and validates it against the
    // action schema — this function does not get to decide what is a valid
    // action, because that rule has to live where it is tested.
    return json({ raw: text });
  } catch (error) {
    console.error('coach: request failed', error);
    return json({ error: 'The coach could not answer just now. Try again shortly.' }, 502);
  }
});
