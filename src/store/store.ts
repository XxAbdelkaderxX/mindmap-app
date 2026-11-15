import { create } from 'zustand';
import type { Board, BoardMeta, CanvasEdge, CanvasNode, Doc, Point, Rect, Viewport } from '../model/types';
import { DEFAULT_NODE_H, DEFAULT_NODE_W, GRID, makeBoard, makeEdge, makeNode, newId } from '../model/defaults';
import { boundsOf, rectContains, snap } from '../model/geometry';

export type Tool = 'pan' | 'select';
const HISTORY_LIMIT = 100;

export interface AppState {
  ready: boolean;
  boards: BoardMeta[];
  board: Board;
  viewport: Viewport;
  selectedNodes: ReadonlySet<string>;
  selectedEdges: ReadonlySet<string>;
  editingId: string | null;
  editingEdgeId: string | null;
  tool: Tool;
  past: Doc[];
  future: Doc[];
  /** Snapshot taken at the start of a continuous gesture (drag / resize). */
  transientBase: Doc | null;
  /** Monotonic counter bumped whenever the document changes (used by autosave). */
  revision: number;
  snapToGrid: boolean;
}

const emptySet: ReadonlySet<string> = new Set();
const docOf = (b: Doc): Doc => ({ nodes: b.nodes, edges: b.edges });

export const useStore = create<AppState>()(() => ({
  ready: false,
  boards: [],
  board: makeBoard(),
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodes: emptySet,
  selectedEdges: emptySet,
  editingId: null,
  editingEdgeId: null,
  tool: 'pan',
  past: [],
  future: [],
  transientBase: null,
  revision: 0,
  snapToGrid: true,
}));

const get = useStore.getState;
const set = useStore.setState;

// ---------------------------------------------------------------------------
// Document mutation primitives
// ---------------------------------------------------------------------------

function applyDoc(doc: Doc, extra: Partial<AppState> = {}) {
  const s = get();
  set({
    board: { ...s.board, nodes: doc.nodes, edges: doc.edges, updatedAt: Date.now() },
    revision: s.revision + 1,
    ...extra,
  });
}

let lastCoalesce: string | null = null;

/**
 * Apply a recorded change: pushes the current doc to history.
 * Consecutive commits with the same `coalesce` key form a single undo step
 * (used for typing inside a node).
 */
export function commit(fn: (doc: Doc) => Doc, extra: Partial<AppState> = {}, coalesce: string | null = null) {
  if (get().transientBase) endTransient();
  const s = get();
  const before = docOf(s.board);
  const after = fn(before);
  if (after.nodes === before.nodes && after.edges === before.edges) {
    if (Object.keys(extra).length) set(extra);
    return;
  }
  const merge = coalesce !== null && coalesce === lastCoalesce && s.past.length > 0;
  lastCoalesce = coalesce;
  const past = merge ? s.past : [...s.past, before];
  if (past.length > HISTORY_LIMIT) past.shift();
  applyDoc(after, { past, future: [], ...extra });
}

/** End any running coalesced edit so the next commit becomes its own undo step. */
export function breakCoalesce() {
  lastCoalesce = null;
}

/** Begin a continuous change (drag/resize); intermediate states aren't recorded. */
export function beginTransient() {
  lastCoalesce = null;
  const s = get();
  if (!s.transientBase) set({ transientBase: docOf(s.board) });
}

export function updateTransient(fn: (doc: Doc) => Doc) {
  const s = get();
  const before = docOf(s.board);
  const after = fn(before);
  if (after.nodes === before.nodes && after.edges === before.edges) return;
  applyDoc(after);
}

export function endTransient() {
  const s = get();
  const base = s.transientBase;
  if (!base) return;
  const cur = docOf(s.board);
  if (base.nodes === cur.nodes && base.edges === cur.edges) {
    set({ transientBase: null });
    return;
  }
  const past = [...s.past, base];
  if (past.length > HISTORY_LIMIT) past.shift();
  set({ transientBase: null, past, future: [], revision: s.revision + 1 });
}

