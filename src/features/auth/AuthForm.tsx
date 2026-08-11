import { useState } from 'react';
import { View } from 'react-native';
import { z } from 'zod';

import { Button, Callout, Input, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Shared email/password form.
 *
 * Sign-in, sign-up and password reset differ only in which fields they show and
 * what happens on submit, so they share one component rather than three
 * near-identical ones that drift apart.
 */

export const emailSchema = z.string().trim().email('Please enter a valid email address');
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Passwords are limited to 72 characters');

export type AuthMode = 'sign-in' | 'sign-up' | 'reset';

interface AuthFormProps {
  mode: AuthMode;
  submitLabel: string;
  onSubmit: (values: { email: string; password: string; displayName: string }) => Promise<void>;
  /** Shown on success instead of the form — used by the reset flow. */
  successMessage?: string;
}

export function AuthForm({ mode, submitLabel, onSubmit, successMessage }: AuthFormProps) {
  const theme = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const needsPassword = mode !== 'reset';

  const handleSubmit = async () => {
    const emailResult = emailSchema.safeParse(email);
    const passwordResult = needsPassword ? passwordSchema.safeParse(password) : null;

    const nextErrors: { email?: string; password?: string } = {};
    if (!emailResult.success) nextErrors.email = emailResult.error.issues[0]?.message;
    if (passwordResult && !passwordResult.success) {
      nextErrors.password = passwordResult.error.issues[0]?.message;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      await onSubmit({ email: email.trim(), password, displayName });
      setSucceeded(true);
    } catch (caught) {
      setFormError(toUserMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (succeeded && successMessage) {
    return (
      <Callout tone="success" title="Check your inbox">
        {successMessage}
      </Callout>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      {mode === 'sign-up' ? (
        <Input
          label="Name"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
        />
      ) : null}

      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        {...(errors.email ? { error: errors.email } : {})}
      />

      {needsPassword ? (
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
          {...(errors.password ? { error: errors.password } : {})}
          {...(mode === 'sign-up' ? { hint: 'At least 8 characters.' } : {})}
        />
      ) : null}

      {formError ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {formError}
          </Text>
        </Callout>
      ) : null}

      <Button label={submitLabel} loading={isSubmitting} onPress={() => void handleSubmit()} />
    </View>
  );
}

/**
 * Turn a Supabase auth error into something a person can act on.
 *
 * Sign-in failures stay deliberately vague about *which* credential was wrong —
 * saying "no account with that email" would confirm to anyone who asks whether
 * a given address is registered.
 */
function toUserMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/invalid login credentials/i.test(raw)) return 'That email and password do not match.';
  if (/email not confirmed/i.test(raw)) {
    return 'Please confirm your email address first — check your inbox for the link.';
  }
  if (/user already registered/i.test(raw)) {
    return 'There is already an account with that email. Try signing in instead.';
  }
  if (/rate limit|too many/i.test(raw)) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (/network|fetch/i.test(raw)) return 'We could not reach the server. Check your connection.';

  return raw;
}
