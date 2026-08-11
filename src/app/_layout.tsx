import { useEffect } from 'react';
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

  const { session, isLoading: authLoading } = useAuth();
  const { needsOnboarding } = useOnboardingStatus();

  const group = segments[0];
  const isResolving = authLoading || (Boolean(session) && needsOnboarding === null);

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
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
        <LoadingState label="Getting things ready…" />
      </View>
    );
  }

  return <Slot />;
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
