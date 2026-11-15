import { beforeEach, describe, expect, it } from 'vitest';
import {
  addConnectedNode,
  addEdge,
  addNode,
  beginTransient,
  deleteSelection,
  dragSet,
  duplicateSelection,
  endTransient,
  groupSelection,
  loadBoard,
  moveNodesTransient,
  redo,
  selectNodes,
  undo,
  ungroupSelection,
  updateNode,
  updateSelectedNodes,
  useStore,
  insertDoc,
  selectionDoc,
  reverseSelectedEdges,
  selectEdge,
} from './store';
import { makeBoard } from '../model/defaults';

const nodes = () => useStore.getState().board.nodes;
const edges = () => useStore.getState().board.edges;

beforeEach(() => {
  loadBoard(makeBoard('t'));
  useStore.setState({ snapToGrid: true });
});

describe('store', () => {
  it('adds a node snapped to the grid and selects it', () => {
    const id = addNode({ x: 3, y: 7 }, { text: 'hi' }, { edit: true });
    expect(nodes()).toHaveLength(1);
    expect(nodes()[0]).toMatchObject({ id, x: -120, y: -40, text: 'hi' });
    expect(useStore.getState().selectedNodes.has(id)).toBe(true);
    expect(useStore.getState().editingId).toBe(id);
  });

  it('undoes and redoes changes', () => {
    const id = addNode({ x: 0, y: 0 });
    updateNode(id, { color: '1' });
    expect(nodes()[0].color).toBe('1');
    undo();
    expect(nodes()[0].color).toBe('');
    undo();
    expect(nodes()).toHaveLength(0);
    redo();
    redo();
    expect(nodes()[0].color).toBe('1');
    // a new change clears the redo stack
    undo();
    updateNode(id, { color: '2' });
    expect(useStore.getState().future).toHaveLength(0);
  });

  it('coalesces typing into one undo step', () => {
    const id = addNode({ x: 0, y: 0 });
    updateNode(id, { text: 'a' }, 'edit:1');
    updateNode(id, { text: 'ab' }, 'edit:1');
    updateNode(id, { text: 'abc' }, 'edit:1');
    undo();
    expect(nodes()[0].text).toBe('');
  });

  it('records a drag as a single history entry', () => {
    const id = addNode({ x: 0, y: 0 });
    const n = nodes()[0];
    const past = useStore.getState().past.length;
    beginTransient();
    const origin = new Map([[id, { x: n.x, y: n.y }]]);
    moveNodesTransient(origin, 20, 0);
    moveNodesTransient(origin, 40, 20);
    endTransient();
    expect(nodes()[0]).toMatchObject({ x: n.x + 40, y: n.y + 20 });
    expect(useStore.getState().past.length).toBe(past + 1);
    undo();
    expect(nodes()[0]).toMatchObject({ x: n.x, y: n.y });
  });

  it('does not record a no-op drag', () => {
    addNode({ x: 0, y: 0 });
    const past = useStore.getState().past.length;
    beginTransient();
    endTransient();
    expect(useStore.getState().past.length).toBe(past);
  });

  it('deletes nodes with their edges', () => {
    const a = addNode({ x: 0, y: 0 });
    const b = addNode({ x: 400, y: 0 });
    addEdge({ fromNode: a, toNode: b });
    expect(edges()).toHaveLength(1);
    selectNodes([a]);
    deleteSelection();
    expect(nodes().map((n) => n.id)).toEqual([b]);
    expect(edges()).toHaveLength(0);
    undo();
    expect(edges()).toHaveLength(1);
  });

  it('prevents self loops and duplicate edges', () => {
    const a = addNode({ x: 0, y: 0 });
    const b = addNode({ x: 400, y: 0 });
    expect(addEdge({ fromNode: a, toNode: a })).toBeNull();
    const e1 = addEdge({ fromNode: a, toNode: b });
    const e2 = addEdge({ fromNode: a, toNode: b });
    expect(e1).toBe(e2);
    expect(edges()).toHaveLength(1);
  });

  it('creates a connected node in one step', () => {
    const a = addNode({ x: 0, y: 0 }, { color: '4' });
    const past = useStore.getState().past.length;
    const b = addConnectedNode(a, 'right', { x: 400, y: 0 }, 'left');
    expect(nodes().find((n) => n.id === b)?.color).toBe('4');
    expect(edges()[0]).toMatchObject({ fromNode: a, toNode: b, fromSide: 'right', toSide: 'left' });
    expect(useStore.getState().past.length).toBe(past + 1);
  });

  it('groups selection and moves contents with the group', () => {
    const a = addNode({ x: 0, y: 0 });
    const b = addNode({ x: 400, y: 0 });
    selectNodes([a, b]);
    groupSelection('Team');
    const group = nodes()[0];
    expect(group).toMatchObject({ type: 'group', label: 'Team' });
    expect([...dragSet([group.id])].sort()).toEqual([a, b, group.id].sort());
    ungroupSelection();
    expect(nodes().some((n) => n.type === 'group')).toBe(false);
    expect([...useStore.getState().selectedNodes].sort()).toEqual([a, b].sort());
  });

  it('duplicates selection including internal edges', () => {
    const a = addNode({ x: 0, y: 0 });
    const b = addNode({ x: 400, y: 0 });
    addEdge({ fromNode: a, toNode: b });
    selectNodes([a, b]);
    duplicateSelection();
    expect(nodes()).toHaveLength(4);
    expect(edges()).toHaveLength(2);
    const sel = useStore.getState().selectedNodes;
    expect(sel.has(a)).toBe(false);
    expect(sel.size).toBe(2);
  });

  it('updates all selected nodes at once', () => {
    const a = addNode({ x: 0, y: 0 });
    const b = addNode({ x: 400, y: 0 });
    selectNodes([a, b]);
    updateSelectedNodes({ color: '5', shape: 'ellipse' });
    expect(nodes().every((n) => n.color === '5' && n.shape === 'ellipse')).toBe(true);
    undo();
    expect(nodes().every((n) => n.color === '')).toBe(true);
  });

  it('copies and inserts a selection with fresh ids', () => {
    const a = addNode({ x: 0, y: 0 });
    const b = addNode({ x: 400, y: 0 });
    addEdge({ fromNode: a, toNode: b });
    selectNodes([a, b]);
    const doc = selectionDoc();
    insertDoc(doc, { x: 1000, y: 1000 });
    expect(nodes()).toHaveLength(4);
    expect(edges()).toHaveLength(2);
    const ids = new Set(nodes().map((n) => n.id));
    expect(ids.size).toBe(4);
  });

  it('reverses edges', () => {
    const a = addNode({ x: 0, y: 0 });
    const b = addNode({ x: 400, y: 0 });
    const e = addEdge({ fromNode: a, toNode: b, fromSide: 'right', toSide: 'left' })!;
    selectEdge(e);
    reverseSelectedEdges();
    expect(edges()[0]).toMatchObject({ fromNode: b, toNode: a, fromSide: 'left', toSide: 'right', fromEnd: 'arrow', toEnd: 'none' });
  });
});
