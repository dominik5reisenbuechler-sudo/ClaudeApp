import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import { Button, Callout, Card, Chip, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useActiveGoal, useActiveTarget, useProfile } from '@/hooks/useProfile';
import { deleteAllUserData } from '@/services/accountService';
import { GOAL_LABELS } from '@/domain/nutrition/goalAdjustment';
import { useTheme, useThemePreference } from '@/theme/ThemeProvider';
import type { ThemePreference } from '@/theme/ThemeProvider';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ProfileScreen() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { user, signOut } = useAuth();
  const profile = useProfile();
  const goal = useActiveGoal();
  const target = useActiveTarget();

  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = () => {
    Alert.alert(
      'Delete your data?',
      'This permanently removes your profile, goals, targets and every log. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => void runDelete(),
        },
      ],
    );
  };

  const runDelete = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      const result = await deleteAllUserData(user.id);
      await signOut();
      if (!result.authRecordRemoved) {
        // Say exactly what happened. Claiming a complete deletion that did not
        // happen would be worse than the incomplete deletion itself.
        Alert.alert(
          'Your data has been deleted',
          'Every record we stored about you is gone. Your login itself still exists until the server-side deletion function is deployed — contact support if you need it removed now.',
        );
      }
    } catch (error) {
      Alert.alert(
        'Deletion failed',
        error instanceof Error ? error.message : 'Please try again in a moment.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Profile" {...(user?.email ? { subtitle: user.email } : {})} />

      {profile.data ? (
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <Row label="Name" value={profile.data.display_name ?? '—'} />
            <Row label="Height" value={profile.data.height_cm ? `${profile.data.height_cm} cm` : '—'} />
            <Row label="Goal" value={goal.data ? GOAL_LABELS[goal.data.goal] : '—'} />
            <Row
              label="Daily calories"
              value={target.data ? `${target.data.energy_kcal} kcal` : '—'}
            />
            <Row label="Protein" value={target.data ? `${target.data.protein_g} g` : '—'} />
          </View>
        </Card>
      ) : null}

      <View>
        <SectionHeader title="Appearance" />
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {THEME_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={preference === option.value}
              onPress={() => setPreference(option.value)}
            />
          ))}
        </View>
      </View>

      <View>
        <SectionHeader title="Your data" />
        <Callout tone="info">
          Your health and nutrition data is private to your account, enforced by row-level security
          in the database rather than by the app. It is never sold.
        </Callout>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        <Button
          label="Delete my data"
          variant="danger"
          loading={isDeleting}
          onPress={confirmDelete}
        />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text variant="caption">{value}</Text>
    </View>
  );
}
