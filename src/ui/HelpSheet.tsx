import { Icon } from './icons';

const TOUCH: [string, string][] = [
  ['Drag empty space', 'Pan the canvas'],
  ['Pinch', 'Zoom in and out'],
  ['Double‑tap empty space', 'Add a note'],
  ['Long‑press empty space', 'Box‑select, or release for quick menu'],
  ['Tap a note', 'Select it'],
  ['Double‑tap a note', 'Edit its Markdown'],
  ['Long‑press a note', 'Add / remove from selection'],
  ['Drag a side dot', 'Connect to a note, or drop to create one'],
  ['Tap a side dot', 'Add a connected note in that direction'],
  ['Drag the corner', 'Resize'],
  ['Tap a line', 'Select it to style, label or delete'],
];
const KEYS: [string, string][] = [
  ['⌘/Ctrl Z · ⇧⌘Z', 'Undo · Redo'],
  ['N · G', 'New note · Group selection'],
  ['Enter · Esc', 'Edit · Stop editing / deselect'],
  ['Delete', 'Delete selection'],
  ['⌘/Ctrl C · X · V · D', 'Copy · Cut · Paste · Duplicate'],
  ['⌘/Ctrl A', 'Select all'],
  ['Wheel · ⌘/Ctrl+wheel', 'Pan · Zoom'],
  ['F · 0 · + · −', 'Fit · 100% · Zoom in/out'],
  ['Shift+drag', 'Box‑select'],
];

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" data-ui role="dialog" aria-modal="true" aria-label="Gestures and shortcuts" onPointerDown={onClose}>
      <div className="modal__card" onPointerDown={(e) => e.stopPropagation()}>
        <header className="panel__head">
          <h2>Gestures & shortcuts</h2>
          <button type="button" className="tb-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="help-grid">
          <section>
            <h3>Touch</h3>
            <dl>
              {TOUCH.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h3>Keyboard & mouse</h3>
            <dl>
              {KEYS.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
