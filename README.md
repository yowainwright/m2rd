# m2rd

[![Test](https://github.com/yowainwright/m2rd/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/yowainwright/m2rd/actions/workflows/test.yml)
[![Deploy GitHub Pages](https://github.com/yowainwright/m2rd/actions/workflows/gh-pages.yml/badge.svg?branch=main)](https://github.com/yowainwright/m2rd/actions/workflows/gh-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

m2rd, mermaid to react diagram, is built to help render mermaid within terminal and web app. The benefit is being able to see mermaid anywhere, specifically during agentic coding. Another benefit is this tool allows for saving to an image. The web app specifically, allows you to edit the mermaid display and save that. All of this done in such a way to provide clarity for both the human and agent during planning and documentation phases of development.

Mermaid is the source of truth.
m2rd provides a web app, which provides a mermaid editor and the diagram.
In the terminal, it provides a cli which renders diagrams via a tui.

---

## usage

To use the web app, just go to https://jeffry.in/m2rd/.

> jeffry.in is my personal site; all posted in [Github](<>) if you're curious (or for security purposes).

You can use it locally if you would like by cloning the project, running install, and run dev.
See the [npm scripts](https://github.com/yowainwright/m2rd/blob/main/package.json#L21-L65) if you want the exact scripts.

```sh
mise install
pnpm install
pnpm run dev
```

To use the cli, pipe the mermaid content in and lets m2rd take care of the rest.

```sh
brew install yowainwright/tap/m2rd
```

> If this project were to et 225+ stars, we will then move it into brew official.
> Until then, I, @yowainwright, will do due diligence to provide release provenance. Please reach out with concerns.

Then run

```sh
printf 'flowchart LR\n  A[Hello] --> B[m2rd]\n' | m2rd
```

You will observe a basic mermaid chart in the Terminal.

That's it!

---

## CLI API

### `m2rd [files...]`

> Type: **`file paths or stdin`**
> Default: **`stdin`**

View Mermaid text or the fenced `mermaid` blocks in Markdown files. Run the viewer in an interactive terminal.

#### Pipe Mermaid text

```sh
printf 'flowchart LR\n  A[Read] --> B[Render] --> C[View]\n' | m2rd
```

#### Read a Markdown file

Save this as `example.md`:

````markdown
# Example diagrams

```mermaid
flowchart LR
  A[Read] --> B[Render] --> C[View]
```

```mermaid
sequenceDiagram
  User->>CLI: Mermaid text
  CLI-->>User: Diagram
```
````

Then open it:

```sh
m2rd example.md
```

Use `n` for the next diagram, `p` for the previous one, and `q` to quit. Arrow keys or `h/j/k/l` scroll the current diagram.

You can also pipe the Markdown:

```sh
cat example.md | m2rd
```

#### Read multiple Markdown files

```sh
m2rd example.md another.md
m2rd docs/*.md
```

Files and diagrams appear in order, one diagram at a time. Markdown files without Mermaid blocks are skipped.

---

## License

[MIT](./LICENSE)
