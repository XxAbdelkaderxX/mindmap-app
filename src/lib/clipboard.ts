import type { Doc, Point } from '../model/types';
import { fromJsonCanvas, toJsonCanvas } from '../model/jsonCanvas';
import { addNode, deleteSelection, insertDoc, selectionDoc, useStore } from '../store/store';
import { viewCenterWorld } from '../canvas/viewport';
import { toast } from '../ui/toast';

let internal: { doc: Doc; text: string } | null = null;
const MARK = 'canvas-mind/v1';

export async function copySelection(cut = false) {
  const doc = selectionDoc();
  if (!doc.nodes.length) return;
  const payload = JSON.stringify({ [MARK]: true, ...toJsonCanvas({ ...doc, name: '', viewport: { x: 0, y: 0, zoom: 1 } }) });
  internal = { doc, text: payload };
  try {
    await navigator.clipboard?.writeText(payload);
  } catch {
    /* clipboard permission denied: internal clipboard still works */
  }
  if (cut) deleteSelection();
  toast(`${cut ? 'Cut' : 'Copied'} ${doc.nodes.length} item${doc.nodes.length > 1 ? 's' : ''}`);
}

export async function pasteAt(at: Point | null = null) {
  const pos = at ?? viewCenterWorld();
  let text: string | null = null;
  try {
    text = (await navigator.clipboard?.readText()) ?? null;
  } catch {
    text = null;
  }
  if (text && internal && text === internal.text) {
    insertDoc(internal.doc, pos);
    return;
  }
  if (text) {
    try {
      const data = JSON.parse(text);
      if (data && Array.isArray(data.nodes)) {
        insertDoc(fromJsonCanvas(data), pos);
        return;
      }
    } catch {
      /* not JSON */
    }
    if (text.trim()) {
      const lines = text.split('\n').length;
      addNode(pos, { text: text.trim(), height: Math.min(400, Math.max(100, Math.ceil((lines * 24 + 30) / 20) * 20)) });
      return;
    }
  }
  if (internal) insertDoc(internal.doc, pos);
  else if (!useStore.getState().board.nodes.length) toast('Clipboard is empty');
  else toast('Nothing to paste');
}
