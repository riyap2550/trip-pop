import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { DisplayFonts, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  /**
   * Serif display styles (title, subtitle, heading, accent) are for headings and warm touches.
   * Use the sans styles (default, small, smallBold) for prices, dates, and anything official.
   */
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'heading'
    | 'accent'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'heading' && styles.heading,
        type === 'accent' && styles.accent,
        type === 'link' && styles.link,
        type === 'linkPrimary' && [styles.linkPrimary, { color: theme.accent }],
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
  },
  // Custom font files carry their own weight, so display styles don't set fontWeight.
  title: {
    fontFamily: DisplayFonts.semiBold,
    fontSize: 52,
    lineHeight: 56,
  },
  subtitle: {
    fontFamily: DisplayFonts.semiBold,
    fontSize: 38,
    lineHeight: 44,
  },
  heading: {
    fontFamily: DisplayFonts.semiBold,
    fontSize: 22,
    lineHeight: 28,
  },
  accent: {
    fontFamily: DisplayFonts.mediumItalic,
    fontSize: 18,
    lineHeight: 24,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
