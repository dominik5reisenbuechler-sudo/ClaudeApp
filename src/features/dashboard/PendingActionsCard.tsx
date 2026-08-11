import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import type { PendingAction } from '@/domain/progress/pendingActions';
import { useTheme } from '@/theme/ThemeProvider';

interface PendingActionsCardProps {
  actions: readonly PendingAction[];
}

/**
 * The "still to do" list.
 *
 * An empty list is a real, positive state — everything that can be done today
 * has been — so it gets its own message rather than rendering an empty card.
 */
export function PendingActionsCard({ actions }: PendingActionsCardProps) {
  const theme = useTheme();

  if (actions.length === 0) {
    return (
      <Card tone="accent">
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="bodyStrong" tone="accent">
            Nothing left today
          </Text>
          <Text variant="caption" tone="secondary">
            Everything you can log today is logged. Consistency like this is what makes the
            adaptive targets work.
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ gap: theme.spacing.lg }}>
        <Text variant="label" tone="tertiary">
          Still to do
        </Text>

        <View style={{ gap: theme.spacing.md }}>
          {actions.map((action) => (
            <View
              key={action.kind}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
              }}
            >
              <Text variant="body">{action.label}</Text>
              {action.detail ? (
                <Text variant="caption" tone="tertiary">
                  {action.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}
