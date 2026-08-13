import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { getSupabase, hasSupabase } from '@/lib/supabase';

/**
 * Session state for the whole app.
 *
 * Supabase's client owns token storage and refresh; this provider only mirrors
 * its state into React and exposes the handful of auth actions the UI needs.
 * Nothing here decides *authorisation* — that is enforced by RLS in the
 * database, so a bug in this file cannot expose another user's data.
 */

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read from storage. */
  isLoading: boolean;
  /**
   * Set when restoring the session failed or timed out. The app continues as
   * signed-out — this exists so the UI can say *why* rather than presenting an
   * unexplained sign-in screen.
   */
  startupError: string | null;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

/**
 * How long to wait for the stored session before giving up on it.
 *
 * Reading local storage is instant; the slow path is a stored token that has
 * expired, where the client attempts a network refresh first. If that cannot
 * complete — wrong project URL, no connectivity, storage blocked by the
 * browser — the app must still boot. Waiting forever turns a fixable
 * configuration mistake into a screen that never changes and says nothing.
 */
const SESSION_RESTORE_TIMEOUT_MS = 8_000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // With no backend configured there is no session to wait for, so the initial
  // value already reflects the final state rather than being corrected by an
  // effect on the first render.
  const [isLoading, setIsLoading] = useState(hasSupabase);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabase) return;

    const supabase = getSupabase();
    let active = true;

    /**
     * Stop waiting, once. Every path out of session restoration goes through
     * here — success, failure and timeout — so there is no combination of them
     * that leaves the app on its loading screen.
     */
    const settle = (error: string | null) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      if (error !== null) setStartupError(error);
      setIsLoading(false);
    };

    const timer = setTimeout(
      () =>
        settle(
          'Could not reach your Supabase project while restoring your session. Check that EXPO_PUBLIC_SUPABASE_URL points at your project and that you are online, then restart the dev server.',
        ),
      SESSION_RESTORE_TIMEOUT_MS,
    );

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setSession(data.session);
        settle(error ? error.message : null);
      })
      .catch((cause: unknown) => {
        // Reached when the storage adapter throws — a browser with storage
        // blocked, most often — or when the refresh request fails outright.
        settle(
          cause instanceof Error
            ? `Could not restore your session: ${cause.message}`
            : 'Could not restore your session.',
        );
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      // A real auth event supersedes a failed restore: signing in successfully
      // means whatever went wrong a moment ago is no longer worth reporting.
      setStartupError(null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      startupError,

      signUp: async (email, password, displayName) => {
        const { error } = await getSupabase().auth.signUp({
          email: email.trim(),
          password,
          // Picked up by the handle_new_user() trigger to seed the profile.
          options: displayName ? { data: { display_name: displayName.trim() } } : undefined,
        });
        if (error) throw error;
      },

      signIn: async (email, password) => {
        const { error } = await getSupabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },

      signOut: async () => {
        const { error } = await getSupabase().auth.signOut();
        if (error) throw error;
      },

      sendPasswordReset: async (email) => {
        const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
      },
    }),
    [session, isLoading, startupError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

/**
 * The signed-in user's id, for calls that cannot run without one. Throws rather
 * than returning null so a query is never silently issued for "no user", which
 * RLS would answer with an empty result that looks like real data.
 */
export function useUserId(): string {
  const { user } = useAuth();
  if (!user) throw new Error('useUserId called without an authenticated user');
  return user.id;
}
