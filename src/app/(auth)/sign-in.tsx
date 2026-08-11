import { View } from 'react-native';
import { Link } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/layout';
import { Text } from '@/components/ui';
import { AuthForm } from '@/features/auth/AuthForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

export default function SignInScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Welcome back"
        title="Sign in"
        subtitle="Pick up where your training and nutrition left off."
      />

      <AuthForm
        mode="sign-in"
        submitLabel="Sign in"
        onSubmit={({ email, password }) => signIn(email, password)}
      />

      <View style={{ gap: theme.spacing.md, alignItems: 'center' }}>
        <Link href="/forgot-password">
          <Text variant="caption" tone="accent">
            Forgot your password?
          </Text>
        </Link>
        <Link href="/sign-up">
          <Text variant="caption" tone="secondary">
            No account yet? <Text tone="accent">Create one</Text>
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
