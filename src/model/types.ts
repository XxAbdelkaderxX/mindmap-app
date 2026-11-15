export type Side = 'top' | 'right' | 'bottom' | 'left';
export type NodeType = 'text' | 'group';
export type NodeStyle = 'filled' | 'outline' | 'plain';
export type NodeShape = 'rect' | 'pill' | 'ellipse';
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type PathType = 'curve' | 'straight' | 'elbow';
export type EndType = 'none' | 'arrow';

/** Color is either '' (default), a preset id '1'..'6' (JSON Canvas presets) or a hex string. */
export type ColorValue = string;

export interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Markdown body for text nodes; ignored for groups. */
  text: string;
  /** Title for groups. */
  label?: string;
  color: ColorValue;
  style: NodeStyle;
  shape: NodeShape;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  /** Explicit attachment side, or undefined for automatic. */
  fromSide?: Side;
  toSide?: Side;
  fromEnd: EndType;
  toEnd: EndType;
  color: ColorValue;
  lineStyle: LineStyle;
  path: PathType;
  width: number;
  label?: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Doc {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface Board extends Doc {
  id: string;
  name: string;
  viewport: Viewport;
  createdAt: number;
  updatedAt: number;
}

export interface BoardMeta {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  nodeCount: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}
