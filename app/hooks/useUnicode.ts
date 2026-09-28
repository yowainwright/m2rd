import * as React from 'react';

import type { UnicodeContextValue } from '@/app/components/ui/types';

const getEnv = (name: string): string | undefined => {
  const hasEnvironment = typeof process !== 'undefined' && process.env;
  if (!hasEnvironment) return undefined;
  return process.env[name];
};

const getPlatform = () => {
  const hasPlatform = typeof process !== 'undefined' && process.platform;
  if (!hasPlatform) return 'browser';
  return process.platform;
};

const detectUnicodeSupport = (): boolean => {
  if (typeof window !== 'undefined') {
    return true;
  }

  const unicodeOptOut = getEnv('NO_UNICODE');
  const disabled = unicodeOptOut === '1' || unicodeOptOut === 'true';
  if (disabled) {
    return false;
  }

  const platform = getPlatform();

  if (getEnv('WSL_DISTRO_NAME')) {
    return true;
  }
  if (getEnv('WT_SESSION')) {
    return true;
  }
  if (getEnv('TERM_PROGRAM') === 'vscode') {
    return true;
  }
  if (getEnv('MSYSTEM')) {
    return false;
  }
  const supportedPlatform = platform === 'darwin' || platform === 'linux';
  if (supportedPlatform) {
    return true;
  }

  return true;
};

export const isNoUnicode = (): boolean => !detectUnicodeSupport();

export const UnicodeContext = React.createContext<UnicodeContextValue>({
  unicode: !isNoUnicode(),
});

export const useUnicode = (): boolean => React.useContext(UnicodeContext).unicode;