export function undo() {
  lastCoalesce = null;
  const s = get();
  if (s.transientBase) endTransient();
  const { past, future, board } = get();
  if (!past.length) return;
  const prev = past[past.length - 1];
  applyDoc(prev, {
    past: past.slice(0, -1),
    future: [docOf(board), ...future],
    ...pruneSelection(prev),
    editingId: null,
    editingEdgeId: null,
  });
}

export function redo() {
  lastCoalesce = null;
  const { past, future, board } = get();
  if (!future.length) return;
  const next = future[0];
  applyDoc(next, {
    past: [...past, docOf(board)],
    future: future.slice(1),
    ...pruneSelection(next),
    editingId: null,
    editingEdgeId: null,
  });
}

function pruneSelection(doc: Doc) {
  const s = get();
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const edgeIds = new Set(doc.edges.map((e) => e.id));
  return {
    selectedNodes: new Set([...s.selectedNodes].filter((id) => nodeIds.has(id))),
    selectedEdges: new Set([...s.selectedEdges].filter((id) => edgeIds.has(id))),
  };
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export function selectNodes(ids: Iterable<string>, additive = false) {
  const s = get();
  const next = new Set(additive ? s.selectedNodes : []);
  for (const id of ids) next.add(id);
  set({ selectedNodes: next, selectedEdges: additive ? s.selectedEdges : emptySet, editingEdgeId: null });
}

export function toggleNodeSelection(id: string) {
  const next = new Set(get().selectedNodes);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  set({ selectedNodes: next });
}

export function selectEdge(id: string, additive = false) {
  const s = get();
  const next = new Set(additive ? s.selectedEdges : []);
  next.add(id);
  set({ selectedEdges: next, selectedNodes: additive ? s.selectedNodes : emptySet, editingId: null });
}

export function clearSelection() {
  const s = get();
  if (!s.selectedNodes.size && !s.selectedEdges.size && !s.editingId && !s.editingEdgeId) return;
  set({ selectedNodes: emptySet, selectedEdges: emptySet, editingId: null, editingEdgeId: null });
}

export function selectAll() {
  const s = get();
  set({ selectedNodes: new Set(s.board.nodes.map((n) => n.id)), selectedEdges: emptySet });
}

export function setTool(tool: Tool) {
  set({ tool });
}

export function setEditing(id: string | null) {
  set({ editingId: id, editingEdgeId: null });
}

export function setEditingEdge(id: string | null) {
  set({ editingEdgeId: id, editingId: null });
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export function maybeSnap(v: number) {
  return get().snapToGrid ? snap(v) : Math.round(v);
}

/** Create a text node centred on `at` (world coords). Returns its id. */
export function addNode(at: Point, partial: Partial<CanvasNode> = {}, opts: { edit?: boolean } = {}): string {
  const width = partial.width ?? DEFAULT_NODE_W;
  const height = partial.height ?? DEFAULT_NODE_H;
  const node = makeNode({
    ...partial,
    width,
    height,
    x: maybeSnap(at.x - width / 2),
    y: maybeSnap(at.y - height / 2),
  });
  commit(
    (d) => ({ ...d, nodes: node.type === 'group' ? [node, ...d.nodes] : [...d.nodes, node] }),
    {
      selectedNodes: new Set([node.id]),
      selectedEdges: emptySet,
      editingId: opts.edit ? node.id : null,
    },
  );
  return node.id;
}

export function updateNode(id: string, patch: Partial<CanvasNode>, coalesce: string | null = null) {
  commit((d) => {
    const idx = d.nodes.findIndex((n) => n.id === id);
    if (idx < 0) return d;
    const cur = d.nodes[idx];
    const changed = (Object.keys(patch) as (keyof CanvasNode)[]).some((k) => cur[k] !== patch[k]);
    if (!changed) return d;
    const nodes = d.nodes.slice();
    nodes[idx] = { ...cur, ...patch };
    return { ...d, nodes };
  }, {}, coalesce);
}

/** Apply a patch to every selected node (recorded as one history step). */
export function updateSelectedNodes(patch: Partial<CanvasNode> | ((n: CanvasNode) => Partial<CanvasNode>)) {
  const sel = get().selectedNodes;
  if (!sel.size) return;
  commit((d) => {
    let changed = false;
    const nodes = d.nodes.map((n) => {
      if (!sel.has(n.id)) return n;
      const p = typeof patch === 'function' ? patch(n) : patch;
      if ((Object.keys(p) as (keyof CanvasNode)[]).every((k) => n[k] === p[k])) return n;
      changed = true;
      return { ...n, ...p };
    });
    return changed ? { ...d, nodes } : d;
  });
}

/** Ids of nodes fully inside any of the given groups (recursively). */
export function groupContents(nodes: CanvasNode[], groupIds: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const queue = [...groupIds];
  while (queue.length) {
    const gid = queue.pop()!;
    const g = nodes.find((n) => n.id === gid);
    if (!g || g.type !== 'group') continue;
    for (const n of nodes) {
      if (n.id === gid || out.has(n.id)) continue;
      if (rectContains(g, n)) {
        out.add(n.id);
        if (n.type === 'group') queue.push(n.id);
      }
    }
  }
  return out;
}

/** Nodes to move when dragging `ids`: the ids plus contents of any dragged groups. */
export function dragSet(ids: Iterable<string>): Set<string> {
  const nodes = get().board.nodes;
  const set1 = new Set(ids);
  for (const id of groupContents(nodes, set1)) set1.add(id);
  return set1;
}

export function moveNodesTransient(origin: Map<string, Point>, dx: number, dy: number) {
  updateTransient((d) => ({
    ...d,
    nodes: d.nodes.map((n) => {
      const o = origin.get(n.id);
      if (!o) return n;
      const x = o.x + dx;
      const y = o.y + dy;
      return n.x === x && n.y === y ? n : { ...n, x, y };
    }),
  }));
}

export function resizeNodeTransient(id: string, rect: Rect) {
  updateTransient((d) => ({
    ...d,
    nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...rect } : n)),
  }));
}

