import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { clearSelection, setEditing, setEditingEdge, setTool, useStore } from '../store/store';

/**
 * Android hardware/gesture back button: close overlays first, then stop
 * editing, then clear the selection, and only then leave the app.
 */
export function useAndroidBack(closeOverlay: () => boolean) {
  const ref = useRef(closeOverlay);
  ref.current = closeOverlay;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    let disposed = false;
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('backButton', () => {
        if (ref.current()) return;
        const s = useStore.getState();
        if (s.editingId || s.editingEdgeId) {
          (document.activeElement as HTMLElement | null)?.blur?.();
          setEditing(null);
          setEditingEdge(null);
        } else if (s.selectedNodes.size || s.selectedEdges.size) {
          clearSelection();
        } else if (s.tool === 'select') {
          setTool('pan');
        } else {
          void App.minimizeApp();
        }
      }).then((h) => {
        if (disposed) void h.remove();
        else remove = () => void h.remove();
      }),
    );
    return () => {
      disposed = true;
      remove?.();
    };
  }, []);
}
