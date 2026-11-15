# Canvas Mind — Implementation Plan

A mobile-first, offline-capable mind-mapping PWA inspired by Obsidian Canvas.

## 1. Stack & architecture

| Concern | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript | Mature, typed, component model fits nodes/edges/panels |
| Build | Vite 7 + `vite-plugin-pwa` (Workbox) | Fast dev, generated service worker + manifest |
| State | Zustand (single store, slices) | Tiny, selector-based re-render control (important for 60fps drags) |
| Markdown | `marked` + `DOMPurify` | GFM rendering, sanitized output |
| Persistence | IndexedDB via `idb-keyval` | Async, large quota, survives reloads/offline |
| Tests | Vitest (unit: store, geometry, history, import/export) + Playwright (e2e on phone viewports, portrait & landscape, touch) |

```
src/
  model/        types.ts, geometry.ts, jsonCanvas.ts (import/export), defaults.ts
  store/        store.ts (document + view + selection + history), persistence.ts
  canvas/       Canvas.tsx (gestures), NodeView.tsx, EdgeLayer.tsx, Handles, Marquee
  ui/           Toolbar, NodeToolbar, EdgeToolbar, BoardsPanel, Menu, Toast, icons
  lib/          markdown.ts, gestures.ts, download.ts
```

### Data model (JSON Canvas–compatible)
- **Board** `{ id, name, nodes[], edges[], viewport{x,y,zoom}, createdAt, updatedAt }`
- **Node** `{ id, type: 'text'|'group', x, y, width, height, text, color, style: 'filled'|'outline'|'plain', shape: 'rect'|'pill'|'ellipse', label? }`
- **Edge** `{ id, fromNode, fromSide, toNode, toSide, color, lineStyle: 'solid'|'dashed'|'dotted', path: 'curve'|'straight'|'elbow', fromEnd/toEnd: 'none'|'arrow', label?, width }`

Export format is the open **JSON Canvas** spec (`.canvas`, as used by Obsidian), with extra styling kept in extra fields, so files round-trip with Obsidian.

## 2. Interaction design (touch first)
| Gesture | Action |
|---|---|
| 1-finger drag on empty canvas | Pan (with inertia) |
| 2-finger pinch / drag | Zoom around fingers + pan |
| Double-tap empty canvas | Create node there, start editing |
| Long-press empty canvas / Select tool | Marquee multi-select |
| Tap node / edge | Select (shows contextual toolbar) |
| Drag node | Move (multi-selection moves together; groups carry contents) |
| Double-tap node / ✎ | Edit Markdown text in place |
| Corner handle | Resize (snaps to grid) |
| Drag a side dot | Draw a connection; drop on a node to connect, on empty space to create a connected node |
| Mouse: wheel = pan, ctrl/⌘+wheel = zoom, shortcuts (⌘Z, ⌘⇧Z, Del, ⌘D, ⌘A, ⌘G, Enter) |

## 3. UI layout
- Full-bleed canvas, dotted grid background, dark Obsidian-like palette (`#1e1e1e` / purple accent).
- One compact floating toolbar: bottom-centre in portrait, vertical on the left edge in landscape (keeps the short axis free). Holds: boards menu, add note, add group, select-mode, undo, redo, fit view, zoom %.
- Contextual toolbar floats above the selection (colors, shape/style, edit, duplicate, group, delete; for edges: line style, path type, arrowheads, label, color).
- Boards panel (slide-in sheet): list/create/rename/duplicate/delete boards, import/export (.canvas JSON, PNG, Markdown outline).
- Safe-area insets respected; 44px minimum touch targets; `touch-action: none` on canvas; animated transitions via CSS (transform/opacity only).

## 4. Core systems
1. **Viewport**: world→screen transform `screen = world * zoom + offset`; single CSS transform on the world layer; zoom clamped 0.1–4; zoom anchored to focal point; animated "fit to content".
2. **Gesture engine**: Pointer Events, tracks active pointers; disambiguates tap / double-tap / long-press / drag / pinch with distance & time thresholds; inertia for pans.
3. **History**: snapshot stack of `{nodes, edges}` (immutable, structurally shared). Continuous operations (drag/resize) commit once on pointer-up. Limit 100 entries per board.
4. **Autosave**: store subscription → debounced (400ms) write to IndexedDB + flush on `visibilitychange`/`pagehide`. Last-opened board restored on launch.
5. **Groups**: group nodes render beneath text nodes; dragging a group moves all nodes fully inside it; "Group" wraps the selection with padding.
6. **Edges**: anchor to the side facing the other node (auto) or an explicit side; cubic bezier / straight / elbow paths; arrowheads via SVG markers per color; wide invisible hit path for touch selection; label at midpoint.

## 5. Testing
- Unit (Vitest): geometry, store actions, undo/redo, group move, JSON Canvas round-trip, persistence.
- E2E (Playwright, Chromium with touch): iPhone-size portrait (390×844) and landscape (844×390), Pixel and tablet sizes: create/edit/markdown, move, resize, connect, edge styling, colors, grouping, undo/redo, persistence across reload, export/import, pinch zoom, PWA manifest + service worker.
- Visual check via screenshots in both orientations; fix layout issues found.

## 6. Delivery steps
1. Scaffold + model + store + persistence (with unit tests)
2. Canvas rendering + viewport + gestures
3. Nodes: create/edit/markdown/move/resize/delete
4. Edges: connect, render, style, select
5. Toolbars, colors, groups, boards panel
6. Import/export, PWA, icons
7. E2E tests on phone sizes → bug fixing → polish
