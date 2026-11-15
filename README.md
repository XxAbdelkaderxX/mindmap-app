# Canvas Mind

A mobile-first mind-mapping app on an infinite canvas, inspired by Obsidian Canvas. It works offline and can be installed as a PWA.

## Features
- **Infinite canvas**: one-finger pan with inertia, pinch to zoom, wheel and ⌘/Ctrl+wheel on desktop, animated zoom-to-fit
- **Notes**: create (double-tap or **+**), edit in Markdown (GFM: headings, lists, clickable task lists, code, quotes, tables, links), move, resize, duplicate, delete
- **Connections**: drag a side dot onto a note, drop it on empty space to create a connected note, or tap a dot to grow the map in that direction. Lines can be curved, straight or elbow; solid, dashed or dotted; in 4 widths; with arrow at the end, start, both or neither; with a label and a color
- **Styles**: 6 preset colors plus a custom color, filled/outline/plain styles, and rectangle/pill/ellipse shapes
- **Groups**: wrap the selection in a group, rename it, drag it (its contents move with it), ungroup
- **Selection**: tap, long-press to add to the selection, box-select (tool or long-press and drag), shift/⌘ click
- **Undo/redo**: covers every change. A drag or a typing session counts as one step
- **Autosave**: saved to IndexedDB, with multiple boards (create, rename, duplicate, delete). The last board reopens on launch
- **Import/export**: `.canvas` in the open [JSON Canvas](https://jsoncanvas.org) format, which opens in Obsidian; PNG image; Markdown outline. You can also drag a file onto the app, or use "Open with…" from an installed PWA
- **PWA**: installable and works offline (Workbox service worker)

## Development
```bash
npm install
npm run dev          # dev server
npm run build        # type-check + production build (dist/)
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright, touch input on phone/tablet viewports)
```

## Architecture
See [docs/PLAN.md](docs/PLAN.md). In short:
- `src/model`: types, geometry, JSON Canvas import/export (pure, unit-tested)
- `src/store`: Zustand store holding the document, selection and undo history, plus IndexedDB persistence
- `src/canvas`: canvas rendering and the pointer gesture engine (tap, double-tap, long-press, drag, pinch)
- `src/ui`: toolbars, boards panel, menus
