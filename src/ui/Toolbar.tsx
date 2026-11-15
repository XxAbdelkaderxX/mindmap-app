import { DEFAULT_NODE_H, DEFAULT_NODE_W, GRID } from '../model/defaults';
import { rectsIntersect } from '../model/geometry';
import { addNode, groupSelection, redo, setTool, undo, useStore } from '../store/store';
import { fitContent, viewCenterWorld, zoomTo } from '../canvas/viewport';
import { Icon } from './icons';

/** Centre of the view, nudged so new notes don't stack exactly on top of each other. */
function freeSpot() {
  const c = viewCenterWorld();
  const nodes = useStore.getState().board.nodes.filter((n) => n.type === 'text');
  for (let i = 0; i < 20; i++) {
    const p = { x: c.x + i * GRID * 2, y: c.y + i * GRID * 2 };
    const r = { x: p.x - DEFAULT_NODE_W / 2, y: p.y - DEFAULT_NODE_H / 2, width: DEFAULT_NODE_W, height: DEFAULT_NODE_H };
    if (!nodes.some((n) => rectsIntersect(r, n) && Math.abs(n.x - r.x) < GRID && Math.abs(n.y - r.y) < GRID)) return p;
  }
  return c;
}

export function Toolbar({ onOpenBoards }: { onOpenBoards: () => void }) {
  const canUndo = useStore((s) => s.past.length > 0 || s.transientBase !== null);
  const canRedo = useStore((s) => s.future.length > 0);
  const tool = useStore((s) => s.tool);
  const zoom = useStore((s) => s.viewport.zoom);
  const multi = useStore((s) => s.selectedNodes.size > 1);

  return (
    <nav className="toolbar" data-ui aria-label="Main toolbar">
      <button type="button" className="tb-btn" aria-label="Boards and menu" title="Boards & menu" onClick={onOpenBoards}>
        <Icon name="menu" />
      </button>
      <span className="tb-sep" />
      <button
        type="button"
        className="tb-btn tb-btn--primary"
        aria-label="Add note"
        title="Add note (N)"
        onClick={() => addNode(freeSpot(), {}, { edit: true })}
      >
        <Icon name="plus" />
      </button>
      <button
        type="button"
        className="tb-btn"
        aria-label={multi ? 'Group selection' : 'Add group'}
        title={multi ? 'Group selection (⌘G)' : 'Add group'}
        onClick={() =>
          multi
            ? groupSelection()
            : addNode(viewCenterWorld(), { type: 'group', label: 'Group', style: 'outline', width: 400, height: 300 })
        }
      >
        <Icon name="group" />
      </button>
      <button
        type="button"
        className={`tb-btn${tool === 'select' ? ' is-active' : ''}`}
        aria-label="Box select"
        aria-pressed={tool === 'select'}
        title="Box select (S) — or long-press the canvas"
        onClick={() => setTool(tool === 'select' ? 'pan' : 'select')}
      >
        <Icon name="select" />
      </button>
      <span className="tb-sep" />
      <button type="button" className="tb-btn" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
        <Icon name="undo" />
      </button>
      <button type="button" className="tb-btn" aria-label="Redo" title="Redo (⌘⇧Z)" disabled={!canRedo} onClick={redo}>
        <Icon name="redo" />
      </button>
      <span className="tb-sep" />
      <button type="button" className="tb-btn" aria-label="Zoom to fit" title="Zoom to fit (F)" onClick={() => fitContent()}>
        <Icon name="fit" />
      </button>
      <button
        type="button"
        className="tb-zoom"
        aria-label={`Zoom ${Math.round(zoom * 100)} percent, reset to 100`}
        title="Reset zoom to 100%"
        onClick={() => zoomTo(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
    </nav>
  );
}
