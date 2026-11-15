import { useEffect, useRef } from 'react';
import {
  addNode,
  clearSelection,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  redo,
  selectAll,
  setEditing,
  setEditingEdge,
  setTool,
  undo,
  ungroupSelection,
  updateSelectedNodes,
  useStore,
} from '../store/store';
import { fitContent, viewCenterWorld, zoomBy, zoomTo } from '../canvas/viewport';
import { copySelection, pasteAt } from './clipboard';
import { GRID } from '../model/defaults';

export function useShortcuts(opts: { blocked: boolean; onEscapeOverlay: () => void }) {
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (ref.current.blocked) {
        if (e.key === 'Escape') ref.current.onEscapeOverlay();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const s = useStore.getState();
      const handled = () => e.preventDefault();

      if (mod && k === 'z') return handled(), e.shiftKey ? redo() : undo();
      if (mod && k === 'y') return handled(), redo();
      if (mod && k === 'a') return handled(), selectAll();
      if (mod && k === 'd') return handled(), duplicateSelection();
      if (mod && k === 'g') return handled(), e.shiftKey ? ungroupSelection() : groupSelection();
      if (mod && k === 'c') return handled(), void copySelection();
      if (mod && k === 'x') return handled(), void copySelection(true);
      if (mod && k === 'v') return handled(), void pasteAt();
      if (mod && (k === '=' || k === '+')) return handled(), zoomBy(1.25);
      if (mod && k === '-') return handled(), zoomBy(0.8);
      if (mod && k === '0') return handled(), zoomTo(1);
      if (mod) return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          handled();
          deleteSelection();
          break;
        case 'Escape':
          if (s.tool === 'select' && !s.selectedNodes.size) setTool('pan');
          clearSelection();
          break;
        case 'Enter':
          if (s.selectedNodes.size === 1) {
            handled();
            setEditing([...s.selectedNodes][0]);
          } else if (s.selectedEdges.size === 1) {
            handled();
            setEditingEdge([...s.selectedEdges][0]);
          }
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!s.selectedNodes.size) return;
          handled();
          const step = e.shiftKey ? GRID * 5 : GRID;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          updateSelectedNodes((n) => ({ x: n.x + dx, y: n.y + dy }));
          break;
        }
        default:
          if (k === 'n') return handled(), void addNode(viewCenterWorld(), {}, { edit: true });
          if (k === 'f') return handled(), fitContent();
          if (k === 's') return handled(), setTool(s.tool === 'select' ? 'pan' : 'select');
          if (k === '0') return handled(), zoomTo(1);
          if (k === '=' || k === '+') return handled(), zoomBy(1.25);
          if (k === '-') return handled(), zoomBy(0.8);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
