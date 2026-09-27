# m2rd

m2rd (Mermaid to React Diagrams) is a local-first Mermaid diagram editor. Mermaid is the source of truth; React Flow is the interactive view.

## Run locally

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open [http://localhost:54783/m2rd/](http://localhost:54783/m2rd/). Set `M2RD_APP_PORT` to use another port.

## Terminal preview

```sh
pnpm run cli:build
node tmp/cli/m2rd-cli.mjs diagram.mmd
cat diagram.mmd | node tmp/cli/m2rd-cli.mjs
```

Flowchart, sequence, and state previews open an interactive viewer. Use arrow keys or `h/j/k/l` to scroll, Page Up/Down to page, and `q` or Ctrl+C to quit. Resizing changes the visible area without rearranging the diagram. File input and piped input both require an interactive terminal.

`--width` sets the initial layout width hint; larger drawings remain scrollable. `--ascii`, `--color`, and `--no-color` control presentation. Parsing and unsupported-syntax errors exit nonzero. Class, ER, and Gantt support remains unfinished.

## Site structure

The repository root is the Next.js application.

```text
app/                  Next.js routes and application source
app/components/       Workspace UI, React Flow canvas, and shadcn UI
app/lib/              Shared utilities and observability
app/graph/             Graph model, translation, layout, and persistence
app/export/            Image and diagram export
tests/                Unit, integration, and end-to-end tests
```

## License

MIT
