import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasNode, Side } from '../model/types';
import { GRID, resolveColor } from '../model/defaults';
import { renderMarkdown, toggleTask } from '../lib/markdown';
import { breakCoalesce, setEditing, updateNode } from '../store/store';

const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
let editSession = 0;

interface Props {
  node: CanvasNode;
  selected: boolean;
  editing: boolean;
  showHandles: boolean;
  dropTarget: boolean;
}

export const NodeView = memo(function NodeView({ node, selected, editing, showHandles, dropTarget }: Props) {
  const color = node.color ? resolveColor(node.color) : '';
  const cls = [
    'node',
    `node--${node.type}`,
    `style-${node.style}`,
    `shape-${node.shape}`,
    node.color ? 'has-color' : '',
    selected ? 'is-selected' : '',
    editing ? 'is-editing' : '',
    dropTarget ? 'is-drop' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      data-node-id={node.id}
      style={{
        transform: `translate(${node.x}px, ${node.y}px)`,
        width: node.width,
        height: node.height,
        ...(color ? ({ '--c': color } as React.CSSProperties) : null),
      }}
    >
      {node.type === 'group' ? <GroupLabel node={node} editing={editing} /> : <TextBody node={node} editing={editing} />}
      {showHandles &&
        SIDES.map((s) => <div key={s} className={`handle handle--${s}`} data-handle={s} aria-label={`Connect from ${s}`} />)}
      {selected && <div className="resize" data-resize aria-label="Resize" />}
    </div>
  );
});

function TextBody({ node, editing }: { node: CanvasNode; editing: boolean }) {
  if (editing) return <TextEditor node={node} />;
  const html = renderMarkdown(node.text);
  return (
    <div className="node__body">
      {node.text.trim() ? (
        <div
          className="md"
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t instanceof HTMLInputElement && t.classList.contains('md-task')) {
              const all = Array.from(e.currentTarget.querySelectorAll('input.md-task'));
              updateNode(node.id, { text: toggleTask(node.text, all.indexOf(t)) });
            }
          }}
        />
      ) : (
        <div className="md md--empty">Empty note</div>
      )}
    </div>
  );
}

function TextEditor({ node }: { node: CanvasNode }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [session] = useState(() => `edit:${node.id}:${++editSession}`);
  const nodeRef = useRef(node);
  nodeRef.current = node;

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    const end = ta.value.length;
    ta.setSelectionRange(end, end);
  }, []);

  useEffect(() => () => breakCoalesce(), []);

  const grow = (ta: HTMLTextAreaElement, text: string) => {
    const n = nodeRef.current;
    // Body padding (top + bottom) is 2 * 12px; borders 2px.
    const needed = ta.scrollHeight + 26;
    const patch: Partial<CanvasNode> = { text };
    if (needed > n.height) patch.height = Math.ceil(needed / GRID) * GRID;
    updateNode(n.id, patch, session);
  };

  return (
    <div className="node__body">
      <textarea
        ref={ref}
        className="node__editor"
        value={node.text}
        placeholder="Write Markdown…"
        spellCheck
        onChange={(e) => grow(e.currentTarget, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            e.stopPropagation();
            setEditing(null);
          }
        }}
      />
    </div>
  );
}

function GroupLabel({ node, editing }: { node: CanvasNode; editing: boolean }) {
  const [draft, setDraft] = useState(node.label ?? '');
  useEffect(() => setDraft(node.label ?? ''), [node.label, editing]);
  if (editing) {
    const done = () => {
      updateNode(node.id, { label: draft.trim() });
      setEditing(null);
    };
    return (
      <div className="group__label is-editing">
        <input
          autoFocus
          className="group__input"
          value={draft}
          placeholder="Group name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={done}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              done();
            }
          }}
        />
      </div>
    );
  }
  return (
    <div className="group__label" data-group-label>
      {node.label || 'Untitled group'}
    </div>
  );
}
