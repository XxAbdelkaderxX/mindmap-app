import { useLayoutEffect, useRef, useState } from 'react';
import type { CanvasEdge, EndType, LineStyle, NodeShape, NodeStyle, PathType } from '../model/types';
import { COLOR_CHOICES, PRESET_COLORS, resolveColor } from '../model/defaults';
import { boundsOf, edgeGeometry } from '../model/geometry';
import {
  deleteSelection,
  duplicateSelection,
  groupSelection,
  reverseSelectedEdges,
  setEditing,
  setEditingEdge,
  ungroupSelection,
  updateSelectedEdges,
  updateSelectedNodes,
  useStore,
} from '../store/store';
import { Icon, type IconName } from './icons';

type Panel = 'main' | 'color' | 'shape' | 'line';

function Btn({
  icon,
  label,
  onClick,
  active,
  danger,
  children,
}: {
  icon?: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} /> : children}
    </button>
  );
}

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  const [custom, setCustom] = useState(value && !PRESET_COLORS[value] ? value : '#a882ff');
  return (
    <>
      {COLOR_CHOICES.map((c) => (
        <button
          key={c.id || 'none'}
          type="button"
          className={`swatch${value === c.id ? ' is-active' : ''}`}
          aria-label={c.name}
          title={c.name}
          style={{ '--c': c.id ? resolveColor(c.id) : 'transparent' } as React.CSSProperties}
          onClick={() => onPick(c.id)}
        />
      ))}
      <label
        className={`swatch swatch--custom${value && !PRESET_COLORS[value] ? ' is-active' : ''}`}
        title="Custom color"
        style={{ '--c': custom } as React.CSSProperties}
      >
        <input
          type="color"
          aria-label="Custom color"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            onPick(e.target.value);
          }}
        />
      </label>
    </>
  );
}

const SHAPES: { id: NodeShape; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'pill', label: 'Pill' },
  { id: 'ellipse', label: 'Ellipse' },
];
const STYLES: { id: NodeStyle; label: string }[] = [
  { id: 'filled', label: 'Filled' },
  { id: 'outline', label: 'Outline' },
  { id: 'plain', label: 'Plain' },
];
const LINES: { id: LineStyle; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];
const PATHS: { id: PathType; icon: IconName; label: string }[] = [
  { id: 'curve', icon: 'curve', label: 'Curved' },
  { id: 'straight', icon: 'line', label: 'Straight' },
  { id: 'elbow', icon: 'elbow', label: 'Elbow' },
];
const WIDTHS = [1, 2, 4, 6];
const ARROWS: { from: EndType; to: EndType; label: string; glyph: string }[] = [
  { from: 'none', to: 'arrow', label: 'Arrow at end', glyph: '→' },
  { from: 'arrow', to: 'arrow', label: 'Arrows at both ends', glyph: '↔' },
  { from: 'none', to: 'none', label: 'No arrows', glyph: '—' },
  { from: 'arrow', to: 'none', label: 'Arrow at start', glyph: '←' },
];

