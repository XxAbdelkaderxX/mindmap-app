import { useState } from 'react';
import { renameCurrentBoard, useStore } from '../store/store';

export function TopBar() {
  const name = useStore((s) => s.board.name);
  const [editing, setEditing] = useState(false);
  return (
    <div className="topbar" data-ui>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            renameCurrentBoard(new FormData(e.currentTarget).get('name') as string);
            setEditing(false);
          }}
        >
          <input
            className="topbar__input"
            name="name"
            defaultValue={name}
            autoFocus
            aria-label="Board name"
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          />
        </form>
      ) : (
        <button type="button" className="topbar__title" title="Rename board" onClick={() => setEditing(true)}>
          {name}
        </button>
      )}
    </div>
  );
}