export function deleteSelection() {
  const s = get();
  const nodeIds = s.selectedNodes;
  const edgeIds = s.selectedEdges;
  if (!nodeIds.size && !edgeIds.size) return;
  commit(
    (d) => ({
      nodes: d.nodes.filter((n) => !nodeIds.has(n.id)),
      edges: d.edges.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.fromNode) && !nodeIds.has(e.toNode)),
    }),
    { selectedNodes: emptySet, selectedEdges: emptySet, editingId: null, editingEdgeId: null },
  );
}

/** Duplicate selected nodes (and edges between them); selects the copies. */
export function duplicateSelection(offset = GRID * 2) {
  const s = get();
  const ids = dragSet(s.selectedNodes);
  if (!ids.size) return;
  const map = new Map<string, string>();
  const copies: CanvasNode[] = [];
  for (const n of s.board.nodes) {
    if (!ids.has(n.id)) continue;
    const id = newId();
    map.set(n.id, id);
    copies.push({ ...n, id, x: n.x + offset, y: n.y + offset });
  }
  const edgeCopies: CanvasEdge[] = s.board.edges
    .filter((e) => map.has(e.fromNode) && map.has(e.toNode))
    .map((e) => ({ ...e, id: newId(), fromNode: map.get(e.fromNode)!, toNode: map.get(e.toNode)! }));
  const groups = copies.filter((c) => c.type === 'group');
  const others = copies.filter((c) => c.type !== 'group');
  commit(
    (d) => ({ nodes: [...groups, ...d.nodes, ...others], edges: [...d.edges, ...edgeCopies] }),
    { selectedNodes: new Set(copies.map((c) => c.id)), selectedEdges: emptySet },
  );
}

