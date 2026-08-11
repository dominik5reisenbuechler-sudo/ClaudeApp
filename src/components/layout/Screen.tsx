import { Pressable, ScrollView, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView. Off for screens that own their own list. */
  scroll?: boolean;
  /** Pinned to the bottom, outside the scroll area — primary actions live here. */
  footer?: React.ReactNode;
  padded?: boolean;
  style?: ViewStyle;
}

export function Screen({
  children,
  scroll = true,
  footer,
  padded = true,
  style,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const contentPadding = padded ? theme.spacing.xl : 0;

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: contentPadding,
        paddingBottom: contentPadding + theme.spacing.xxl,
        gap: theme.spacing.xl,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding: contentPadding, gap: theme.spacing.xl }}>{children}</View>
  );

  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}>
      {body}
      {footer ? (
        <View
          style={{
            padding: theme.spacing.xl,
            paddingBottom: Math.max(insets.bottom, theme.spacing.xl),
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            gap: theme.spacing.md,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Rendered above the title — a step counter, an eyebrow label. */
  eyebrow?: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  onBack,
  trailing,
}: ScreenHeaderProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {onBack || trailing ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing.sm,
          }}
        >
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack}>
              <Text variant="heading" tone="secondary">
                ←
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
          {trailing ?? <View />}
        </View>
      ) : null}

      {eyebrow ? (
        <Text variant="label" tone="tertiary">
          {eyebrow}
        </Text>
      ) : null}
      <Text variant="title">{title}</Text>
      {subtitle ? (
        <Text variant="body" tone="secondary">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.sm,
      }}
    >
      <Text variant="label" tone="tertiary">
        {title}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress}>
          <Text variant="caption" tone="accent">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
