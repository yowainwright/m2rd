import * as React from 'react';

import { defaultTheme } from '@/app/lib/cli/themes/constants';
import type { Theme, ThemeContextValue } from '@/app/components/ui/types';

export const ThemeContext = React.createContext<ThemeContextValue>({
  setTheme: () => {},
  theme: defaultTheme,
});

export const useTheme = (): Theme => React.useContext(ThemeContext).theme;

export const useThemeUpdater = (): ((theme: Theme) => void) =>
  React.useContext(ThemeContext).setTheme;
