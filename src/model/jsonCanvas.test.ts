import { describe, expect, it } from 'vitest';
import { fromJsonCanvas, ImportError, toJsonCanvas, toMarkdownOutline } from './jsonCanvas';
import { makeBoard, makeEdge, makeNode } from './defaults';

describe('JSON Canvas', () => {
  it('round-trips nodes, edges and styling', () => {
    const board = makeBoard('Test');
    const a = makeNode({ x: 10, y: 20, text: '# Hello', color: '3', shape: 'pill' });
    const b = makeNode({ x: 300, y: 20, text: 'World', style: 'outline', color: '#ff00aa' });
    const g = makeNode({ type: 'group', label: 'G', x: 0, y: 0, width: 600, height: 300, style: 'outline' });
    board.nodes = [g, a, b];
    board.edges = [makeEdge({ fromNode: a.id, toNode: b.id, fromSide: 'right', toSide: 'left', lineStyle: 'dashed', path: 'elbow', label: 'rel', width: 4, fromEnd: 'arrow' })];
    const file = JSON.parse(JSON.stringify(toJsonCanvas(board)));
    expect(file.nodes[1]).toMatchObject({ id: a.id, type: 'text', text: '# Hello', color: '3', cmShape: 'pill' });
    expect(file.nodes[0]).toMatchObject({ type: 'group', label: 'G' });
    const back = fromJsonCanvas(file);
    expect(back.name).toBe('Test');
    expect(back.nodes).toEqual(board.nodes);
    expect(back.edges).toEqual(board.edges);
  });

  it('imports Obsidian file/link nodes and drops dangling edges', () => {
    const doc = fromJsonCanvas({
      nodes: [
        { id: 'a', type: 'file', file: 'Notes/x.md', x: 0, y: 0, width: 100, height: 100 },
        { id: 'b', type: 'link', url: 'https://example.com', x: 200, y: 0, width: 100, height: 100 },
      ],
      edges: [
        { id: 'e1', fromNode: 'a', toNode: 'b' },
        { id: 'e2', fromNode: 'a', toNode: 'missing' },
      ],
    });
    expect(doc.nodes.map((n) => n.type)).toEqual(['text', 'text']);
    expect(doc.nodes[0].text).toContain('Notes/x.md');
    expect(doc.nodes[1].text).toContain('https://example.com');
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0]).toMatchObject({ fromEnd: 'none', toEnd: 'arrow' });
  });

  it('rejects invalid documents', () => {
    expect(() => fromJsonCanvas(null)).toThrow(ImportError);
    expect(() => fromJsonCanvas({ foo: 1 })).toThrow(ImportError);
  });

  it('exports a markdown outline following edges', () => {
    const board = makeBoard('Map');
    const root = makeNode({ text: '# Root', y: 0 });
    const c1 = makeNode({ text: 'Child **one**', y: -100 });
    const c2 = makeNode({ text: 'Child two', y: 100 });
    const gc = makeNode({ text: 'Grandchild', y: 100 });
    board.nodes = [root, c1, c2, gc];
    board.edges = [
      makeEdge({ fromNode: root.id, toNode: c1.id }),
      makeEdge({ fromNode: root.id, toNode: c2.id }),
      makeEdge({ fromNode: c2.id, toNode: gc.id }),
    ];
    expect(toMarkdownOutline(board)).toBe('# Map\n\n- Root\n  - Child **one**\n  - Child two\n    - Grandchild\n');
  });
});
