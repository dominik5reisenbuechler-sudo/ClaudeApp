/**
 * Design tokens.
 *
 * These are the only place raw values live. Components reference tokens;
 * screens reference components. A hex code or a magic number appearing in a
 * screen file is a bug (CLAUDE.md §3).
 *
 * The look is premium/athletic/minimal: near-black surfaces, one confident
 * accent, generous spacing, no gradients, no decorative animation.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 34,
  hero: 44,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const lineHeight = {
  tight: 1.15,
  normal: 1.4,
  relaxed: 1.6,
} as const;

export const borderWidth = {
  hairline: 1,
  thick: 2,
} as const;

/** Minimum touch target, per platform accessibility guidance. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH_SIZE = 44;

/**
 * Semantic colour roles. Every colour a component can use has a name that says
 * what it is *for*, not what it looks like — that is what makes a second theme
 * possible without touching component code.
 */
export interface ColorPalette {
  /** App background, behind everything. */
  background: string;
  /** Raised container: cards, sheets. */
  surface: string;
  /** A surface on top of a surface: inputs, inner rows. */
  surfaceElevated: string;
  /** Pressed/selected background wash. */
  surfacePressed: string;

  border: string;
  borderStrong: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** Text on top of `accent`. */
  textOnAccent: string;

  accent: string;
  accentMuted: string;

  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;

  /** Macro identity colours, used consistently everywhere macros appear. */
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;

  /** Neutral track behind any progress indicator. */
  track: string;
  overlay: string;
}

export const darkColors: ColorPalette = {
  background: '#0B0B0F',
  surface: '#15161C',
  surfaceElevated: '#1E202A',
  surfacePressed: '#262935',

  border: '#262935',
  borderStrong: '#3A3E4D',

  textPrimary: '#F5F6F8',
  textSecondary: '#A2A7B6',
  textTertiary: '#6E7385',
  textOnAccent: '#0B0B0F',

  accent: '#C6F24E',
  accentMuted: '#2B3316',

  success: '#4ADE80',
  successMuted: '#14311F',
  warning: '#FBBF24',
  warningMuted: '#3A2C0A',
  danger: '#F87171',
  dangerMuted: '#3A1717',

  protein: '#C6F24E',
  carbs: '#60A5FA',
  fat: '#FBBF24',
  fiber: '#A78BFA',

  track: '#262935',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const lightColors: ColorPalette = {
  background: '#FAFAFB',
  surface: '#FFFFFF',
  surfaceElevated: '#F2F3F5',
  surfacePressed: '#E7E9EC',

  border: '#E4E6EA',
  borderStrong: '#C9CDD5',

  textPrimary: '#101117',
  textSecondary: '#5B6072',
  textTertiary: '#8A8FA0',
  textOnAccent: '#101117',

  accent: '#8DBF15',
  accentMuted: '#EEF7D3',

  success: '#16A34A',
  successMuted: '#DCFCE7',
  warning: '#D97706',
  warningMuted: '#FEF3C7',
  danger: '#DC2626',
  dangerMuted: '#FEE2E2',

  protein: '#8DBF15',
  carbs: '#2563EB',
  fat: '#D97706',
  fiber: '#7C3AED',

  track: '#E4E6EA',
  overlay: 'rgba(15, 17, 23, 0.45)',
};

export type ThemeName = 'light' | 'dark';

export interface Theme {
  name: ThemeName;
  colors: ColorPalette;
  spacing: typeof spacing;
  radii: typeof radii;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  lineHeight: typeof lineHeight;
  borderWidth: typeof borderWidth;
}

const shared = { spacing, radii, fontSize, fontWeight, lineHeight, borderWidth };

export const darkTheme: Theme = { name: 'dark', colors: darkColors, ...shared };
export const lightTheme: Theme = { name: 'light', colors: lightColors, ...shared };

export const themes: Record<ThemeName, Theme> = { dark: darkTheme, light: lightTheme };
