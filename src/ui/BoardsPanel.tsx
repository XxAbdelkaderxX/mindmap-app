import { useEffect, useRef, useState } from 'react';
import type { BoardMeta } from '../model/types';
import { useStore } from '../store/store';
import { createBoard, deleteBoard, duplicateBoard, flush, openBoard, renameBoard, storage } from '../store/persistence';
import { exportCanvasFile, exportMarkdown, exportPng, importFile, pickFile } from '../lib/io';
import { Icon } from './icons';
import { toast } from './toast';

function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(t).toLocaleDateString();
}

export function BoardsPanel({ open, onClose, onHelp }: { open: boolean; onClose: () => void; onHelp: () => void }) {
  const boards = useStore((s) => s.boards);
  const current = useStore((s) => s.board.id);
  const snapToGrid = useStore((s) => s.snapToGrid);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setMenuFor(null);
      setRenaming(null);
      setConfirmDelete(null);
    } else {
      void flush();
      panelRef.current?.focus();
    }
  }, [open]);

  const run = (fn: () => unknown, close = true) => async () => {
    await fn();
    if (close) onClose();
  };

  const exportBoard = async (id: string) => {
    await flush();
    const b = await storage.getBoard(id);
    if (b) await exportCanvasFile(b);
  };

  return (
    <>
      <div className={`scrim${open ? ' is-open' : ''}`} data-ui onPointerDown={onClose} aria-hidden />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className={`panel${open ? ' is-open' : ''}`}
        data-ui
        aria-label="Boards"
        aria-hidden={!open}
        inert={!open}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <header className="panel__head">
          <div className="brand">
            <img src="favicon.svg" alt="" width={26} height={26} />
            <span>Canvas Mind</span>
          </div>
          <button type="button" className="tb-btn" aria-label="Close menu" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <div className="panel__scroll">
          <section className="panel__section">
            <div className="panel__row">
              <h2>Boards</h2>
              <button type="button" className="pill-btn" onClick={run(() => createBoard('Untitled board'))}>
                <Icon name="plus" size={16} /> New
              </button>
            </div>
            <ul className="board-list">
              {boards.map((b: BoardMeta) => (
                <li key={b.id} className={`board-item${b.id === current ? ' is-current' : ''}`}>
                  {renaming === b.id ? (
                    <form
                      className="board-item__rename"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = new FormData(e.currentTarget).get('name') as string;
                        void renameBoard(b.id, v);
                        setRenaming(null);
                      }}
                    >
                      <input name="name" defaultValue={b.name} autoFocus aria-label="Board name" onFocus={(e) => e.currentTarget.select()} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
                    </form>
                  ) : (
                    <button type="button" className="board-item__main" onClick={run(() => openBoard(b.id))}>
                      <span className="board-item__name">{b.name}</span>
                      <span className="board-item__meta">
                        {b.nodeCount} note{b.nodeCount === 1 ? '' : 's'} · {timeAgo(b.updatedAt)}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="tb-btn"
                    aria-label={`More actions for ${b.name}`}
                    aria-expanded={menuFor === b.id}
                    onClick={() => setMenuFor(menuFor === b.id ? null : b.id)}
                  >
                    <Icon name="more" />
                  </button>
                  {menuFor === b.id && (
                    <div className="board-item__actions">
                      <button type="button" onClick={() => { setRenaming(b.id); setMenuFor(null); }}>
                        <Icon name="edit" size={16} /> Rename
                      </button>
                      <button type="button" onClick={() => { void duplicateBoard(b.id); setMenuFor(null); toast('Board duplicated'); }}>
                        <Icon name="copy" size={16} /> Duplicate
                      </button>
                      <button type="button" onClick={() => { void exportBoard(b.id); setMenuFor(null); }}>
                        <Icon name="download" size={16} /> Export
                      </button>
                      {confirmDelete === b.id ? (
                        <button
                          type="button"
                          className="is-danger"
                          onClick={() => {
                            void deleteBoard(b.id);
                            setConfirmDelete(null);
                            setMenuFor(null);
                            toast(`Deleted “${b.name}”`);
                          }}
                        >
                          <Icon name="trash" size={16} /> Confirm delete
                        </button>
                      ) : (
                        <button type="button" className="is-danger" onClick={() => setConfirmDelete(b.id)}>
                          <Icon name="trash" size={16} /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel__section">
            <h2>This board</h2>
            <div className="action-grid">
              <button type="button" onClick={run(() => exportCanvasFile())}>
                <Icon name="file" /> <span>Export .canvas</span>
              </button>
              <button type="button" onClick={run(exportPng)}>
                <Icon name="image" /> <span>Export PNG</span>
              </button>
              <button type="button" onClick={run(() => exportMarkdown())}>
                <Icon name="markdown" /> <span>Export outline</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const f = await pickFile();
                  if (f && (await importFile(f))) onClose();
                }}
              >
                <Icon name="upload" /> <span>Import file</span>
              </button>
            </div>
            <p className="panel__note">.canvas files use the open JSON Canvas format and open in Obsidian.</p>
          </section>

          <section className="panel__section">
            <h2>Settings</h2>
            <label className="toggle">
              <span>
                <Icon name="grid" size={18} /> Snap to grid
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={snapToGrid}
                onChange={(e) => {
                  useStore.setState({ snapToGrid: e.target.checked });
                  try {
                    localStorage.setItem('cm:snap', e.target.checked ? '1' : '0');
                  } catch {
                    /* storage unavailable */
                  }
                }}
              />
            </label>
            <button type="button" className="link-row" onClick={onHelp}>
              <Icon name="help" size={18} /> Gestures & shortcuts
            </button>
          </section>
        </div>
        <footer className="panel__foot">Saved locally on this device · works offline</footer>
      </aside>
    </>
  );
}
