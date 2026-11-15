import type { Board } from '../model/types';
import { fromJsonCanvas, ImportError, toJsonCanvas, toMarkdownOutline } from '../model/jsonCanvas';
import { boundsOf } from '../model/geometry';
import { clearSelection, useStore } from '../store/store';
import { createBoard } from '../store/persistence';
import { toast } from '../ui/toast';

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mind-map';

export async function downloadBlob(blob: Blob, filename: string) {
  // Prefer the native share sheet on touch devices that support sharing files
  const file = new File([blob], filename, { type: blob.type });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function currentBoard(): Board {
  const s = useStore.getState();
  return { ...s.board, viewport: s.viewport };
}

export async function exportCanvasFile(board: Board = currentBoard()) {
  const json = JSON.stringify(toJsonCanvas(board), null, 2);
  await downloadBlob(new Blob([json], { type: 'application/json' }), `${safeName(board.name)}.canvas`);
  toast('Exported .canvas file');
}

export async function exportMarkdown(board: Board = currentBoard()) {
  await downloadBlob(new Blob([toMarkdownOutline(board)], { type: 'text/markdown' }), `${safeName(board.name)}.md`);
  toast('Exported Markdown outline');
}

export async function exportPng() {
  const board = currentBoard();
  const world = document.querySelector<HTMLElement>('.world');
  const b = boundsOf(board.nodes);
  if (!world || !b) {
    toast('Nothing to export');
    return;
  }
  clearSelection();
  // Wait for the deselected state to render
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const pad = 48;
  const width = Math.ceil(b.width + pad * 2);
  const height = Math.ceil(b.height + pad * 2);
  const maxPixels = 16_000_000;
  const ratio = Math.max(0.25, Math.min(2, Math.sqrt(maxPixels / (width * height))));
  try {
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(world, {
      width,
      height,
      pixelRatio: ratio,
      backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#1e1e1e',
      style: { transform: `translate(${pad - b.x}px, ${pad - b.y}px) scale(1)`, left: '0', top: '0' },
      filter: (el) => !(el instanceof HTMLElement && (el.classList.contains('handle') || el.classList.contains('resize'))),
    });
    if (!blob) throw new Error('empty image');
    await downloadBlob(blob, `${safeName(board.name)}.png`);
    toast('Exported PNG image');
  } catch (err) {
    console.error(err);
    toast('PNG export failed');
  }
}

export async function importFile(file: File) {
  try {
    const text = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ImportError('File is not valid JSON.');
    }
    const doc = fromJsonCanvas(data);
    const name = doc.name || file.name.replace(/\.(canvas|json)$/i, '') || 'Imported board';
    await createBoard(name, { nodes: doc.nodes, edges: doc.edges });
    toast(`Imported “${name}” (${doc.nodes.length} nodes)`);
    return true;
  } catch (err) {
    toast(err instanceof ImportError ? err.message : 'Could not import that file');
    console.error(err);
    return false;
  }
}

export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.canvas,.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
