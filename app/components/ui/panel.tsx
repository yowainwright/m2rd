import { useIsScreenReaderEnabled, Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { useTheme } from '@/app/hooks/useTheme';
import { useUnicode } from '@/app/hooks/useUnicode';
import { resolveBorderStyle } from '@/app/components/ui/terminal-style';
import type { BorderStyle } from '@/app/components/ui/types';

export interface PanelProps {
  title?: string;
  titleColor?: string;
  borderColor?: string;
  borderStyle?: BorderStyle;
  bordered?: boolean;
  width?: number;
  height?: number;
  paddingX?: number;
  paddingY?: number;
  children?: ReactNode;
  'aria-label'?: string;
}

export const Panel = (props: PanelProps) => {
  const {
    title,
    titleColor,
    borderColor,
    borderStyle,
    bordered = true,
    width,
    height,
    paddingX = 1,
    paddingY = 0,
    children,
    'aria-label': ariaLabel,
  } = props;
  const unicode = useUnicode();
  const theme = useTheme();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();

  const inner = (
    <>
      {title && (
        <Box
          paddingX={paddingX}
          borderStyle={resolveBorderStyle('single', unicode)}
          borderColor={borderColor ?? theme.colors.border}
        >
          <Text bold color={titleColor ?? theme.colors.primary}>
            {title}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" paddingX={paddingX} paddingY={paddingY}>
        {children}
      </Box>
    </>
  );

  if (!bordered) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        {ariaLabel && <Text aria-label={ariaLabel}>{''}</Text>}
        {inner}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle={resolveBorderStyle(
        isScreenReaderEnabled ? undefined : (borderStyle ?? theme.border.style),
        unicode,
      )}
      borderColor={borderColor ?? theme.colors.border}
      width={width}
      height={height}
    >
      {ariaLabel && <Text aria-label={ariaLabel}>{''}</Text>}
      {inner}
    </Box>
  );
};
