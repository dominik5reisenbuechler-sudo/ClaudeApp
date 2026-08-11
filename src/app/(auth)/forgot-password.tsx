import { View } from 'react-native';
import { Link, useRouter } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/layout';
import { Text } from '@/components/ui';
import { AuthForm } from '@/features/auth/AuthForm';
import { useAuth } from '@/features/auth/AuthProvider';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { sendPasswordReset } = useAuth();

  return (
    <Screen>
      <ScreenHeader
        title="Reset your password"
        subtitle="We will email you a link to set a new one."
        onBack={() => router.back()}
      />

      <AuthForm
        mode="reset"
        submitLabel="Send reset link"
        onSubmit={({ email }) => sendPasswordReset(email)}
        successMessage="If an account exists for that address, a reset link is on its way. The link expires after an hour."
      />

      <View style={{ alignItems: 'center' }}>
        <Link href="/sign-in">
          <Text variant="caption" tone="accent">
            Back to sign in
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
