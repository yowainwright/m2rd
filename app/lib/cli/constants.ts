export const DEFAULT_WIDTH = 80;
export const MIN_WIDTH = 16;
export const MAX_WIDTH = 500;
export const MAX_RENDER_CELLS = 200_000;
export const MERMAID_RENDER_ID = 'm2rd-terminal';
export const CLI_HELP = `Usage: m2rd [file.mmd] [--width columns] [--ascii] [--color | --no-color]

  cat chart.mmd | m2rd
  m2rd chart.mmd --width 60

Opens an interactive viewer. An interactive terminal is required.
Arrow keys or h/j/k/l scroll; Page Up/Down page vertically; Home/End jump; q or Ctrl+C quit.
Resize changes the visible area without rearranging the diagram.
--width sets the initial layout width hint, not a limit on the scrollable drawing.

Flowchart preview: horizontal graphs are arranged top-to-bottom.
Node shapes are shown as boxes; decision boxes have an accented border.
Solid flowchart edges are supported; subgraphs are still being implemented.
Sequence preview: participant boxes, solid/dashed messages, self messages, and branch frames.
Sequence notes, activations, and participant groups are not supported yet.
State preview: nested frames, labeled transitions, start/end boxes, and choice/fork/join labels.
State notes and concurrent regions are not supported yet.
Other chart families are still being implemented.`;