export function SelectionToolbar() {
  const nodes = useStore((s) => s.board.nodes);
  const edges = useStore((s) => s.board.edges);
  const selN = useStore((s) => s.selectedNodes);
  const selE = useStore((s) => s.selectedEdges);
  const vp = useStore((s) => s.viewport);
  const editingId = useStore((s) => s.editingId);
  const editingEdgeId = useStore((s) => s.editingEdgeId);
  const ref = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>('main');
  const selKey = [...selN, ...selE].join(',');
  const [lastKey, setLastKey] = useState(selKey);
  if (lastKey !== selKey) {
    setLastKey(selKey);
    setPanel('main');
  }

  const selNodes = nodes.filter((n) => selN.has(n.id));
  const selEdges = edges.filter((e) => selE.has(e.id));
  const mode: 'nodes' | 'edges' | null = selNodes.length ? 'nodes' : selEdges.length ? 'edges' : null;

  // Anchor rect in world coordinates
  let anchor = boundsOf(selNodes);
  if (!anchor && selEdges.length) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const mids = selEdges
      .map((e) => {
        const a = byId.get(e.fromNode);
        const b = byId.get(e.toNode);
        if (!a || !b) return null;
        const m = edgeGeometry(e, a, b).mid;
        return { x: m.x, y: m.y, width: 0, height: 0 };
      })
      .filter(Boolean) as { x: number; y: number; width: number; height: number }[];
    anchor = boundsOf(mids);
  }

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent || !anchor) return;
    const W = parent.clientWidth;
    const H = parent.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const top = anchor.y * vp.zoom + vp.y;
    const bottom = (anchor.y + anchor.height) * vp.zoom + vp.y;
    const cx = (anchor.x + anchor.width / 2) * vp.zoom + vp.x;
    const gap = mode === 'edges' ? 22 : 18;
    const safeTop = 12 + (parseFloat(getComputedStyle(el).getPropertyValue('--safe-top')) || 0);
    let y = top - h - gap;
    if (y < safeTop) y = bottom + gap;
    if (y + h > H - 12) y = Math.max(safeTop, Math.min(H - h - 12, top - h - gap));
    const x = Math.min(Math.max(8, cx - w / 2), Math.max(8, W - w - 8));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.style.opacity = '1';
  });

  if (!mode || !anchor || editingEdgeId) return null;
  if (editingId && mode === 'nodes') {
    // While typing, keep only a compact "Done" pill
    return (
      <div ref={ref} className="sel-toolbar" data-ui onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="tb-pill" onClick={() => setEditing(null)}>
          <Icon name="check" size={18} /> Done
        </button>
      </div>
    );
  }

  let content: React.ReactNode;
  if (mode === 'nodes') {
    const first = selNodes[0];
    const allGroups = selNodes.every((n) => n.type === 'group');
    const singleText = selNodes.length === 1 && first.type === 'text';
    const singleGroup = selNodes.length === 1 && first.type === 'group';
    if (panel === 'color') {
      content = (
        <>
          <Btn icon="back" label="Back" onClick={() => setPanel('main')} />
          <Swatches value={first.color} onPick={(c) => updateSelectedNodes({ color: c })} />
        </>
      );
    } else if (panel === 'shape') {
      content = (
        <>
          <Btn icon="back" label="Back" onClick={() => setPanel('main')} />
          {!allGroups &&
            SHAPES.map((s) => (
              <Btn key={s.id} label={s.label} active={first.shape === s.id} onClick={() => updateSelectedNodes({ shape: s.id })}>
                <span className={`shape-glyph shape-glyph--${s.id}`} />
              </Btn>
            ))}
          <span className="tb-sep" />
          {STYLES.map((s) => (
            <Btn key={s.id} label={s.label} active={first.style === s.id} onClick={() => updateSelectedNodes({ style: s.id })}>
              <span className={`style-glyph style-glyph--${s.id}`} />
            </Btn>
          ))}
        </>
      );
    } else {
      content = (
        <>
          <Btn label="Color" onClick={() => setPanel('color')}>
            <span className="swatch swatch--inline" style={{ '--c': first.color ? resolveColor(first.color) : 'transparent' } as React.CSSProperties} />
          </Btn>
          <Btn icon="shape" label="Shape & style" onClick={() => setPanel('shape')} />
          {(singleText || singleGroup) && <Btn icon="edit" label={singleGroup ? 'Rename group' : 'Edit text'} onClick={() => setEditing(first.id)} />}
          {selNodes.some((n) => n.type === 'group') ? (
            <Btn icon="ungroup" label="Ungroup" onClick={ungroupSelection} />
          ) : (
            <Btn icon="group" label="Group" onClick={() => groupSelection()} />
          )}
          <Btn icon="copy" label="Duplicate" onClick={() => duplicateSelection()} />
          <Btn icon="trash" label="Delete" danger onClick={deleteSelection} />
        </>
      );
    }
  } else {
    const first = selEdges[0] as CanvasEdge;
    const arrowIdx = ARROWS.findIndex((a) => a.from === first.fromEnd && a.to === first.toEnd);
    const arrow = ARROWS[Math.max(0, arrowIdx)];
    if (panel === 'color') {
      content = (
        <>
          <Btn icon="back" label="Back" onClick={() => setPanel('main')} />
          <Swatches value={first.color} onPick={(c) => updateSelectedEdges({ color: c })} />
        </>
      );
    } else if (panel === 'line') {
      content = (
        <>
          <Btn icon="back" label="Back" onClick={() => setPanel('main')} />
          {LINES.map((l) => (
            <Btn key={l.id} label={l.label} active={first.lineStyle === l.id} onClick={() => updateSelectedEdges({ lineStyle: l.id })}>
              <span className={`line-glyph line-glyph--${l.id}`} />
            </Btn>
          ))}
          <span className="tb-sep" />
          {PATHS.map((p) => (
            <Btn key={p.id} icon={p.icon} label={p.label} active={first.path === p.id} onClick={() => updateSelectedEdges({ path: p.id })} />
          ))}
          <span className="tb-sep" />
          {WIDTHS.map((w) => (
            <Btn key={w} label={`Width ${w}`} active={first.width === w} onClick={() => updateSelectedEdges({ width: w })}>
              <span className="width-glyph" style={{ height: w }} />
            </Btn>
          ))}
        </>
      );
    } else {
      content = (
        <>
          <Btn label="Color" onClick={() => setPanel('color')}>
            <span className="swatch swatch--inline" style={{ '--c': first.color ? resolveColor(first.color) : 'transparent' } as React.CSSProperties} />
          </Btn>
          <Btn icon="curve" label="Line style" onClick={() => setPanel('line')} />
          <Btn
            label={`Arrows: ${arrow.label}`}
            onClick={() => {
              const next = ARROWS[(Math.max(0, arrowIdx) + 1) % ARROWS.length];
              updateSelectedEdges({ fromEnd: next.from, toEnd: next.to });
            }}
          >
            <span className="glyph">{arrow.glyph}</span>
          </Btn>
          {selEdges.length === 1 && <Btn icon="label" label="Edit label" onClick={() => setEditingEdge(first.id)} />}
          <Btn icon="swap" label="Reverse direction" onClick={reverseSelectedEdges} />
          <Btn icon="trash" label="Delete" danger onClick={deleteSelection} />
        </>
      );
    }
  }

  return (
    <div
      ref={ref}
      className="sel-toolbar"
      data-ui
      role="toolbar"
      aria-label={mode === 'nodes' ? 'Node actions' : 'Connection actions'}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {content}
    </div>
  );
}

