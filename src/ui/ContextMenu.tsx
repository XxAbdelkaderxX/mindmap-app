import { useLayoutEffect, useRef } from 'react';
import type { Point } from '../model/types';
import { addNode, selectAll, useStore } from '../store/store';
import { fitContent } from '../canvas/viewport';
import { pasteAt } from '../lib/clipboard';
import { Icon, type IconName } from './icons';

export interface ContextMenuState {
  x: number;
  y: number;
  world: Point;
}

export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Ignore the synthetic click from the finger that opened the menu: only
  // activate items after a fresh press inside the menu.
  const armed = useRef(false);
  const hasNodes = useStore((s) => s.board.nodes.length > 0);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const x = Math.min(state.x + 8, parent.clientWidth - el.offsetWidth - 8);
    const y = Math.min(state.y + 8, parent.clientHeight - el.offsetHeight - 8);
    el.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }, [state]);

  const item = (icon: IconName, label: string, run: () => void) => (
    <button
      type="button"
      className="menu-item"
      onClick={() => {
        if (!armed.current) return;
        run();
        onClose();
      }}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <div className="menu-scrim" data-ui onPointerDown={onClose} />
      <div
        ref={ref}
        className="ctx-menu"
        data-ui
        role="menu"
        onPointerDown={(e) => {
          armed.current = true;
          e.stopPropagation();
        }}
      >
        {item('note', 'Add note here', () => addNode(state.world, {}, { edit: true }))}
        {item('group', 'Add group here', () => addNode(state.world, { type: 'group', label: 'Group', style: 'outline', width: 400, height: 300 }))}
        {item('copy', 'Paste', () => void pasteAt(state.world))}
        {hasNodes && item('select', 'Select all', selectAll)}
        {hasNodes && item('fit', 'Zoom to fit', () => fitContent())}
      </div>
    </>
  );
}