/** Wrap the selected nodes in a new group. */
export function groupSelection(label = 'Group') {
  const s = get();
  const sel = s.board.nodes.filter((n) => s.selectedNodes.has(n.id));
  const b = boundsOf(sel);
  if (!b) return;
  const pad = GRID * 2;
  const group = makeNode({
    type: 'group',
    label,
    style: 'outline',
    x: snap(b.x - pad),
    y: snap(b.y - pad * 2),
    width: snap(b.width + pad * 2) + GRID,
    height: snap(b.height + pad * 3) + GRID,
  });
  commit((d) => ({ ...d, nodes: [group, ...d.nodes] }), {
    selectedNodes: new Set([group.id]),
    selectedEdges: emptySet,
  });
}

/** Remove selected groups but keep their contents. */
export function ungroupSelection() {
  const s = get();
  const groups = new Set(s.board.nodes.filter((n) => n.type === 'group' && s.selectedNodes.has(n.id)).map((n) => n.id));
  if (!groups.size) return;
  const contents = groupContents(s.board.nodes, groups);
  commit(
    (d) => ({
      nodes: d.nodes.filter((n) => !groups.has(n.id)),
      edges: d.edges.filter((e) => !groups.has(e.fromNode) && !groups.has(e.toNode)),
    }),
    { selectedNodes: new Set([...contents].filter((id) => !groups.has(id))) },
  );
}

