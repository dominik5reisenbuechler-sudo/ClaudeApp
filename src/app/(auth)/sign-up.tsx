import { View } from 'react-native';
import { Link } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/layout';
import { Callout, Text } from '@/components/ui';
import { AuthForm } from '@/features/auth/AuthForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

export default function SignUpScreen() {
  const theme = useTheme();
  const { signUp } = useAuth();

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Get started"
        title="Create your account"
        subtitle="Then a few questions, and you will have a plan built around your situation."
      />

      <AuthForm
        mode="sign-up"
        submitLabel="Create account"
        onSubmit={({ email, password, displayName }) => signUp(email, password, displayName)}
      />

      <Callout tone="info" title="Your data stays yours">
        Weight, nutrition and training data are private to your account and are never sold. You can
        export or permanently delete everything from your profile at any time.
      </Callout>

      <View style={{ alignItems: 'center', marginTop: theme.spacing.sm }}>
        <Link href="/sign-in">
          <Text variant="caption" tone="secondary">
            Already have an account? <Text tone="accent">Sign in</Text>
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
