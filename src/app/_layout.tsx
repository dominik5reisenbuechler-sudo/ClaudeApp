import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Slot, SplashScreen, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Callout, LoadingState, Text } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { envResult } from '@/lib/env';
import { createQueryClient } from '@/lib/queryClient';
import { useOnboardingStatus } from '@/hooks/useProfile';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();

const queryClient = createQueryClient();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemedStatusBar />
            <RouteGate />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.name === 'dark' ? 'light' : 'dark'} />;
}

/**
 * The single navigation gate.
 *
 *   no session                      → (auth)
 *   session, onboarding incomplete  → (onboarding)
 *   otherwise                       → (tabs)
 *
 * Every redirect decision lives here. Scattering `router.replace` calls through
 * screens is how apps end up with redirect loops that only reproduce on a cold
 * start.
 */
function RouteGate() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();

  const { session, isLoading: authLoading, startupError } = useAuth();
  const { needsOnboarding } = useOnboardingStatus();

  const group = segments[0];
  const isResolving = authLoading || (Boolean(session) && needsOnboarding === null);

  // A boot that is still resolving after this long is not slow, it is stuck.
  // Session restoration has its own timeout; this covers everything after it —
  // most often the profile query against a project whose migrations have not
  // been applied. Either way the user gets something to act on instead of a
  // spinner that never resolves and never explains itself.
  const isStuck = useStuckAfter(isResolving, 12_000);

  useEffect(() => {
    if (isResolving) return;

    void SplashScreen.hideAsync();

    if (!session) {
      if (group !== '(auth)') router.replace('/sign-in');
      return;
    }

    if (needsOnboarding === true) {
      if (group !== '(onboarding)') router.replace('/welcome');
      return;
    }

    if (group === '(auth)' || group === '(onboarding)') router.replace('/');
  }, [isResolving, session, needsOnboarding, group, router]);

  if (!envResult.ok) return <ConfigurationError message={envResult.error ?? ''} />;

  if (isResolving) {
    if (isStuck) return <StuckBoot />;

    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
        <LoadingState label="Getting things ready…" />
      </View>
    );
  }

  return (
    <>
      {startupError ? (
        <View style={{ padding: theme.spacing.md, backgroundColor: theme.colors.background }}>
          <Callout tone="warning" title="Signed out">
            <Text variant="caption" tone="secondary">
              {startupError}
            </Text>
          </Callout>
        </View>
      ) : null}
      <Slot />
    </>
  );
}

/**
 * True once `active` has stayed true for longer than it plausibly should.
 *
 * Resets whenever the condition clears, so a slow-but-successful boot never
 * leaves the warning on screen behind a working app.
 */
function useStuckAfter(active: boolean, afterMs: number): boolean {
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    if (!active) return;

    const timer = setTimeout(() => setIsStuck(true), afterMs);

    // Clearing on the way out rather than on the way in: this runs exactly when
    // `active` stops being true, which is the moment the warning stops applying.
    return () => {
      clearTimeout(timer);
      setIsStuck(false);
    };
  }, [active, afterMs]);

  return isStuck;
}

/**
 * Shown when boot has not resolved in a reasonable time.
 *
 * Deliberately a checklist rather than an apology. The three causes below are,
 * in order, what actually goes wrong on a freshly connected project — and the
 * host is printed because a URL pointing at the wrong project is invisible from
 * the symptom and instantly obvious once you read it back.
 */
function StuckBoot() {
  const theme = useTheme();
  const host = safeHost(process.env.EXPO_PUBLIC_SUPABASE_URL);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        padding: theme.spacing.xl,
        gap: theme.spacing.lg,
      }}
    >
      <Text variant="title">This is taking too long</Text>

      <Callout tone="warning" title="The app cannot finish starting">
        <Text variant="caption" tone="secondary">
          {`It is configured to talk to ${host}. If that is not your project, the URL in .env is wrong — and note that .env is only read when the dev server starts, so it needs a restart after any change.`}
        </Text>
      </Callout>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" tone="tertiary">
          Usually one of three things
        </Text>
        <Text variant="caption" tone="secondary">
          1. The database migrations have not been applied yet, so the tables the
          app reads on startup do not exist. Run everything in supabase/migrations
          in filename order, then the files in supabase/seed.
        </Text>
        <Text variant="caption" tone="secondary">
          2. EXPO_PUBLIC_SUPABASE_ANON_KEY is not the anon/publishable key from
          Settings → API. A service-role key is rejected by design and must never
          be in the app.
        </Text>
        <Text variant="caption" tone="secondary">
          3. The dev server is still running with the values it read at launch.
          Stop it and start it again.
        </Text>
      </View>

      <Text variant="caption" tone="tertiary">
        The browser console, or the terminal running Expo, will name the failing
        request directly.
      </Text>
    </View>
  );
}

/** Host only — never the key, and never a crash on a malformed value. */
function safeHost(url: string | undefined): string {
  if (!url) return 'no configured project';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Shown when the app has no Supabase configuration. A blank screen with a
 * console error is not a debuggable state for whoever picks this up next.
 */
function ConfigurationError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        padding: theme.spacing.xl,
        gap: theme.spacing.lg,
      }}
    >
      <Text variant="title">Configuration needed</Text>
      <Callout tone="danger">
        <Text variant="caption" tone="secondary">
          {message}
        </Text>
      </Callout>
    </View>
  );
}
