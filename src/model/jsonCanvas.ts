/**
 * Import / export in the open JSON Canvas format (https://jsoncanvas.org), the
 * `.canvas` format used by Obsidian. Styling not covered by the spec is stored in
 * extra `cm*` fields, which other apps ignore.
 */
import type { Board, CanvasEdge, CanvasNode, Doc, EndType, LineStyle, NodeShape, NodeStyle, PathType, Side } from './types';
import { makeEdge, makeNode, newId } from './defaults';

const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

export interface CanvasFile {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  cmBoard?: { name?: string; viewport?: Board['viewport'] };
}

export function toJsonCanvas(board: Pick<Board, 'nodes' | 'edges' | 'name' | 'viewport'>): CanvasFile {
  return {
    nodes: board.nodes.map((n) => {
      const base: Record<string, unknown> = {
        id: n.id,
        type: n.type,
        x: Math.round(n.x),
        y: Math.round(n.y),
        width: Math.round(n.width),
        height: Math.round(n.height),
      };
      if (n.color) base.color = n.color;
      if (n.type === 'group') {
        if (n.label) base.label = n.label;
      } else {
        base.text = n.text;
      }
      if (n.style !== 'filled') base.cmStyle = n.style;
      if (n.shape !== 'rect') base.cmShape = n.shape;
      return base;
    }),
    edges: board.edges.map((e) => {
      const out: Record<string, unknown> = { id: e.id, fromNode: e.fromNode, toNode: e.toNode };
      if (e.fromSide) out.fromSide = e.fromSide;
      if (e.toSide) out.toSide = e.toSide;
      if (e.fromEnd !== 'none') out.fromEnd = e.fromEnd;
      if (e.toEnd !== 'arrow') out.toEnd = e.toEnd;
      if (e.color) out.color = e.color;
      if (e.label) out.label = e.label;
      if (e.lineStyle !== 'solid') out.cmLineStyle = e.lineStyle;
      if (e.path !== 'curve') out.cmPath = e.path;
      if (e.width !== 2) out.cmWidth = e.width;
      return out;
    }),
    cmBoard: { name: board.name, viewport: board.viewport },
  };
}

export class ImportError extends Error {}

/** Parse a JSON Canvas document (or our own export). Throws ImportError on invalid input. */
export function fromJsonCanvas(raw: unknown): Doc & { name?: string } {
  if (!raw || typeof raw !== 'object') throw new ImportError('File is not a canvas document.');
  const data = raw as Partial<CanvasFile> & { board?: CanvasFile };
  const src: Partial<CanvasFile> = data.nodes ? data : data.board ?? {};
  if (!Array.isArray(src.nodes)) throw new ImportError('File has no "nodes" list.');
  const idMap = new Map<string, string>();
  const nodes: CanvasNode[] = [];
  for (const r of src.nodes) {
    if (!r || typeof r !== 'object') continue;
    const type = str(r.type, 'text');
    const oldId = str(r.id) || newId();
    const id = idMap.has(oldId) ? newId() : oldId;
    idMap.set(oldId, id);
    let text = str(r.text);
    if (type === 'file') text = `📄 ${str(r.file)}${r.subpath ? str(r.subpath) : ''}`;
    if (type === 'link') text = `🔗 <${str(r.url)}>`;
    nodes.push(
      makeNode({
        id,
        type: type === 'group' ? 'group' : 'text',
        x: num(r.x, 0),
        y: num(r.y, 0),
        width: Math.max(20, num(r.width, 240)),
        height: Math.max(20, num(r.height, 100)),
        text,
        label: type === 'group' ? str(r.label) : undefined,
        color: str(r.color),
        style: pick<NodeStyle>(r.cmStyle, ['filled', 'outline', 'plain'], type === 'group' ? 'outline' : 'filled'),
        shape: pick<NodeShape>(r.cmShape, ['rect', 'pill', 'ellipse'], 'rect'),
      }),
    );
  }
  const edges: CanvasEdge[] = [];
  for (const r of Array.isArray(src.edges) ? src.edges : []) {
    if (!r || typeof r !== 'object') continue;
    const fromNode = idMap.get(str(r.fromNode));
    const toNode = idMap.get(str(r.toNode));
    if (!fromNode || !toNode) continue;
    edges.push(
      makeEdge({
        id: str(r.id) || newId(),
        fromNode,
        toNode,
        fromSide: SIDES.includes(r.fromSide as Side) ? (r.fromSide as Side) : undefined,
        toSide: SIDES.includes(r.toSide as Side) ? (r.toSide as Side) : undefined,
        fromEnd: pick<EndType>(r.fromEnd, ['none', 'arrow'], 'none'),
        toEnd: pick<EndType>(r.toEnd, ['none', 'arrow'], 'arrow'),
        color: str(r.color),
        label: str(r.label) || undefined,
        lineStyle: pick<LineStyle>(r.cmLineStyle, ['solid', 'dashed', 'dotted'], 'solid'),
        path: pick<PathType>(r.cmPath, ['curve', 'straight', 'elbow'], 'curve'),
        width: Math.min(8, Math.max(1, num(r.cmWidth, 2))),
      }),
    );
  }
  // Groups first so they render beneath content
  nodes.sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1));
  return { nodes, edges, name: src.cmBoard?.name };
}

/** Export as a Markdown outline: roots (nodes without incoming edges) and their descendants. */
export function toMarkdownOutline(board: Pick<Board, 'nodes' | 'edges' | 'name'>): string {
  const textNodes = board.nodes.filter((n) => n.type === 'text');
  const byId = new Map(textNodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of board.edges) {
    if (!byId.has(e.fromNode) || !byId.has(e.toNode)) continue;
    // Edge direction: arrow at "to" means from → to. Arrow only at "from" reverses it.
    const [p, c] = e.fromEnd === 'arrow' && e.toEnd === 'none' ? [e.toNode, e.fromNode] : [e.fromNode, e.toNode];
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(c);
    hasParent.add(c);
  }
  const sortPos = (ids: string[]) =>
    ids.slice().sort((a, b) => byId.get(a)!.y - byId.get(b)!.y || byId.get(a)!.x - byId.get(b)!.x);
  const lines: string[] = [`# ${board.name}`, ''];
  const seen = new Set<string>();
  const firstLine = (t: string) => t.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).filter(Boolean).join(' — ') || '(empty)';
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    lines.push(`${'  '.repeat(depth)}- ${firstLine(byId.get(id)!.text)}`);
    for (const c of sortPos(children.get(id) ?? [])) walk(c, depth + 1);
  };
  const roots = sortPos(textNodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id));
  roots.forEach((r) => walk(r, 0));
  // Remaining nodes in cycles
  sortPos(textNodes.map((n) => n.id)).forEach((id) => walk(id, 0));
  return lines.join('\n') + '\n';
}