/** Move the given (non-group) nodes to the top of the z-order. */
export function bringToFront(ids: Iterable<string>) {
  const set1 = new Set(ids);
  commit((d) => {
    const front = d.nodes.filter((n) => set1.has(n.id) && n.type !== 'group');
    if (!front.length) return d;
    const rest = d.nodes.filter((n) => !front.includes(n));
    const already = d.nodes.slice(-front.length).every((n, i) => n === front[i]);
    return already ? d : { ...d, nodes: [...rest, ...front] };
  });
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export function addEdge(partial: Partial<CanvasEdge> & Pick<CanvasEdge, 'fromNode' | 'toNode'>): string | null {
  if (partial.fromNode === partial.toNode) return null;
  const s = get();
  const dup = s.board.edges.find(
    (e) => e.fromNode === partial.fromNode && e.toNode === partial.toNode && e.fromSide === partial.fromSide && e.toSide === partial.toSide,
  );
  if (dup) return dup.id;
  const edge = makeEdge(partial);
  commit((d) => ({ ...d, edges: [...d.edges, edge] }));
  return edge.id;
}

/** Create a node at `at` connected from `fromNode` in one history step. */
export function addConnectedNode(fromNode: string, fromSide: CanvasEdge['fromSide'], at: Point, toSide: CanvasEdge['toSide']): string {
  const s = get();
  const src = s.board.nodes.find((n) => n.id === fromNode);
  const node = makeNode({
    x: maybeSnap(at.x - DEFAULT_NODE_W / 2),
    y: maybeSnap(at.y - DEFAULT_NODE_H / 2),
    color: src?.type === 'text' ? src.color : '',
    shape: src?.type === 'text' ? src.shape : 'rect',
    style: src?.type === 'text' ? src.style : 'filled',
  });
  const edge = makeEdge({ fromNode, toNode: node.id, fromSide, toSide });
  commit((d) => ({ nodes: [...d.nodes, node], edges: [...d.edges, edge] }), {
    selectedNodes: new Set([node.id]),
    selectedEdges: emptySet,
    editingId: node.id,
  });
  return node.id;
}

export function updateSelectedEdges(patch: Partial<CanvasEdge>) {
  const sel = get().selectedEdges;
  if (!sel.size) return;
  commit((d) => {
    let changed = false;
    const edges = d.edges.map((e) => {
      if (!sel.has(e.id)) return e;
      if ((Object.keys(patch) as (keyof CanvasEdge)[]).every((k) => e[k] === patch[k])) return e;
      changed = true;
      return { ...e, ...patch };
    });
    return changed ? { ...d, edges } : d;
  });
}

export function updateEdge(id: string, patch: Partial<CanvasEdge>, coalesce: string | null = null) {
  commit((d) => {
    const idx = d.edges.findIndex((e) => e.id === id);
    if (idx < 0) return d;
    const cur = d.edges[idx];
    if ((Object.keys(patch) as (keyof CanvasEdge)[]).every((k) => cur[k] === patch[k])) return d;
    const edges = d.edges.slice();
    edges[idx] = { ...cur, ...patch };
    return { ...d, edges };
  }, {}, coalesce);
}

export function reverseSelectedEdges() {
  const sel = get().selectedEdges;
  commit((d) => ({
    ...d,
    edges: d.edges.map((e) =>
      sel.has(e.id)
        ? { ...e, fromNode: e.toNode, toNode: e.fromNode, fromSide: e.toSide, toSide: e.fromSide, fromEnd: e.toEnd, toEnd: e.fromEnd }
        : e,
    ),
  }));
}

// ---------------------------------------------------------------------------
// Viewport & boards
// ---------------------------------------------------------------------------

export function setViewport(vp: Viewport) {
  set({ viewport: vp });
}

/** Replace the current board (used when opening/importing). Clears history. */
export function loadBoard(board: Board) {
  lastCoalesce = null;
  set({
    board,
    viewport: board.viewport,
    past: [],
    future: [],
    transientBase: null,
    selectedNodes: emptySet,
    selectedEdges: emptySet,
    editingId: null,
    editingEdgeId: null,
    revision: get().revision + 1,
  });
}

export function renameCurrentBoard(name: string) {
  const s = get();
  const trimmed = name.trim() || 'Untitled board';
  set({
    board: { ...s.board, name: trimmed, updatedAt: Date.now() },
    boards: s.boards.map((b) => (b.id === s.board.id ? { ...b, name: trimmed } : b)),
    revision: s.revision + 1,
  });
}

export function boardMeta(b: Board): BoardMeta {
  return { id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, nodeCount: b.nodes.length };
}

export { makeBoard };

/** Insert nodes/edges (with fresh ids), centred on `at`; selects them. */
export function insertDoc(doc: Doc, at: Point | null) {
  if (!doc.nodes.length) return;
  const b = boundsOf(doc.nodes)!;
  const dx = at ? maybeSnap(at.x - (b.x + b.width / 2)) : 0;
  const dy = at ? maybeSnap(at.y - (b.y + b.height / 2)) : 0;
  const map = new Map<string, string>();
  const nodes = doc.nodes.map((n) => {
    const id = newId();
    map.set(n.id, id);
    return { ...n, id, x: n.x + dx, y: n.y + dy };
  });
  const edges = doc.edges
    .filter((e) => map.has(e.fromNode) && map.has(e.toNode))
    .map((e) => ({ ...e, id: newId(), fromNode: map.get(e.fromNode)!, toNode: map.get(e.toNode)! }));
  const groups = nodes.filter((n) => n.type === 'group');
  const others = nodes.filter((n) => n.type !== 'group');
  commit((d) => ({ nodes: [...groups, ...d.nodes, ...others], edges: [...d.edges, ...edges] }), {
    selectedNodes: new Set(nodes.map((n) => n.id)),
    selectedEdges: emptySet,
    editingId: null,
  });
}

/** The selected nodes plus edges between them, as a standalone doc. */
export function selectionDoc(): Doc {
  const s = get();
  const ids = dragSet(s.selectedNodes);
  return {
    nodes: s.board.nodes.filter((n) => ids.has(n.id)),
    edges: s.board.edges.filter((e) => ids.has(e.fromNode) && ids.has(e.toNode)),
  };
}
