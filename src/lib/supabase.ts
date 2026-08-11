import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { envResult } from './env';
import type { Database } from '@/types/database';

/**
 * The Supabase client.
 *
 * `detectSessionInUrl` is false because there is no browser URL to inspect in a
 * native app; OAuth redirects are handled explicitly through deep links.
 *
 * The session is persisted to AsyncStorage and refreshed automatically, so a
 * returning user is signed in before the first frame renders.
 *
 * Authorisation lives in the database, not here. This client holds the anon
 * key, which grants nothing on its own — every table is behind RLS.
 */

export type TypedSupabaseClient = SupabaseClient<Database>;

function createSupabaseClient(): TypedSupabaseClient | null {
  if (!envResult.env) return null;

  return createClient<Database>(envResult.env.supabaseUrl, envResult.env.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

const client = createSupabaseClient();

/**
 * Returns the client, or throws with an actionable message when the app is
 * unconfigured. Services call this rather than importing a possibly-null value,
 * so a misconfiguration surfaces as one clear error instead of a cascade of
 * "cannot read property from null".
 */
export function getSupabase(): TypedSupabaseClient {
  if (!client) {
    throw new Error(envResult.error ?? 'Supabase client is not configured');
  }
  return client;
}

/** True when the app has enough configuration to talk to a backend at all. */
export const hasSupabase = client !== null;
