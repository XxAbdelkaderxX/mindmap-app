import { memo, useEffect, useState } from 'react';
import type { CanvasEdge, CanvasNode, LineStyle, Point } from '../model/types';
import { NEUTRAL, resolveColor } from '../model/defaults';
import { arrowLength, edgeGeometry, type FullEdgeGeometry } from '../model/geometry';
import { setEditingEdge, updateEdge } from '../store/store';

export function dashFor(style: LineStyle, w: number) {
  if (style === 'dashed') return `${w * 4} ${w * 3}`;
  if (style === 'dotted') return `0.01 ${w * 2.5}`;
  return undefined;
}

export function arrowHead(tip: Point, angle: number, w: number) {
  const len = arrowLength(w);
  const half = 4 + w * 1.4;
  const bx = tip.x - Math.cos(angle) * len;
  const by = tip.y - Math.sin(angle) * len;
  const px = -Math.sin(angle) * half;
  const py = Math.cos(angle) * half;
  return `M${tip.x},${tip.y} L${bx + px},${by + py} L${bx - px},${by - py} Z`;
}

interface Props {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selected: ReadonlySet<string>;
}

export function useEdgeGeometries(nodes: CanvasNode[], edges: CanvasEdge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: { edge: CanvasEdge; geo: FullEdgeGeometry }[] = [];
  for (const e of edges) {
    const a = byId.get(e.fromNode);
    const b = byId.get(e.toNode);
    if (a && b) out.push({ edge: e, geo: edgeGeometry(e, a, b) });
  }
  return out;
}

export const EdgeLayer = memo(function EdgeLayer({ nodes, edges, selected }: Props) {
  const items = useEdgeGeometries(nodes, edges);
  return (
    <svg className="edges" aria-hidden>
      {items.map(({ edge: e, geo }) => {
        const color = resolveColor(e.color, NEUTRAL);
        const sel = selected.has(e.id);
        return (
          <g key={e.id} data-edge-id={e.id} className={`edge${sel ? ' is-selected' : ''}`} style={{ '--c': color } as React.CSSProperties}>
            <path className="edge__hit" d={geo.d} />
            {sel && <path className="edge__glow" d={geo.d} strokeWidth={e.width + 6} />}
            <path
              className="edge__line"
              d={geo.d}
              stroke={color}
              strokeWidth={e.width}
              strokeDasharray={dashFor(e.lineStyle, e.width)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {e.toEnd === 'arrow' && <path className="edge__arrow" d={arrowHead(geo.tipEnd, geo.endAngle, e.width)} fill={color} />}
            {e.fromEnd === 'arrow' && (
              <path className="edge__arrow" d={arrowHead(geo.tipStart, geo.startAngle + Math.PI, e.width)} fill={color} />
            )}
          </g>
        );
      })}
    </svg>
  );
});

/** Edge labels are HTML so they render crisply and can be edited inline. */
export const EdgeLabels = memo(function EdgeLabels({
  nodes,
  edges,
  selected,
  editingEdgeId,
}: Props & { editingEdgeId: string | null }) {
  const items = useEdgeGeometries(nodes, edges);
  return (
    <>
      {items.map(({ edge: e, geo }) =>
        e.id === editingEdgeId ? (
          <EdgeLabelEditor key={e.id} edge={e} x={geo.mid.x} y={geo.mid.y} />
        ) : e.label ? (
          <div
            key={e.id}
            className={`edge-label${selected.has(e.id) ? ' is-selected' : ''}`}
            data-edge-id={e.id}
            style={{ transform: `translate(${geo.mid.x}px, ${geo.mid.y}px) translate(-50%, -50%)`, '--c': resolveColor(e.color) } as React.CSSProperties}
          >
            {e.label}
          </div>
        ) : null,
      )}
    </>
  );
});

function EdgeLabelEditor({ edge, x, y }: { edge: CanvasEdge; x: number; y: number }) {
  const [draft, setDraft] = useState(edge.label ?? '');
  useEffect(() => setDraft(edge.label ?? ''), [edge.id, edge.label]);
  const done = () => {
    updateEdge(edge.id, { label: draft.trim() || undefined });
    setEditingEdge(null);
  };
  return (
    <div className="edge-label is-editing" style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}>
      <input
        autoFocus
        value={draft}
        placeholder="Label"
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={done}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopPropagation();
            done();
          }
        }}
      />
    </div>
  );
}
