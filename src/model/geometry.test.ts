import { describe, expect, it } from 'vitest';
import { boundsOf, buildPath, facingSide, fitViewport, rectContains, screenToWorld, snap, worldToScreen, zoomAt } from './geometry';

describe('geometry', () => {
  it('converts between screen and world coordinates', () => {
    const vp = { x: 100, y: 50, zoom: 2 };
    const w = screenToWorld({ x: 300, y: 250 }, vp);
    expect(w).toEqual({ x: 100, y: 100 });
    expect(worldToScreen(w, vp)).toEqual({ x: 300, y: 250 });
  });

  it('zooms around a focal point keeping it fixed', () => {
    const vp = { x: 10, y: 20, zoom: 1 };
    const focus = { x: 200, y: 150 };
    const before = screenToWorld(focus, vp);
    const next = zoomAt(vp, 2.5, focus);
    const after = screenToWorld(focus, next);
    expect(next.zoom).toBe(2.5);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 100, { x: 0, y: 0 }).zoom).toBe(4);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0.0001, { x: 0, y: 0 }).zoom).toBe(0.1);
  });

  it('snaps to the grid', () => {
    expect(snap(29)).toBe(20);
    expect(snap(31)).toBe(40);
    expect(snap(-11)).toBe(-20);
  });

  it('computes bounds and containment', () => {
    const b = boundsOf([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: -5, width: 10, height: 10 },
    ])!;
    expect(b).toEqual({ x: 0, y: -5, width: 30, height: 15 });
    expect(rectContains(b, { x: 1, y: 1, width: 5, height: 5 })).toBe(true);
    expect(rectContains(b, { x: 25, y: 1, width: 10, height: 5 })).toBe(false);
    expect(boundsOf([])).toBeNull();
  });

  it('picks the side facing a point', () => {
    const r = { x: 0, y: 0, width: 100, height: 50 };
    expect(facingSide(r, { x: 300, y: 25 })).toBe('right');
    expect(facingSide(r, { x: -300, y: 25 })).toBe('left');
    expect(facingSide(r, { x: 50, y: -200 })).toBe('top');
    expect(facingSide(r, { x: 50, y: 200 })).toBe('bottom');
  });

  it('fits content inside insets', () => {
    const vp = fitViewport({ x: 0, y: 0, width: 100, height: 100 }, 400, 400, 0, 10, { top: 0, right: 0, bottom: 0, left: 200 });
    expect(vp.zoom).toBe(2); // 200px available width / 100
    // centre of content lands at centre of the free area (x = 300)
    expect(50 * vp.zoom + vp.x).toBe(300);
  });

  it('builds all path types', () => {
    for (const t of ['curve', 'straight', 'elbow'] as const) {
      const g = buildPath({ x: 0, y: 0 }, 'right', { x: 200, y: 100 }, 'left', t);
      expect(g.d.startsWith('M0,0')).toBe(true);
      expect(Number.isFinite(g.mid.x)).toBe(true);
    }
  });
});
