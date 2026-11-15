import { createStore, del, get as idbGet, set as idbSet, type UseStore } from 'idb-keyval';
import type { Board, BoardMeta, Doc } from '../model/types';
import { makeBoard, newId } from '../model/defaults';
import { boardMeta, loadBoard, useStore } from './store';

const INDEX_KEY = 'boards:index';
const LAST_KEY = 'boards:last';
const boardKey = (id: string) => `board:${id}`;

let db: UseStore | undefined;
const store = () => (db ??= createStore('canvas-mind', 'kv'));

export const storage = {
  getIndex: async () => ((await idbGet<BoardMeta[]>(INDEX_KEY, store())) ?? []) as BoardMeta[],
  setIndex: (list: BoardMeta[]) => idbSet(INDEX_KEY, list, store()),
  getBoard: (id: string) => idbGet<Board>(boardKey(id), store()),
  putBoard: (b: Board) => idbSet(boardKey(b.id), b, store()),
  deleteBoard: (id: string) => del(boardKey(id), store()),
  getLast: () => idbGet<string>(LAST_KEY, store()),
  setLast: (id: string) => idbSet(LAST_KEY, id, store()),
};

const sortIndex = (list: BoardMeta[]) => list.slice().sort((a, b) => b.updatedAt - a.updatedAt);

/** Persist the current board (including viewport) and update the index. */
export async function saveCurrent() {
  const s = useStore.getState();
  const board: Board = { ...s.board, viewport: s.viewport };
  await storage.putBoard(board);
  const meta = boardMeta(board);
  const boards = sortIndex([meta, ...s.boards.filter((b) => b.id !== board.id)]);
  useStore.setState({ boards });
  await storage.setIndex(boards);
  dirty = false;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
let saving: Promise<void> = Promise.resolve();

export function scheduleSave(delay = 400) {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

export function flush(): Promise<void> {
  clearTimeout(timer);
  if (!dirty) return saving;
  saving = saving.then(saveCurrent).catch((err) => console.error('Autosave failed', err));
  return saving;
}

/** Load the board index and open the last board (creating a welcome board on first run). */
export async function initPersistence() {
  let boards = sortIndex(await storage.getIndex());
  const lastId = await storage.getLast();
  let board: Board | undefined;
  const target = boards.find((b) => b.id === lastId) ?? boards[0];
  if (target) board = await storage.getBoard(target.id);
  if (!board) {
    board = makeBoard('Welcome', true);
    board.viewport = { x: 0, y: 0, zoom: 0 }; // zoom 0 => fit on first render
    await storage.putBoard(board);
    boards = sortIndex([boardMeta(board), ...boards.filter((b) => b.id !== board!.id)]);
    await storage.setIndex(boards);
  }
  await storage.setLast(board.id);
  useStore.setState({ boards });
  loadBoard(board);
  useStore.setState({ ready: true });

  // Autosave: any document/viewport change schedules a debounced write.
  useStore.subscribe((s, prev) => {
    if (s.board.id !== prev.board.id) return;
    if (s.revision !== prev.revision || s.viewport !== prev.viewport) scheduleSave(s.viewport !== prev.viewport && s.revision === prev.revision ? 800 : 400);
  });
  const onHide = () => void flush();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && onHide());
  window.addEventListener('pagehide', onHide);
}

export async function openBoard(id: string) {
  await flush();
  if (useStore.getState().board.id === id) return;
  const board = await storage.getBoard(id);
  if (!board) return;
  loadBoard(board);
  await storage.setLast(id);
}

export async function createBoard(name = 'Untitled board', doc?: Doc): Promise<Board> {
  await flush();
  const board = makeBoard(name);
  if (doc) {
    board.nodes = doc.nodes;
    board.edges = doc.edges;
    board.viewport = { x: 0, y: 0, zoom: 0 };
  } else {
    board.viewport = { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 };
  }
  await storage.putBoard(board);
  const boards = sortIndex([boardMeta(board), ...useStore.getState().boards]);
  useStore.setState({ boards });
  await storage.setIndex(boards);
  loadBoard(board);
  await storage.setLast(board.id);
  return board;
}

export async function duplicateBoard(id: string) {
  await flush();
  const src = await storage.getBoard(id);
  if (!src) return;
  const copy: Board = { ...structuredClone(src), id: newId(), name: `${src.name} copy`, createdAt: Date.now(), updatedAt: Date.now() };
  await storage.putBoard(copy);
  const boards = sortIndex([boardMeta(copy), ...useStore.getState().boards]);
  useStore.setState({ boards });
  await storage.setIndex(boards);
}

export async function renameBoard(id: string, name: string) {
  const trimmed = name.trim() || 'Untitled board';
  const s = useStore.getState();
  if (s.board.id === id) {
    useStore.setState({ board: { ...s.board, name: trimmed } });
  }
  const b = await storage.getBoard(id);
  if (b) await storage.putBoard({ ...(s.board.id === id ? { ...s.board, viewport: s.viewport } : b), name: trimmed });
  const boards = useStore.getState().boards.map((m) => (m.id === id ? { ...m, name: trimmed } : m));
  useStore.setState({ boards });
  await storage.setIndex(boards);
}

export async function deleteBoard(id: string) {
  const s = useStore.getState();
  await storage.deleteBoard(id);
  const boards = s.boards.filter((b) => b.id !== id);
  useStore.setState({ boards });
  await storage.setIndex(boards);
  if (s.board.id === id) {
    dirty = false;
    clearTimeout(timer);
    if (boards[0]) await openBoardFresh(boards[0].id);
    else await createBoard('Untitled board');
  }
}

async function openBoardFresh(id: string) {
  const board = await storage.getBoard(id);
  if (board) {
    loadBoard(board);
    await storage.setLast(id);
  }
}
