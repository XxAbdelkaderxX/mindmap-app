import { describe, expect, it } from 'vitest';
import { createBoard, deleteBoard, flush, initPersistence, openBoard, storage } from './persistence';
import { addNode, useStore } from './store';

describe('persistence', () => {
  it('creates a welcome board, autosaves edits and switches boards', async () => {
    await initPersistence();
    const s = useStore.getState();
    expect(s.ready).toBe(true);
    expect(s.board.name).toBe('Welcome');
    expect(s.boards).toHaveLength(1);
    const welcomeId = s.board.id;
    const count = s.board.nodes.length;

    addNode({ x: 0, y: 0 }, { text: 'persist me' });
    await flush();
    const saved = await storage.getBoard(welcomeId);
    expect(saved?.nodes).toHaveLength(count + 1);
    expect(saved?.nodes.some((n) => n.text === 'persist me')).toBe(true);

    const b2 = await createBoard('Second');
    expect(useStore.getState().board.id).toBe(b2.id);
    expect(useStore.getState().boards.map((b) => b.name)).toContain('Second');
    expect(await storage.getLast()).toBe(b2.id);

    await openBoard(welcomeId);
    expect(useStore.getState().board.nodes.some((n) => n.text === 'persist me')).toBe(true);
    expect(useStore.getState().past).toHaveLength(0);

    await deleteBoard(welcomeId);
    expect(useStore.getState().board.id).toBe(b2.id);
    expect(await storage.getBoard(welcomeId)).toBeUndefined();
    expect((await storage.getIndex()).map((b) => b.id)).toEqual([b2.id]);
  });
});
