import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasNode, Point, Rect, Side } from '../model/types';
import { DEFAULT_NODE_H, DEFAULT_NODE_W, GRID, MIN_NODE_H, MIN_NODE_W, NEUTRAL, resolveColor } from '../model/defaults';
import {
  buildPath,
  facingSide,
  normRect,
  rectsIntersect,
  screenToWorld,
  sideNormal,
  sidePoint,
  snap,
  zoomAt,
} from '../model/geometry';
import {
  addConnectedNode,
  addEdge,
  addNode,
  beginTransient,
  bringToFront,
  clearSelection,
  dragSet,
  endTransient,
  moveNodesTransient,
  resizeNodeTransient,
  selectEdge,
  selectNodes,
  setEditing,
  setEditingEdge,
  setViewport,
  toggleNodeSelection,
  useStore,
} from '../store/store';
import { NodeView } from './NodeView';
import { EdgeLabels, EdgeLayer } from './EdgeLayer';
import { fitContent, registerCanvas, stopViewportAnimation } from './viewport';
import { SelectionToolbar } from '../ui/SelectionToolbar';
import { ContextMenu, type ContextMenuState } from '../ui/ContextMenu';

const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 320;
const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

type Gesture =
  | { kind: 'none' }
  | { kind: 'pending-bg'; start: Point }
  | { kind: 'pan'; last: Point; samples: { t: number; x: number; y: number }[] }
  | { kind: 'pinch'; d0: number; mid0: Point; vp0: { x: number; y: number; zoom: number } }
  | { kind: 'pending-node'; id: string; start: Point; groupBody: boolean; wasSelected: boolean }
  | { kind: 'drag'; origin: Map<string, Point>; startWorld: Point; primary: string }
  | { kind: 'resize'; id: string; startRect: Rect; startWorld: Point; type: CanvasNode['type'] }
  | { kind: 'connect'; from: string; side: Side; start: Point; moved: boolean }
  | { kind: 'marquee'; startWorld: Point; additive: boolean; base: Set<string>; fromLongPress: boolean; moved: boolean }
  | { kind: 'pending-edge'; id: string; start: Point };

interface Preview {
  connect?: { from: Point; side: Side; to: Point; toSide: Side | null; target: string | null };
  marquee?: Rect; // screen coords
}

const vibrate = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
};

