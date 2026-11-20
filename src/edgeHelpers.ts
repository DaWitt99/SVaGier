import type { ArrowheadKind, DiagramEdge, DiagramNode } from "./model";

export const PARENT_EDGE_PREFIX = "mindmap-parent:";

export const arrowheadOptions: { value: ArrowheadKind; label: string }[] = [
  { value: "none", label: "Brak" },
  { value: "triangle", label: "Trójkąt" },
  { value: "open", label: "Otwarty grot" },
  { value: "diamond", label: "Romb" },
  { value: "circle", label: "Koło" },
  { value: "bar", label: "Poprzeczka" },
];

export function isArrowheadKind(value: unknown): value is ArrowheadKind {
  return arrowheadOptions.some((option) => option.value === value);
}

export function parentEdgeId(childId: string): string {
  return `${PARENT_EDGE_PREFIX}${childId}`;
}

export function childIdFromParentEdgeId(id: string): string | null {
  return id.startsWith(PARENT_EDGE_PREFIX) ? id.slice(PARENT_EDGE_PREFIX.length) : null;
}

export function startArrowhead(edge: DiagramEdge): ArrowheadKind {
  return edge.startArrowhead ?? (edge.arrowStart ? "triangle" : "none");
}

export function endArrowhead(edge: DiagramEdge): ArrowheadKind {
  return edge.endArrowhead ?? (edge.arrowEnd === false ? "none" : "triangle");
}

export function arrowheadMarkerId(kind: ArrowheadKind): string {
  return `edge-marker-${kind}`;
}

export function parentEdgeFor(child: DiagramNode, parent: DiagramNode): DiagramEdge {
  const style = child.parentConnection;
  return {
    ...style,
    id: parentEdgeId(child.id),
    from: parent.id,
    to: child.id,
    connectorKind: style?.connectorKind ?? "curve",
    autoRoute: style?.autoRoute ?? false,
    stroke: style?.stroke ?? child.stroke ?? "#bdb6da",
    startArrowhead: style?.startArrowhead ?? "none",
    endArrowhead: style?.endArrowhead ?? "triangle",
  };
}
