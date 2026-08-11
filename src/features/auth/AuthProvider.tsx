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
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // With no backend configured there is no session to wait for, so the initial
  // value already reflects the final state rather than being corrected by an
  // effect on the first render.
  const [isLoading, setIsLoading] = useState(hasSupabase);

  useEffect(() => {
    if (!hasSupabase) return;

    const supabase = getSupabase();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,

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
    [session, isLoading],
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