export function Canvas() {
  const rootRef = useRef<HTMLDivElement>(null);
  const board = useStore((s) => s.board);
  const viewport = useStore((s) => s.viewport);
  const selectedNodes = useStore((s) => s.selectedNodes);
  const selectedEdges = useStore((s) => s.selectedEdges);
  const editingId = useStore((s) => s.editingId);
  const editingEdgeId = useStore((s) => s.editingEdgeId);
  const tool = useStore((s) => s.tool);
  const [preview, setPreview] = useState<Preview>({});
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [interacting, setInteracting] = useState(false);

  const g = useRef<Gesture>({ kind: 'none' });
  const pointers = useRef(new Map<number, Point>());
  const longTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTap = useRef<{ t: number; p: Point; key: string } | null>(null);
  const inertia = useRef(0);
  const autoPan = useRef<{ raf: number; p: Point | null }>({ raf: 0, p: null });
  const rectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const lastPointerType = useRef('mouse');
  const suppressClick = useRef<{ t: number; x: number; y: number } | null>(null);

  // Register root element + fit on first open (zoom 0 is the "fit me" sentinel)
  useLayoutEffect(() => {
    registerCanvas(rootRef.current);
    return () => registerCanvas(null);
  }, []);
  useLayoutEffect(() => {
    if (viewport.zoom === 0) fitContent(false);
  }, [viewport.zoom, board.id]);

  const local = useCallback((e: { clientX: number; clientY: number }): Point => {
    const r = rectRef.current;
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const toWorld = (p: Point) => screenToWorld(p, useStore.getState().viewport);

  const cancelLong = () => clearTimeout(longTimer.current);

  const stopInertia = () => {
    cancelAnimationFrame(inertia.current);
    inertia.current = 0;
  };

  // ---------------------------------------------------------------------------
  // Gesture transitions
  // ---------------------------------------------------------------------------

  const startPinch = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return;
    cancelLong();
    if (g.current.kind === 'drag' || g.current.kind === 'resize') endTransient();
    setPreview({});
    const [a, b] = pts;
    g.current = {
      kind: 'pinch',
      d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
      mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      vp0: useStore.getState().viewport,
    };
    setInteracting(true);
  };

  const startDrag = (id: string, p: Point) => {
    if (!useStore.getState().selectedNodes.has(id)) selectNodes([id]);
    const s = useStore.getState();
    const ids = s.selectedNodes.has(id) ? s.selectedNodes : new Set([id]);
    const moving = dragSet(ids);
    const origin = new Map<string, Point>();
    for (const n of s.board.nodes) if (moving.has(n.id)) origin.set(n.id, { x: n.x, y: n.y });
    bringToFront(ids);
    beginTransient();
    g.current = { kind: 'drag', origin, startWorld: toWorld(p), primary: id };
    setInteracting(true);
  };

  const startMarquee = (p: Point, additive: boolean, fromLongPress = false) => {
    const s = useStore.getState();
    g.current = {
      kind: 'marquee',
      startWorld: toWorld(p),
      additive,
      base: new Set(additive ? s.selectedNodes : []),
      fromLongPress,
      moved: false,
    };
    setPreview({ marquee: { x: p.x, y: p.y, width: 0, height: 0 } });
    setInteracting(true);
  };

  /** Topmost node under the client point, excluding `exclude`. */
  const nodeAt = (clientX: number, clientY: number, exclude?: string): string | null => {
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const id = (el as HTMLElement).closest?.('[data-node-id]')?.getAttribute('data-node-id');
      if (id && id !== exclude) return id;
    }
    return null;
  };

  const applyMove = (p: Point, client: Point) => {
    const st = g.current;
    const s = useStore.getState();
    switch (st.kind) {
      case 'pan': {
        const vp = s.viewport;
        setViewport({ ...vp, x: vp.x + p.x - st.last.x, y: vp.y + p.y - st.last.y });
        st.last = p;
        const now = performance.now();
        st.samples.push({ t: now, x: p.x, y: p.y });
        while (st.samples.length > 2 && now - st.samples[0].t > 100) st.samples.shift();
        break;
      }
      case 'drag': {
        const w = toWorld(p);
        let dx = w.x - st.startWorld.x;
        let dy = w.y - st.startWorld.y;
        const o = st.origin.get(st.primary)!;
        if (s.snapToGrid) {
          dx = snap(o.x + dx) - o.x;
          dy = snap(o.y + dy) - o.y;
        }
        moveNodesTransient(st.origin, dx, dy);
        break;
      }
      case 'resize': {
        const w = toWorld(p);
        const r = st.startRect;
        const minW = st.type === 'group' ? MIN_NODE_W * 1.5 : MIN_NODE_W;
        let width = Math.max(minW, r.width + w.x - st.startWorld.x);
        let height = Math.max(MIN_NODE_H, r.height + w.y - st.startWorld.y);
        if (s.snapToGrid) {
          width = Math.max(minW, snap(r.x + width) - r.x);
          height = Math.max(MIN_NODE_H, snap(r.y + height) - r.y);
        }
        resizeNodeTransient(st.id, { x: r.x, y: r.y, width, height });
        break;
      }
      case 'connect': {
        const from = s.board.nodes.find((n) => n.id === st.from);
        if (!from) break;
        const w = toWorld(p);
        const target = nodeAt(client.x, client.y, st.from);
        const tn = target ? s.board.nodes.find((n) => n.id === target) : undefined;
        const toSide = tn ? facingSide(tn, w) : null;
        setPreview({
          connect: {
            from: sidePoint(from, st.side),
            side: st.side,
            to: tn && toSide ? sidePoint(tn, toSide) : w,
            toSide,
            target: tn?.id ?? null,
          },
        });
        break;
      }
      case 'marquee': {
        st.moved = true;
        const w = toWorld(p);
        const r = normRect(st.startWorld, w);
        const hits = s.board.nodes.filter((n) => rectsIntersect(r, n)).map((n) => n.id);
        selectNodes([...st.base, ...hits]);
        const vp = s.viewport;
        const a = { x: st.startWorld.x * vp.zoom + vp.x, y: st.startWorld.y * vp.zoom + vp.y };
        setPreview({ marquee: normRect(a, p) });
        break;
      }
    }
  };

  // Auto-pan when dragging close to the screen edges
  const autoPanTick = () => {
    const ap = autoPan.current;
    const st = g.current;
    if (!ap.p || !['drag', 'connect', 'marquee', 'resize'].includes(st.kind)) {
      ap.raf = 0;
      return;
    }
    const { width, height } = rectRef.current;
    const edge = 36;
    const speed = (d: number) => (d < edge ? ((edge - d) / edge) * 14 : 0);
    const vx = speed(ap.p.x) - speed(width - ap.p.x);
    const vy = speed(ap.p.y) - speed(height - ap.p.y);
    if (vx || vy) {
      const vp = useStore.getState().viewport;
      setViewport({ ...vp, x: vp.x + vx, y: vp.y + vy });
      const r = rectRef.current;
      applyMove(ap.p, { x: ap.p.x + r.left, y: ap.p.y + r.top });
    }
    ap.raf = requestAnimationFrame(autoPanTick);
  };

  const finishTap = (key: string, p: Point, onSingle: () => void, onDouble: () => void) => {
    const now = performance.now();
    const lt = lastTap.current;
    if (lt && lt.key === key && now - lt.t < DOUBLE_TAP_MS && Math.hypot(lt.p.x - p.x, lt.p.y - p.y) < 30) {
      lastTap.current = null;
      onDouble();
    } else {
      lastTap.current = { t: now, p, key };
      onSingle();
    }
  };

  /** Place for a node spawned by tapping a connection handle. */
  const spawnPosition = (from: CanvasNode, side: Side): Point => {
    const n = sideNormal[side];
    const gap = GRID * 4;
    const nodes = useStore.getState().board.nodes;
    const base = sidePoint(from, side);
    const c = { x: base.x + n.x * (gap + DEFAULT_NODE_W / 2), y: base.y + n.y * (gap + DEFAULT_NODE_H / 2) };
    const step = { x: n.y !== 0 ? DEFAULT_NODE_W + GRID : 0, y: n.x !== 0 ? DEFAULT_NODE_H + GRID : 0 };
    for (let i = 0; i < 12; i++) {
      const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const cand = { x: c.x + step.x * k, y: c.y + step.y * k };
      const r = { x: cand.x - DEFAULT_NODE_W / 2, y: cand.y - DEFAULT_NODE_H / 2, width: DEFAULT_NODE_W, height: DEFAULT_NODE_H };
      if (!nodes.some((o) => o.type === 'text' && rectsIntersect(r, o))) return cand;
    }
    return c;
  };

  // ---------------------------------------------------------------------------
  // Pointer handlers
  // ---------------------------------------------------------------------------

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // Let form controls, links and task checkboxes behave natively
    if (target.closest('textarea, input, a, button, [data-ui]')) return;
    lastPointerType.current = e.pointerType;
    if (e.button === 2) return; // context menu handled separately
    stopInertia();
    stopViewportAnimation();
    setMenu(null);
    rectRef.current = rootRef.current!.getBoundingClientRect();
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    rootRef.current!.setPointerCapture?.(e.pointerId);

    if (pointers.current.size >= 2) {
      startPinch();
      return;
    }

    const s = useStore.getState();
    // Commit any open editor when interacting with the canvas
    if (s.editingId || s.editingEdgeId) {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }

    const touchLike = e.pointerType !== 'mouse';
    const handle = target.closest('[data-handle]');
    const resize = target.closest('[data-resize]');
    const nodeEl = target.closest('[data-node-id]');
    const edgeEl = target.closest('[data-edge-id]');

    if (e.button === 1 || (e.pointerType === 'mouse' && e.altKey)) {
      g.current = { kind: 'pan', last: p, samples: [] };
      setInteracting(true);
      return;
    }

    if (handle && nodeEl) {
      const id = nodeEl.getAttribute('data-node-id')!;
      g.current = { kind: 'connect', from: id, side: handle.getAttribute('data-handle') as Side, start: p, moved: false };
      setInteracting(true);
      return;
    }
    if (resize && nodeEl) {
      const id = nodeEl.getAttribute('data-node-id')!;
      const n = s.board.nodes.find((x) => x.id === id)!;
      beginTransient();
      g.current = { kind: 'resize', id, startRect: { x: n.x, y: n.y, width: n.width, height: n.height }, startWorld: toWorld(p), type: n.type };
      setInteracting(true);
      return;
    }
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-node-id')!;
      if (s.editingId === id) return;
      const n = s.board.nodes.find((x) => x.id === id);
      const groupBody = n?.type === 'group' && !target.closest('[data-group-label]');
      const wasSelected = s.selectedNodes.has(id);
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        toggleNodeSelection(id);
      } else if (!wasSelected && !groupBody && !touchLike) {
        // Touch defers selection to tap/drag so a long-press can extend the selection
        selectNodes([id]);
      }
      g.current = { kind: 'pending-node', id, start: p, groupBody: groupBody && !wasSelected, wasSelected };
      if (touchLike) {
        longTimer.current = setTimeout(() => {
          if (g.current.kind !== 'pending-node') return;
          // Long-press a node: toggle it in a multi-selection
          vibrate();
          const st = useStore.getState();
          if (wasSelected && st.selectedNodes.size > 1) toggleNodeSelection(id);
          else selectNodes([id], true);
          g.current = { kind: 'none' };
          lastTap.current = null;
        }, LONG_PRESS_MS);
      }
      return;
    }
    if (edgeEl) {
      g.current = { kind: 'pending-edge', id: edgeEl.getAttribute('data-edge-id')!, start: p };
      return;
    }
    // Background
    if (tool === 'select' || e.shiftKey) {
      startMarquee(p, e.shiftKey);
      return;
    }
    g.current = { kind: 'pending-bg', start: p };
    longTimer.current = setTimeout(() => {
      if (g.current.kind !== 'pending-bg') return;
      vibrate();
      lastTap.current = null;
      startMarquee(g.current.start, false, true);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const st = g.current;
    const slop = e.pointerType === 'mouse' ? 4 : 8;

    if (st.kind === 'pinch') {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = zoomAt(st.vp0, st.vp0.zoom * (d / st.d0), st.mid0);
      setViewport({ zoom: z.zoom, x: z.x + mid.x - st.mid0.x, y: z.y + mid.y - st.mid0.y });
      return;
    }
    if (st.kind === 'pending-bg' || st.kind === 'pending-node' || st.kind === 'pending-edge') {
      if (Math.hypot(p.x - st.start.x, p.y - st.start.y) < slop) return;
      cancelLong();
      if (st.kind === 'pending-node' && !st.groupBody) {
        startDrag(st.id, st.start);
      } else {
        g.current = { kind: 'pan', last: st.start, samples: [] };
        setInteracting(true);
      }
    }
    const cur = g.current;
    if (cur.kind === 'marquee' && !cur.moved) {
      const sp = cur.startWorld;
      const vp = useStore.getState().viewport;
      if (Math.hypot(p.x - (sp.x * vp.zoom + vp.x), p.y - (sp.y * vp.zoom + vp.y)) < slop) return;
    }
    if (cur.kind === 'connect' && !cur.moved) {
      if (Math.hypot(p.x - cur.start.x, p.y - cur.start.y) < slop) return;
      cur.moved = true;
    }
    applyMove(p, { x: e.clientX, y: e.clientY });
    if (['drag', 'connect', 'marquee', 'resize'].includes(g.current.kind)) {
      autoPan.current.p = p;
      if (!autoPan.current.raf) autoPan.current.raf = requestAnimationFrame(autoPanTick);
    }
  };

  const endGesture = (e: React.PointerEvent, cancelled = false) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    cancelLong();
    autoPan.current.p = null;
    const st = g.current;
    const p = local(e);

    if (st.kind === 'pinch') {
      // Continue panning with the remaining finger to avoid a jump
      const rest = [...pointers.current.values()][0];
      g.current = rest ? { kind: 'pan', last: rest, samples: [] } : { kind: 'none' };
      if (!rest) setInteracting(false);
      return;
    }
    if (pointers.current.size > 0) return;
    g.current = { kind: 'none' };
    setInteracting(false);
    if (e.pointerType === 'touch') suppressClick.current = { t: performance.now(), x: e.clientX, y: e.clientY };
    if (cancelled) {
      if (st.kind === 'drag' || st.kind === 'resize') endTransient();
      setPreview({});
      return;
    }
    const s = useStore.getState();

    switch (st.kind) {
      case 'pending-bg':
        finishTap(
          'bg',
          p,
          () => clearSelection(),
          () => addNode(toWorld(p), {}, { edit: true }),
        );
        break;
      case 'pending-node': {
        const n = s.board.nodes.find((x) => x.id === st.id);
        finishTap(
          `n:${st.id}`,
          p,
          () => {
            if (e.shiftKey || e.metaKey || e.ctrlKey) return;
            if (!s.selectedNodes.has(st.id) || s.selectedNodes.size > 1) selectNodes([st.id]);
          },
          () => {
            if (!n) return;
            selectNodes([st.id]);
            setEditing(st.id);
          },
        );
        break;
      }
      case 'pending-edge':
        finishTap(
          `e:${st.id}`,
          p,
          () => selectEdge(st.id, e.shiftKey),
          () => {
            selectEdge(st.id);
            setEditingEdge(st.id);
          },
        );
        break;
      case 'pan': {
        const smp = st.samples;
        if (smp.length >= 2) {
          const a = smp[0];
          const b = smp[smp.length - 1];
          const dt = Math.max(1, b.t - a.t);
          let vx = (b.x - a.x) / dt;
          let vy = (b.y - a.y) / dt;
          if (performance.now() - b.t < 60 && Math.hypot(vx, vy) > 0.25) {
            let last = performance.now();
            const step = (now: number) => {
              const dtf = now - last;
              last = now;
              const decay = Math.pow(0.994, dtf);
              vx *= decay;
              vy *= decay;
              const vp = useStore.getState().viewport;
              setViewport({ ...vp, x: vp.x + vx * dtf, y: vp.y + vy * dtf });
              if (Math.hypot(vx, vy) > 0.02) inertia.current = requestAnimationFrame(step);
              else inertia.current = 0;
            };
            inertia.current = requestAnimationFrame(step);
          }
        }
        break;
      }
      case 'drag':
      case 'resize':
        endTransient();
        break;
      case 'connect': {
        setPreview({});
        const from = s.board.nodes.find((n) => n.id === st.from);
        if (!from) break;
        if (!st.moved) {
          // Tap on a handle: spawn a connected node in that direction
          const at = spawnPosition(from, st.side);
          addConnectedNode(from.id, st.side, at, OPPOSITE[st.side]);
          break;
        }
        const target = nodeAt(e.clientX, e.clientY, st.from);
        const w = toWorld(p);
        if (target) {
          const tn = s.board.nodes.find((n) => n.id === target)!;
          const id = addEdge({ fromNode: st.from, fromSide: st.side, toNode: target, toSide: facingSide(tn, w) });
          if (id) selectEdge(id);
        } else {
          // Drop on empty canvas: create a connected node there
          const toSide = OPPOSITE[st.side];
          const n = sideNormal[toSide];
          const at = { x: w.x - n.x * (DEFAULT_NODE_W / 2), y: w.y - n.y * (DEFAULT_NODE_H / 2) };
          addConnectedNode(st.from, st.side, at, toSide);
        }
        break;
      }
      case 'marquee':
        setPreview({});
        // Long-press without dragging opens the quick-add menu
        if (st.fromLongPress && !st.moved) setMenu({ x: p.x, y: p.y, world: toWorld(p) });
        break;
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    if (target.closest('textarea, input')) return;
    // Touch long-press is handled by our own gesture timers
    if (lastPointerType.current !== 'mouse') return;
    rectRef.current = rootRef.current!.getBoundingClientRect();
    const p = local(e);
    const nodeEl = target.closest('[data-node-id]');
    const edgeEl = target.closest('[data-edge-id]');
    const s = useStore.getState();
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-node-id')!;
      if (!s.selectedNodes.has(id)) selectNodes([id]);
      return; // selection toolbar covers node actions
    }
    if (edgeEl) {
      selectEdge(edgeEl.getAttribute('data-edge-id')!);
      return;
    }
    setMenu({ x: p.x, y: p.y, world: toWorld(p) });
  };

  // Wheel: pan, or zoom with ctrl/⌘ (also trackpad pinch)
  useEffect(() => {
    const el = rootRef.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-ui], textarea')) return;
      e.preventDefault();
      stopInertia();
      stopViewportAnimation();
      const r = el.getBoundingClientRect();
      const vp = useStore.getState().viewport;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * unit * 0.0075);
        setViewport(zoomAt(vp, vp.zoom * factor, { x: e.clientX - r.left, y: e.clientY - r.top }));
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setViewport({ ...vp, x: vp.x - dx * unit, y: vp.y - dy * unit });
      }
    };
    const prevent = (e: Event) => e.preventDefault();
    // Suppress the browser's synthetic click after canvas touch gestures: UI that
    // appears under the lifting finger (toolbars, menus) must not receive it.
    const onCompatMouse = (e: MouseEvent) => {
      const sc = suppressClick.current;
      if (!sc || performance.now() - sc.t > 600) return;
      if (Math.hypot(e.clientX - sc.x, e.clientY - sc.y) > 40) return;
      if (e.type === 'click') suppressClick.current = null;
      e.preventDefault(); // also stops mousedown from moving focus
      e.stopPropagation();
    };
    const compat = ['mousedown', 'mouseup', 'click'] as const;
    compat.forEach((t) => window.addEventListener(t, onCompatMouse, true));
    el.addEventListener('wheel', onWheel, { passive: false });
    // Block Safari's native pinch-zoom of the page
    el.addEventListener('gesturestart', prevent);
    el.addEventListener('gesturechange', prevent);
    return () => {
      el.removeEventListener('wheel', onWheel);
      compat.forEach((t) => window.removeEventListener(t, onCompatMouse, true));
      el.removeEventListener('gesturestart', prevent);
      el.removeEventListener('gesturechange', prevent);
    };
  }, []);

  useEffect(() => () => cancelLong(), []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const { nodes, edges } = board;
  const groups = nodes.filter((n) => n.type === 'group');
  const texts = nodes.filter((n) => n.type !== 'group');
  const single = selectedNodes.size === 1 && !editingId ? [...selectedNodes][0] : null;
  const dropTarget = preview.connect?.target ?? null;
  const gridSize = GRID * viewport.zoom;
  const showGrid = gridSize >= 8;
  const conn = preview.connect;

  return (
    <div
      ref={rootRef}
      className={`canvas${interacting ? ' is-interacting' : ''}${tool === 'select' ? ' tool-select' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endGesture(e)}
      onPointerCancel={(e) => endGesture(e, true)}
      onContextMenu={onContextMenu}
      onMouseDown={(e) => {
        // Keep focus where we put it (e.g. a freshly opened note editor)
        if (!(e.target as HTMLElement).closest('textarea, input, a, button, label, [data-ui]')) e.preventDefault();
      }}
      data-testid="canvas"
    >
      <div
        className="canvas__grid"
        style={{
          backgroundSize: showGrid ? `${gridSize}px ${gridSize}px` : `${gridSize * 5}px ${gridSize * 5}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      />
      <div
        className="world"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom || 1})`,
          ['--zoom' as string]: viewport.zoom || 1,
        }}
      >
        {groups.map((n) => (
          <NodeView
            key={n.id}
            node={n}
            selected={selectedNodes.has(n.id)}
            editing={editingId === n.id}
            showHandles={false}
            dropTarget={dropTarget === n.id}
          />
        ))}
        <EdgeLayer nodes={nodes} edges={edges} selected={selectedEdges} />
        {conn && (
          <svg className="edges edges--preview" aria-hidden>
            <path
              d={buildPath(conn.from, conn.side, conn.to, conn.toSide, 'curve').d}
              stroke={resolveColor(nodes.find((n) => n.id === single)?.color, NEUTRAL)}
              className="edge__preview"
            />
            <circle cx={conn.to.x} cy={conn.to.y} r={5} className="edge__preview-dot" />
          </svg>
        )}
        {texts.map((n) => (
          <NodeView
            key={n.id}
            node={n}
            selected={selectedNodes.has(n.id)}
            editing={editingId === n.id}
            showHandles={single === n.id}
            dropTarget={dropTarget === n.id}
          />
        ))}
        <EdgeLabels nodes={nodes} edges={edges} selected={selectedEdges} editingEdgeId={editingEdgeId} />
      </div>
      {preview.marquee && (
        <div
          className="marquee"
          style={{
            transform: `translate(${preview.marquee.x}px, ${preview.marquee.y}px)`,
            width: preview.marquee.width,
            height: preview.marquee.height,
          }}
        />
      )}
      {!interacting && <SelectionToolbar />}
      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
      {nodes.length === 0 && (
        <div className="empty-hint">
          <div className="empty-hint__title">Empty canvas</div>
          <div className="empty-hint__text">Double‑tap anywhere to add a note</div>
        </div>
      )}
    </div>
  );
}

