import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import { Colors, DisplayFonts } from '@/constants/theme';

function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.tint,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.border,
      notification: c.danger,
    },
  };
}

export const NavigationThemes = { light: navigationTheme('light'), dark: navigationTheme('dark') };

/** Header for sheets that slide up over the app (editors, chat): serif title on the page background. */
export const sheetScreenOptions = {
  presentation: 'modal',
  headerShown: true,
  headerShadowVisible: false,
  headerTitleStyle: { fontFamily: DisplayFonts.semiBold, fontSize: 20 },
} as const;

/** Tab stacks: large serif titles that sit on the page background without a divider. */
export const largeTitleScreenOptions = {
  headerLargeTitle: true,
  headerLargeTitleShadowVisible: false,
  headerShadowVisible: false,
  headerLargeTitleStyle: { fontFamily: DisplayFonts.bold, fontSize: 40 },
  headerTitleStyle: { fontFamily: DisplayFonts.semiBold, fontSize: 22 },
} as const;
