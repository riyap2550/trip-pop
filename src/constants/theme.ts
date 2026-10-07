/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

/** Brand palette. Theme colors below are these, or tints/shades of them chosen for legible contrast. */
export const Palette = {
  navy: '#123047',
  ocean: '#278EA5',
  seafoam: '#A9D6C7',
  sand: '#F4E9D8',
  white: '#FFFDFC',
} as const;

// `tint` fills buttons and selected controls, with `tintText` on top. `accent` is for icons and
// decoration only: ocean blue is too light behind or as small text.
export const Colors = {
  light: {
    text: Palette.navy,
    background: Palette.sand,
    backgroundElement: Palette.white,
    backgroundSelected: '#E2F1EC', // seafoam on white
    backgroundPast: Palette.seafoam, // behind past trips
    textSecondary: '#4F6474',
    tint: Palette.navy,
    tintText: Palette.white,
    accent: Palette.ocean,
    border: '#E3D6C1',
    hero: Palette.navy,
    heroText: Palette.white,
    heroMuted: Palette.seafoam,
    shadow: 'rgba(18, 48, 71, 0.08)',
    success: '#23775D',
    warning: '#A3620F',
    danger: '#B8432E',
  },
  dark: {
    text: Palette.white,
    background: '#0B1F2F', // deeper navy
    backgroundElement: Palette.navy,
    backgroundSelected: '#1D4563',
    backgroundPast: '#1F4F66', // deep ocean teal
    textSecondary: '#A9C3CC',
    tint: Palette.seafoam,
    tintText: Palette.navy,
    accent: '#4DB1C7', // ocean, lifted for dark backgrounds
    border: '#23496A',
    hero: Palette.navy,
    heroText: Palette.white,
    heroMuted: Palette.seafoam,
    shadow: 'transparent',
    success: '#7FD1B0',
    warning: '#F2C572',
    danger: '#FF8A73',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

/**
 * Cormorant Garamond, loaded in the root layout. It's for headings and friendly touches only.
 * Prices, dates, requirements, and controls stay in the system font so they read clearly.
 * Cormorant runs small for its point size, so display styles are set a little larger.
 */
export const DisplayFonts = {
  medium: 'CormorantGaramond_500Medium',
  mediumItalic: 'CormorantGaramond_500Medium_Italic',
  semiBold: 'CormorantGaramond_600SemiBold',
  semiBoldItalic: 'CormorantGaramond_600SemiBold_Italic',
  bold: 'CormorantGaramond_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
