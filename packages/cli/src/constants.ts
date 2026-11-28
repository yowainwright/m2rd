export const DEFAULT_WIDTH = 80;
export const MIN_WIDTH = 16;
export const MAX_WIDTH = 500;
export const MAX_RENDER_CELLS = 200_000;
export const MERMAID_RENDER_ID = 'm2rd-terminal';
export const CLI_HELP = `Usage: m2rd [files...] [--width columns] [--ascii] [--color | --no-color]

  cat chart.mmd | m2rd
  cat README.md | m2rd
  m2rd README.md docs/*.md
  m2rd chart.mmd --width 60
  m2rd chart.mmd --output chart.svg
  cat chart.mmd | m2rd -o chart.svg
  m2rd --styleguide
  m2rd --styleguide -o styleguide.svg

--styleguide shows an example diagram with its color palette below.
Scrolls in a terminal; prints a static preview when piped or in CI.
Press s in the styleguide to save m2rd-styleguide.svg in the current directory.
Combine with --output to export a Mermaid SVG theme sample.

--output (-o) writes a static SVG without opening the viewer or requiring a terminal.
Requires exactly one diagram, including when reading Markdown.
Uses cyan/slate image defaults; customize with Mermaid frontmatter config.themeVariables.
The output must end in .svg and must not already exist. PNG/GIF are not supported.

Opens an interactive viewer. An interactive terminal is required.
Accepts raw Mermaid or Markdown with fenced mermaid blocks, from files or stdin.
Multiple files and blocks appear in order. Markdown files without diagrams are skipped.
p selects the previous diagram; n selects the next. Navigation stops at either end.
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
