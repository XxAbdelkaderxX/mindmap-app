import { nanoid } from 'nanoid';
import type { Board, CanvasEdge, CanvasNode } from './types';

export const GRID = 20;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const MIN_NODE_W = 80;
export const MIN_NODE_H = 40;
export const DEFAULT_NODE_W = 240;
export const DEFAULT_NODE_H = 100;

/** Six JSON Canvas preset colors, tuned for the dark theme. */
export const PRESET_COLORS: Record<string, string> = {
  '1': '#e5534b', // red
  '2': '#e0823d', // orange
  '3': '#d9b72b', // yellow
  '4': '#44b37f', // green
  '5': '#3fa7c9', // cyan
  '6': '#a882ff', // purple
};

export const COLOR_CHOICES: { id: string; name: string }[] = [
  { id: '', name: 'Default' },
  { id: '1', name: 'Red' },
  { id: '2', name: 'Orange' },
  { id: '3', name: 'Yellow' },
  { id: '4', name: 'Green' },
  { id: '5', name: 'Cyan' },
  { id: '6', name: 'Purple' },
];

export const NEUTRAL = '#8a8a8a';

export function resolveColor(c: string | undefined, fallback = NEUTRAL): string {
  if (!c) return fallback;
  if (PRESET_COLORS[c]) return PRESET_COLORS[c];
  return /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback;
}

export const newId = () => nanoid(12);

export function makeNode(partial: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: newId(),
    type: 'text',
    x: 0,
    y: 0,
    width: DEFAULT_NODE_W,
    height: DEFAULT_NODE_H,
    text: '',
    color: '',
    style: 'filled',
    shape: 'rect',
    ...partial,
  };
}

export function makeEdge(partial: Partial<CanvasEdge> & Pick<CanvasEdge, 'fromNode' | 'toNode'>): CanvasEdge {
  return {
    id: newId(),
    fromEnd: 'none',
    toEnd: 'arrow',
    color: '',
    lineStyle: 'solid',
    path: 'curve',
    width: 2,
    ...partial,
  };
}

export function makeBoard(name = 'Untitled board', withSample = false): Board {
  const now = Date.now();
  const board: Board = {
    id: newId(),
    name,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
  if (withSample) Object.assign(board, sampleDoc());
  return board;
}

function sampleDoc() {
  const center = makeNode({
    x: -130, y: -50, width: 260, height: 100, color: '6',
    text: '# Canvas Mind\nIdeas on an **infinite canvas**.',
  });
  const a = makeNode({
    x: 200, y: -280, width: 240, height: 160, color: '5',
    text: '### Gestures\n- Drag to **pan**, pinch to **zoom**\n- Double‑tap empty space to add a note\n- Long‑press to box‑select',
  });
  const b = makeNode({
    x: 200, y: 100, width: 240, height: 160, color: '4',
    text: '### Connect\nSelect a note, then drag a **side dot** onto another note — or tap it to grow the map.',
  });
  const c = makeNode({
    x: -440, y: -260, width: 220, height: 140, color: '3',
    text: '### Markdown\n*Italic*, **bold**, `code`\n- [x] task lists\n> quotes',
  });
  const d = makeNode({
    x: -440, y: 120, width: 220, height: 100, color: '2', shape: 'pill',
    text: 'Everything **autosaves** and works offline.',
  });
  const group = makeNode({
    type: 'group', x: -480, y: -300, width: 300, height: 560, label: 'Basics', color: '', style: 'outline',
  });
  return {
    nodes: [group, center, a, b, c, d],
    edges: [
      makeEdge({ fromNode: center.id, toNode: a.id, color: '5' }),
      makeEdge({ fromNode: center.id, toNode: b.id, color: '4', lineStyle: 'dashed' }),
      makeEdge({ fromNode: center.id, toNode: c.id, color: '3' }),
      makeEdge({ fromNode: center.id, toNode: d.id, color: '2', path: 'elbow', label: 'offline' }),
    ],
  };
}
