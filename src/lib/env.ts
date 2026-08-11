import { z } from 'zod';

/**
 * Startup configuration.
 *
 * Validated eagerly so a missing or malformed value fails loudly at boot with a
 * message that says what to fix, rather than surfacing as an opaque network
 * error on the first Supabase call.
 *
 * Only `EXPO_PUBLIC_*` variables are readable here — they are inlined into the
 * bundle at build time and are therefore public. The anon key is safe to ship
 * *only* because Row Level Security is enabled on every table. The service-role
 * key must never appear in this file or anywhere else in the app.
 */

const envSchema = z.object({
  supabaseUrl: z.string().url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL'),
  supabaseAnonKey: z.string().min(20, 'EXPO_PUBLIC_SUPABASE_ANON_KEY looks too short'),
});

export type Env = z.infer<typeof envSchema>;

export interface EnvResult {
  ok: boolean;
  env: Env | null;
  error: string | null;
}

function readEnv(): EnvResult {
  const parsed = envSchema.safeParse({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (parsed.success) return { ok: true, env: parsed.data, error: null };

  const issues = parsed.error.issues.map((issue) => `• ${issue.message}`).join('\n');
  return {
    ok: false,
    env: null,
    error: `Supabase is not configured.\n\n${issues}\n\nCopy .env.example to .env and fill in your project's values, then restart the dev server.`,
  };
}

export const envResult = readEnv();

/**
 * The validated environment. Throws if configuration is missing — call sites
 * that need to *report* the problem rather than crash should read `envResult`
 * instead. The root layout does exactly that, so the user sees an explanation
 * instead of a white screen.
 */
export function requireEnv(): Env {
  if (!envResult.env) throw new Error(envResult.error ?? 'Environment is not configured');
  return envResult.env;
}

export const isEnvConfigured = envResult.ok;
