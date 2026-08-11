import { Stack } from 'expo-router';

import { OnboardingDraftProvider } from '@/features/onboarding/draft';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The draft provider wraps the whole group, so answers survive navigation
 * between steps as well as the app being closed mid-flow.
 */
export default function OnboardingLayout() {
  const theme = useTheme();

  return (
    <OnboardingDraftProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
          gestureEnabled: false,
        }}
      />
    </OnboardingDraftProvider>
  );
}
