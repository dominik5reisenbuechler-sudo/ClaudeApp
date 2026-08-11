import { Text as RNText } from 'react-native';
import type { TextProps as RNTextProps, TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { Theme } from '@/theme/tokens';

/**
 * The only text primitive. Screens never use `react-native`'s `Text` directly,
 * because doing so is how a typographic scale quietly becomes seventeen
 * arbitrary font sizes.
 */

export type TextVariant =
  | 'hero'
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'mono';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'success' | 'warning' | 'danger' | 'onAccent';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
}

function variantStyle(theme: Theme, variant: TextVariant): TextStyle {
  const { fontSize, fontWeight, lineHeight } = theme;
  switch (variant) {
    case 'hero':
      return {
        fontSize: fontSize.hero,
        fontWeight: fontWeight.bold,
        lineHeight: fontSize.hero * lineHeight.tight,
        letterSpacing: -1,
      };
    case 'display':
      return {
        fontSize: fontSize.display,
        fontWeight: fontWeight.bold,
        lineHeight: fontSize.display * lineHeight.tight,
        letterSpacing: -0.6,
      };
    case 'title':
      return {
        fontSize: fontSize.xxl,
        fontWeight: fontWeight.bold,
        lineHeight: fontSize.xxl * lineHeight.tight,
        letterSpacing: -0.4,
      };
    case 'heading':
      return {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
        lineHeight: fontSize.lg * lineHeight.normal,
      };
    case 'bodyStrong':
      return {
        fontSize: fontSize.md,
        fontWeight: fontWeight.semibold,
        lineHeight: fontSize.md * lineHeight.normal,
      };
    case 'caption':
      return {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.regular,
        lineHeight: fontSize.sm * lineHeight.normal,
      };
    case 'label':
      return {
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        lineHeight: fontSize.xs * lineHeight.normal,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
      };
    case 'mono':
      return {
        fontSize: fontSize.md,
        fontWeight: fontWeight.medium,
        fontVariant: ['tabular-nums'],
      };
    case 'body':
    default:
      return {
        fontSize: fontSize.md,
        fontWeight: fontWeight.regular,
        lineHeight: fontSize.md * lineHeight.normal,
      };
  }
}

function toneColor(theme: Theme, tone: TextTone): string {
  const c = theme.colors;
  const map: Record<TextTone, string> = {
    primary: c.textPrimary,
    secondary: c.textSecondary,
    tertiary: c.textTertiary,
    accent: c.accent,
    success: c.success,
    warning: c.warning,
    danger: c.danger,
    onAccent: c.textOnAccent,
  };
  return map[tone];
}

export function Text({
  variant = 'body',
  tone = 'primary',
  align,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      style={[variantStyle(theme, variant), { color: toneColor(theme, tone) }, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
