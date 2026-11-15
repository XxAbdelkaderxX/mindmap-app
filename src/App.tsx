import { useEffect, useState } from 'react';
import { Canvas } from './canvas/Canvas';
import { Toolbar } from './ui/Toolbar';
import { TopBar } from './ui/TopBar';
import { BoardsPanel } from './ui/BoardsPanel';
import { Toasts } from './ui/Toasts';
import { HelpSheet } from './ui/HelpSheet';
import { useStore } from './store/store';
import { initPersistence } from './store/persistence';
import { useShortcuts } from './lib/shortcuts';
import { importFile } from './lib/io';
import { ensureVisible } from './canvas/viewport';
import { useAndroidBack } from './lib/native';

export default function App() {
  const ready = useStore((s) => s.ready);
  const [panelOpen, setPanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem('cm:snap');
      if (v !== null) useStore.setState({ snapToGrid: v === '1' });
    } catch {
      /* storage unavailable */
    }
    initPersistence().catch((err) => {
      console.error(err);
      setError('Could not open local storage. Private browsing mode may block saving.');
      useStore.setState({ ready: true });
    });
  }, []);

  useShortcuts({ blocked: panelOpen || helpOpen, onEscapeOverlay: () => (setHelpOpen(false), setPanelOpen(false)) });

  useAndroidBack(() => {
    if (helpOpen) return setHelpOpen(false), true;
    if (panelOpen) return setPanelOpen(false), true;
    return false;
  });

  // Open files passed by the OS (installed PWA "Open with…")
  useEffect(() => {
    if (!ready) return;
    const lq = (window as unknown as { launchQueue?: { setConsumer: (cb: (p: { files: FileSystemFileHandle[] }) => void) => void } }).launchQueue;
    lq?.setConsumer(async (params) => {
      for (const h of params.files ?? []) await importFile(await h.getFile());
    });
  }, [ready]);

  // Keep the note being edited visible when the on-screen keyboard resizes the viewport
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const s = useStore.getState();
        const n = s.board.nodes.find((x) => x.id === s.editingId);
        if (n) ensureVisible(n, 24);
      }, 120);
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      className={`app${dragOver ? ' is-dragover' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) void importFile(f);
      }}
    >
      {ready ? (
        <>
          <Canvas />
          <TopBar />
          <Toolbar onOpenBoards={() => setPanelOpen(true)} />
          <BoardsPanel
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            onHelp={() => {
              setPanelOpen(false);
              setHelpOpen(true);
            }}
          />
          {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
          {error && <div className="banner" data-ui>{error}</div>}
        </>
      ) : (
        <div className="splash" aria-label="Loading">
          <img src="favicon.svg" alt="" width={56} height={56} />
        </div>
      )}
      <Toasts />
    </div>
  );
}
