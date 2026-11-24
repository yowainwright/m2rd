import type { Theme } from '@/app/components/ui/types';

export const defaultTheme: Theme = {
  border: {
    color: '#4B5563',
    focusColor: 'cyan',
    style: 'round',
  },
  colors: {
    accent: 'cyan',
    accentForeground: '#FFFFFF',
    background: '#000000',
    border: '#4B5563',
    error: '#EF4444',
    errorForeground: '#FFFFFF',

    focusRing: 'cyan',
    foreground: '#FFFFFF',
    info: '#3B82F6',
    infoForeground: '#FFFFFF',
    muted: '#374151',
    mutedForeground: '#9CA3AF',
    primary: 'cyan',
    primaryForeground: '#FFFFFF',

    secondary: '#6B7280',
    secondaryForeground: '#FFFFFF',
    selection: 'cyan',
    selectionForeground: '#FFFFFF',
    success: '#10B981',

    successForeground: '#FFFFFF',
    warning: '#F59E0B',
    warningForeground: '#000000',
  },
  name: 'default',
  spacing: {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    6: 6,
    8: 8,
  },
  typography: {
    base: '',
    bold: true,
    lg: 'bold',
    sm: 'dim',
    xl: 'bold',
  },
};
