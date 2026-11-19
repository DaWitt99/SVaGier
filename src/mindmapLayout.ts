import type { DiagramNode, MindMapLayout } from "./model";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./components/DiagramCanvas";

type NodeMap = Map<string, DiagramNode>;

function buildChildren(nodes: DiagramNode[]): Map<string, DiagramNode[]> {
  const validIds = new Set(nodes.map((node) => node.id));
  const children = new Map<string, DiagramNode[]>();
  for (const node of nodes) {
    if (!node.parentId || !validIds.has(node.parentId)) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
  return children;
}

function safeRoots(nodes: DiagramNode[]): DiagramNode[] {
  const ids = new Set(nodes.map((node) => node.id));
  const roots = nodes.filter((node) => !node.parentId || !ids.has(node.parentId)).sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
  if (roots.length > 0) return roots;
  return nodes.slice(0, 1);
}

function layoutTree(nodes: DiagramNode[], children: Map<string, DiagramNode[]>, roots: DiagramNode[], horizontal: boolean): DiagramNode[] {
  const nodeMap: NodeMap = new Map(nodes.map((node) => [node.id, node]));
  const spreadGap = 58;
  const rootGap = 132;
  const depthSizes = new Map<number, number>();
  const spans = new Map<string, number>();
  const measuring = new Set<string>();

  function measure(id: string): number {
    const node = nodeMap.get(id);
    if (!node) return 80;
    if (spans.has(id)) return spans.get(id)!;
    if (measuring.has(id)) return horizontal ? node.height : node.width;
    measuring.add(id);
    const childNodes = node.collapsed ? [] : children.get(id) ?? [];
    const childSpan = childNodes.reduce((sum, child, index) => sum + measure(child.id) + (index === 0 ? 0 : spreadGap), 0);
    const span = Math.max(horizontal ? node.height : node.width, childSpan);
    spans.set(id, span);
    measuring.delete(id);
    return span;
  }

  function collectDepth(id: string, depth: number, seen: Set<string>) {
    if (seen.has(id)) return;
    seen.add(id);
    const node = nodeMap.get(id);
    if (!node) return;
    const size = horizontal ? node.width : node.height;
    depthSizes.set(depth, Math.max(depthSizes.get(depth) ?? 0, size));
    if (!node.collapsed) for (const child of children.get(id) ?? []) collectDepth(child.id, depth + 1, seen);
  }

  const seen = new Set<string>();
  for (const root of roots) {
    measure(root.id);
    collectDepth(root.id, 0, seen);
  }
  const depthOffsets = new Map<number, number>();
  let depthPosition = 84;
  for (let depth = 0; depth <= Math.max(0, ...depthSizes.keys()); depth++) {
    depthOffsets.set(depth, depthPosition);
    depthPosition += (depthSizes.get(depth) ?? 100) + 92;
  }

  const rootSpans = roots.map((root) => measure(root.id));
  const forestSpan = rootSpans.reduce((sum, span, index) => sum + span + (index === 0 ? 0 : rootGap), 0);
  let rootCursor = (horizontal ? CANVAS_HEIGHT : CANVAS_WIDTH) / 2 - forestSpan / 2;
  const updates = new Map<string, Partial<DiagramNode>>();
  const placed = new Set<string>();

  function place(id: string, spreadStart: number, depth: number) {
    if (placed.has(id)) return;
    placed.add(id);
    const node = nodeMap.get(id);
    if (!node) return;
    const span = measure(id);
    const spreadSize = horizontal ? node.height : node.width;
    const cross = spreadStart + (span - spreadSize) / 2;
    const along = depthOffsets.get(depth) ?? 84;
    updates.set(id, horizontal ? { x: along, y: cross } : { x: cross, y: along });
    const childNodes = (node.collapsed ? [] : children.get(id) ?? []).filter((child) => !placed.has(child.id));
    const totalChildren = childNodes.reduce((sum, child, index) => sum + measure(child.id) + (index === 0 ? 0 : spreadGap), 0);
    let childCursor = spreadStart + (span - totalChildren) / 2;
    for (const child of childNodes) {
      place(child.id, childCursor, depth + 1);
      childCursor += measure(child.id) + spreadGap;
    }
  }

  roots.forEach((root, index) => {
    place(root.id, rootCursor, 0);
    rootCursor += rootSpans[index] + rootGap;
  });

  return nodes.map((node) => updates.has(node.id) ? { ...node, ...updates.get(node.id) } : node);
}

function layoutRadial(nodes: DiagramNode[], children: Map<string, DiagramNode[]>, roots: DiagramNode[]): DiagramNode[] {
  const nodeMap: NodeMap = new Map(nodes.map((node) => [node.id, node]));
  const rootCenter = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  const maxDimension = Math.max(120, ...nodes.map((node) => Math.max(node.width, node.height)));
  const radiusStep = Math.max(180, maxDimension + 54);
  const updates = new Map<string, Partial<DiagramNode>>();
  const placed = new Set<string>();

  function leafCount(id: string, visiting: Set<string>): number {
    if (visiting.has(id)) return 1;
    visiting.add(id);
    const childNodes = nodeMap.get(id)?.collapsed ? [] : children.get(id) ?? [];
    const count = childNodes.length === 0 ? 1 : childNodes.reduce((sum, child) => sum + leafCount(child.id, visiting), 0);
    visiting.delete(id);
    return count;
  }

  function place(id: string, depth: number, startAngle: number, endAngle: number, center: { x: number; y: number }) {
    if (placed.has(id)) return;
    placed.add(id);
    const node = nodeMap.get(id);
    if (!node) return;
    if (depth === 0) updates.set(id, { x: center.x - node.width / 2, y: center.y - node.height / 2 });
    else {
      const angle = (startAngle + endAngle) / 2;
      const radius = radiusStep * depth;
      updates.set(id, { x: center.x + Math.cos(angle) * radius - node.width / 2, y: center.y + Math.sin(angle) * radius - node.height / 2 });
    }
    const childNodes = (node.collapsed ? [] : children.get(id) ?? []).filter((child) => !placed.has(child.id));
    const totalLeaves = childNodes.reduce((sum, child) => sum + leafCount(child.id, new Set()), 0);
    if (totalLeaves === 0) return;
    let cursor = startAngle;
    for (const child of childNodes) {
      const fraction = leafCount(child.id, new Set()) / totalLeaves;
      const childEnd = cursor + (endAngle - startAngle) * fraction;
      place(child.id, depth + 1, cursor, childEnd, center);
      cursor = childEnd;
    }
  }

  if (roots.length === 1) place(roots[0].id, 0, -Math.PI, Math.PI, rootCenter);
  else {
    roots.forEach((root, index) => {
      const angle = -Math.PI / 2 + (index / roots.length) * Math.PI * 2;
      const center = { x: rootCenter.x + Math.cos(angle) * 250, y: rootCenter.y + Math.sin(angle) * 250 };
      place(root.id, 0, angle - Math.PI / roots.length, angle + Math.PI / roots.length, center);
    });
  }
  return nodes.map((node) => updates.has(node.id) ? { ...node, ...updates.get(node.id) } : node);
}

export function layoutMindMap(nodes: DiagramNode[], mode: MindMapLayout): DiagramNode[] {
  if (mode === "manual" || nodes.length === 0) return nodes;
  const children = buildChildren(nodes);
  const roots = safeRoots(nodes);
  if (mode === "radial") return layoutRadial(nodes, children, roots);
  return layoutTree(nodes, children, roots, mode === "horizontal");
}

export function getVisibleMindMapNodes(nodes: DiagramNode[]): DiagramNode[] {
  const children = buildChildren(nodes);
  const roots = safeRoots(nodes);
  const visibleIds = new Set<string>();
  function visit(node: DiagramNode, seen: Set<string>) {
    if (seen.has(node.id) || visibleIds.has(node.id)) return;
    seen.add(node.id);
    visibleIds.add(node.id);
    if (!node.collapsed) for (const child of children.get(node.id) ?? []) visit(child, seen);
  }
  for (const root of roots) visit(root, new Set());
  return nodes.filter((node) => visibleIds.has(node.id));
}
