import { Box, Text } from 'ink';
import { useTheme } from '@/app/hooks/useTheme';
import { useUnicode } from '@/app/hooks/useUnicode';
import type { ScrollbarProps, ScrollViewProps } from './types';

const Scrollbar = ({ length, contentLength, offset, vertical = false }: ScrollbarProps) => {
  const theme = useTheme();
  const unicode = useUnicode();
  const total = Math.max(length, contentLength);
  const size = Math.max(1, Math.round((length / total) * length));
  const maximum = Math.max(0, total - length);
  const start = maximum ? Math.round((offset / maximum) * (length - size)) : 0;
  const track = vertical ? '│' : '─';
  const trackChar = unicode ? track : '.';
  const thumbChar = unicode ? '█' : '#';
  const segments = Array.from({ length }, (_, index) => {
    const isThumb = index >= start && index < start + size;
    const color = isThumb ? theme.colors.primary : theme.colors.mutedForeground;
    const glyph = isThumb ? thumbChar : trackChar;
    const last = index === length - 1;
    const lineBreak = vertical && !last;
    const newline = lineBreak ? '\n' : '';
    return (
      <Text key={index} color={color}>
        {glyph}
        {newline}
      </Text>
    );
  });
  return <Text aria-hidden>{segments}</Text>;
};

export const ScrollView = ({
  width,
  height,
  contentWidth,
  contentHeight,
  scrollLeft,
  scrollTop,
  children,
  'aria-label': ariaLabel = 'Diagram',
}: ScrollViewProps) => {
  const left = Math.max(0, Math.min(scrollLeft, contentWidth - width));
  const top = Math.max(0, Math.min(scrollTop, contentHeight - height));
  const marginLeft = -left;
  const marginTop = -top;
  const description = `${ariaLabel}. Column ${left + 1}, row ${top + 1}.`;
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box flexDirection="row" height={height} flexShrink={0}>
        <Box width={width} height={height} overflow="hidden" flexShrink={0}>
          <Box
            width={contentWidth}
            height={contentHeight}
            flexShrink={0}
            marginLeft={marginLeft}
            marginTop={marginTop}
            flexDirection="column"
          >
            <Text aria-label={description}>{''}</Text>
            {children}
          </Box>
        </Box>
        <Scrollbar length={height} contentLength={contentHeight} offset={top} vertical />
      </Box>
      <Scrollbar length={width} contentLength={contentWidth} offset={left} />
    </Box>
  );
};
