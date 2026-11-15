import type { CanvasEdge, CanvasNode, PathType, Point, Rect, Side, Viewport } from './types';
import { GRID, MAX_ZOOM, MIN_ZOOM } from './defaults';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const snap = (v: number, step = GRID) => Math.round(v / step) * step;

export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.zoom, y: (p.y - vp.y) / vp.zoom };
}

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.zoom + vp.x, y: p.y * vp.zoom + vp.y };
}

/** Zoom to `zoom` keeping the screen point `focus` fixed. */
export function zoomAt(vp: Viewport, zoom: number, focus: Point): Viewport {
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const world = screenToWorld(focus, vp);
  return { zoom: z, x: focus.x - world.x * z, y: focus.y - world.y * z };
}

export function rectsIntersect(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function rectContains(outer: Rect, inner: Rect) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function pointInRect(p: Point, r: Rect) {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function normRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Viewport that fits `bounds` into a screen of size w×h, inside `insets`, with padding. */
export function fitViewport(
  bounds: Rect | null,
  w: number,
  h: number,
  pad = 48,
  maxZoom = 1,
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 },
): Viewport {
  const aw = Math.max(40, w - insets.left - insets.right);
  const ah = Math.max(40, h - insets.top - insets.bottom);
  const cx = insets.left + aw / 2;
  const cy = insets.top + ah / 2;
  if (!bounds) return { x: cx, y: cy, zoom: 1 };
  const zoom = clamp(
    Math.min((aw - pad * 2) / Math.max(bounds.width, 1), (ah - pad * 2) / Math.max(bounds.height, 1)),
    MIN_ZOOM,
    maxZoom,
  );
  return {
    zoom,
    x: cx - (bounds.x + bounds.width / 2) * zoom,
    y: cy - (bounds.y + bounds.height / 2) * zoom,
  };
}

export function sidePoint(r: Rect, side: Side): Point {
  switch (side) {
    case 'top': return { x: r.x + r.width / 2, y: r.y };
    case 'bottom': return { x: r.x + r.width / 2, y: r.y + r.height };
    case 'left': return { x: r.x, y: r.y + r.height / 2 };
    case 'right': return { x: r.x + r.width, y: r.y + r.height / 2 };
  }
}

export const sideNormal: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Best side of `r` to face the point `p`. */
export function facingSide(r: Rect, p: Point): Side {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const dx = (p.x - cx) / Math.max(r.width, 1);
  const dy = (p.y - cy) / Math.max(r.height, 1);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'bottom' : 'top';
}

export function center(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function resolveSides(from: Rect, to: Rect, edge: Pick<CanvasEdge, 'fromSide' | 'toSide'>): [Side, Side] {
  const fs = edge.fromSide ?? facingSide(from, edge.toSide ? sidePoint(to, edge.toSide) : center(to));
  const ts = edge.toSide ?? facingSide(to, sidePoint(from, fs));
  return [fs, ts];
}

export interface EdgeGeometry {
  d: string;
  start: Point;
  end: Point;
  mid: Point;
  startAngle: number;
  endAngle: number;
}

/** Path from point a (leaving along side sa) to point b (entering along side sb). */
export function buildPath(a: Point, sa: Side | null, b: Point, sb: Side | null, type: PathType): EdgeGeometry {
  const na = sa ? sideNormal[sa] : null;
  const nb = sb ? sideNormal[sb] : null;
  let d: string;
  let mid: Point;
  let startAngle: number;
  let endAngle: number;
  if (type === 'straight') {
    d = `M${a.x},${a.y} L${b.x},${b.y}`;
    mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    startAngle = endAngle = Math.atan2(b.y - a.y, b.x - a.x);
  } else if (type === 'elbow') {
    const off = 24;
    const p1 = na ? { x: a.x + na.x * off, y: a.y + na.y * off } : a;
    const p4 = nb ? { x: b.x + nb.x * off, y: b.y + nb.y * off } : b;
    const horizontalFirst = sa ? sa === 'left' || sa === 'right' : Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
    let p2: Point, p3: Point;
    if (horizontalFirst) {
      const mx = (p1.x + p4.x) / 2;
      p2 = { x: mx, y: p1.y };
      p3 = { x: mx, y: p4.y };
    } else {
      const my = (p1.y + p4.y) / 2;
      p2 = { x: p1.x, y: my };
      p3 = { x: p4.x, y: my };
    }
    const pts = [a, p1, p2, p3, p4, b];
    d = 'M' + pts.map((p) => `${p.x},${p.y}`).join(' L');
    mid = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
    startAngle = Math.atan2(p1.y - a.y, p1.x - a.x);
    endAngle = Math.atan2(b.y - p4.y, b.x - p4.x);
    if (p1 === a) startAngle = Math.atan2(p2.y - a.y, p2.x - a.x);
    if (p4 === b) endAngle = Math.atan2(b.y - p3.y, b.x - p3.x);
  } else {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const k = clamp(dist * 0.45, 30, 220);
    const c1 = na ? { x: a.x + na.x * k, y: a.y + na.y * k } : { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
    const c2 = nb ? { x: b.x + nb.x * k, y: b.y + nb.y * k } : { x: b.x - (b.x - a.x) / 3, y: b.y - (b.y - a.y) / 3 };
    d = `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
    // Bezier point at t = 0.5
    mid = {
      x: 0.125 * a.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * b.x,
      y: 0.125 * a.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * b.y,
    };
    startAngle = Math.atan2(c1.y - a.y, c1.x - a.x);
    endAngle = Math.atan2(b.y - c2.y, b.x - c2.x);
  }
  return { d, start: a, end: b, mid, startAngle, endAngle };
}

export const arrowLength = (w: number) => 8 + w * 2.5;

export interface FullEdgeGeometry extends EdgeGeometry {
  /** Attachment points on the nodes (arrow tips). */
  tipStart: Point;
  tipEnd: Point;
}

export function edgeGeometry(edge: CanvasEdge, from: CanvasNode, to: CanvasNode): FullEdgeGeometry {
  const [fs, ts] = resolveSides(from, to, edge);
  const a = sidePoint(from, fs);
  const b = sidePoint(to, ts);
  // Inset line ends under arrowheads so the line doesn't poke through the tip.
  const ia = edge.fromEnd === 'arrow' ? arrowLength(edge.width) * 0.8 : 0;
  const ib = edge.toEnd === 'arrow' ? arrowLength(edge.width) * 0.8 : 0;
  const na = sideNormal[fs];
  const nb = sideNormal[ts];
  const g = buildPath({ x: a.x + na.x * ia, y: a.y + na.y * ia }, fs, { x: b.x + nb.x * ib, y: b.y + nb.y * ib }, ts, edge.path);
  return { ...g, tipStart: a, tipEnd: b };
}

/** Distance from point to segment — used for edge hit testing in tests/marquee. */
export function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
