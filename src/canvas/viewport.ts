import type { Point, Rect, Viewport } from '../model/types';
import { boundsOf, fitViewport, screenToWorld, zoomAt, type Insets } from '../model/geometry';
import { setViewport, useStore } from '../store/store';

let el: HTMLElement | null = null;
let raf = 0;

export function registerCanvas(node: HTMLElement | null) {
  el = node;
}

export function canvasSize() {
  const r = el?.getBoundingClientRect();
  return { width: r?.width ?? window.innerWidth, height: r?.height ?? window.innerHeight, left: r?.left ?? 0, top: r?.top ?? 0 };
}

export function stopViewportAnimation() {
  cancelAnimationFrame(raf);
  raf = 0;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function animateViewport(target: Viewport, duration = 320) {
  stopViewportAnimation();
  const from = useStore.getState().viewport;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || duration <= 0) {
    setViewport(target);
    return;
  }
  const start = performance.now();
  // Interpolate zoom logarithmically for perceptually even zooming.
  const lz0 = Math.log(from.zoom);
  const lz1 = Math.log(target.zoom);
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const k = ease(t);
    const zoom = Math.exp(lz0 + (lz1 - lz0) * k);
    // Interpolate the world point at screen centre so motion feels anchored.
    const { width, height } = canvasSize();
    const c = { x: width / 2, y: height / 2 };
    const w0 = screenToWorld(c, from);
    const w1 = screenToWorld(c, target);
    const wx = w0.x + (w1.x - w0.x) * k;
    const wy = w0.y + (w1.y - w0.y) * k;
    setViewport({ zoom, x: c.x - wx * zoom, y: c.y - wy * zoom });
    if (t < 1) raf = requestAnimationFrame(step);
    else {
      setViewport(target);
      raf = 0;
    }
  };
  raf = requestAnimationFrame(step);
}

/** Padding around fitted content. */
function fitPadding() {
  const { width, height } = canvasSize();
  return Math.max(20, Math.min(width, height) * 0.05);
}

/** Screen areas covered by the floating toolbar / title, so fitted content stays clear of them. */
export function uiInsets(): Insets {
  const { width, height, left, top } = canvasSize();
  const ins: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const tb = document.querySelector('.toolbar')?.getBoundingClientRect();
  if (tb && tb.width) {
    if (tb.height > tb.width) ins.left = tb.right - left;
    else ins.bottom = top + height - tb.top;
  }
  const title = document.querySelector('.topbar')?.getBoundingClientRect();
  if (title && title.height) ins.top = title.bottom - top;
  ins.left = Math.min(ins.left, width / 3);
  return ins;
}

export function fitContent(animate = true, rects?: Rect[]) {
  const s = useStore.getState();
  // Group labels sit above the group's box
  const b = boundsOf((rects ?? s.board.nodes).map((r) => ('type' in r && r.type === 'group' ? { ...r, y: r.y - 34, height: r.height + 34 } : r)));
  const { width, height } = canvasSize();
  const vp = fitViewport(b, width, height, fitPadding(), 1, uiInsets());
  if (animate) animateViewport(vp);
  else setViewport(vp);
}

export function zoomBy(factor: number, focus?: Point) {
  const s = useStore.getState();
  const { width, height } = canvasSize();
  animateViewport(zoomAt(s.viewport, s.viewport.zoom * factor, focus ?? { x: width / 2, y: height / 2 }), 220);
}

export function zoomTo(zoom: number) {
  const s = useStore.getState();
  const { width, height } = canvasSize();
  animateViewport(zoomAt(s.viewport, zoom, { x: width / 2, y: height / 2 }), 260);
}

/** World coordinate at the centre of the visible canvas. */
export function viewCenterWorld(): Point {
  const { width, height } = canvasSize();
  return screenToWorld({ x: width / 2, y: height / 2 }, useStore.getState().viewport);
}

/** Pan (animated) so `r` is fully visible, if it is not already. */
export function ensureVisible(r: Rect, margin = 80) {
  const vp = useStore.getState().viewport;
  const { width, height } = canvasSize();
  const sx1 = r.x * vp.zoom + vp.x;
  const sy1 = r.y * vp.zoom + vp.y;
  const sx2 = (r.x + r.width) * vp.zoom + vp.x;
  const sy2 = (r.y + r.height) * vp.zoom + vp.y;
  let dx = 0;
  let dy = 0;
  if (sx1 < margin) dx = margin - sx1;
  else if (sx2 > width - margin) dx = Math.max(margin - sx1, width - margin - sx2);
  if (sy1 < margin) dy = margin - sy1;
  else if (sy2 > height - margin) dy = Math.max(margin - sy1, height - margin - sy2);
  if (dx || dy) animateViewport({ ...vp, x: vp.x + dx, y: vp.y + dy }, 260);
}
