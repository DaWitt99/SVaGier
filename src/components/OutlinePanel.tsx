import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { DiagramNode, MindMapLayout } from "../model";

interface OutlinePanelProps {
  nodes: DiagramNode[];
  selectedNodeIds: string[];
  layout: MindMapLayout;
  onSelect: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onLayoutChange: (layout: MindMapLayout) => void;
  onReorder: (nodeId: string, targetId: string, after: boolean) => void;
  onMoveAsChild: (nodeId: string, parentId: string) => void;
  onClose: () => void;
}

const layoutOptions: { value: MindMapLayout; label: string; title: string }[] = [
  { value: "manual", label: "Ręcznie", title: "Pozycje ręczne" },
  { value: "tree", label: "Drzewo", title: "Układ drzewiasty" },
  { value: "radial", label: "Promień", title: "Układ promienisty" },
  { value: "horizontal", label: "Poziomo", title: "Układ poziomy" },
];

interface PointerDragSession {
  pointerId: number;
  sourceId: string;
  startX: number;
  startY: number;
  active: boolean;
}

type DropMode = "before" | "child" | "after" | "parent" | "invalid";

export default function OutlinePanel({ nodes, selectedNodeIds, layout, onSelect, onToggleCollapse, onLayoutChange, onReorder, onMoveAsChild, onClose }: OutlinePanelProps) {
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ nodeId: string; mode: DropMode } | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const pointerDragRef = useRef<PointerDragSession | null>(null);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, DiagramNode[]>();
  for (const node of nodes) {
    if (!node.parentId || !nodeIds.has(node.parentId)) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
  const roots = nodes.filter((node) => !node.parentId || !nodeIds.has(node.parentId)).sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
  const visited = new Set<string>();
  const canMoveAsChild = (child: DiagramNode, parent: DiagramNode): boolean => {
    if (child.id === parent.id || child.locked || parent.locked) return false;
    let ancestorId: string | undefined = parent.id;
    const seen = new Set<string>();
    while (ancestorId && !seen.has(ancestorId)) {
      if (ancestorId === child.id) return false;
      seen.add(ancestorId);
      ancestorId = nodeById.get(ancestorId)?.parentId;
    }
    return true;
  };

  const getDropMode = (sourceId: string, target: DiagramNode, clientY: number, top: number, height: number, shiftKey: boolean, ctrlKey: boolean): DropMode => {
    const source = nodeById.get(sourceId);
    if (!source || source.id === target.id) return "invalid";
    if (shiftKey || ctrlKey) {
      const child = shiftKey ? source : target;
      const parent = shiftKey ? target : source;
      if (!canMoveAsChild(child, parent) || child.parentId === parent.id) return "invalid";
      return shiftKey ? "child" : "parent";
    }
    if (!canMoveAsChild(source, target)) return "invalid";
    if (source.parentId !== target.parentId) return "child";
    const offset = clientY - top;
    if (offset <= height * 0.24) return "before";
    if (offset >= height * 0.76) return "after";
    return "child";
  };

  const findDropTarget = (clientX: number, clientY: number): { node: DiagramNode; element: HTMLElement } | null => {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(".outline-row[data-outline-node-id]");
    const node = element?.dataset.outlineNodeId ? nodeById.get(element.dataset.outlineNodeId) : undefined;
    return element && node ? { node, element } : null;
  };

  const beginPointerDrag = (event: ReactPointerEvent<HTMLSpanElement>, node: DiagramNode) => {
    if (node.locked || event.button !== 0 || !treeRef.current) return;
    event.preventDefault();
    pointerDragRef.current = {
      pointerId: event.pointerId,
      sourceId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    treeRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.active && Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 5) return;
    if (!session.active) {
      session.active = true;
      setDraggedNodeId(session.sourceId);
    }
    event.preventDefault();
    const hit = findDropTarget(event.clientX, event.clientY);
    if (!hit) {
      setDropTarget((current) => current === null ? current : null);
      return;
    }
    const bounds = hit.element.getBoundingClientRect();
    const mode = getDropMode(session.sourceId, hit.node, event.clientY, bounds.top, bounds.height, event.shiftKey, event.ctrlKey);
    setDropTarget((current) => current?.nodeId === hit.node.id && current.mode === mode ? current : { nodeId: hit.node.id, mode });
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.active) {
      const hit = findDropTarget(event.clientX, event.clientY);
      if (hit) {
        const bounds = hit.element.getBoundingClientRect();
        const mode = getDropMode(session.sourceId, hit.node, event.clientY, bounds.top, bounds.height, event.shiftKey, event.ctrlKey);
        if (mode === "child") onMoveAsChild(session.sourceId, hit.node.id);
        else if (mode === "parent") {
          onMoveAsChild(hit.node.id, session.sourceId);
          onSelect(session.sourceId);
        }
        else if (mode === "before" || mode === "after") onReorder(session.sourceId, hit.node.id, mode === "after");
      }
    }
    pointerDragRef.current = null;
    setDraggedNodeId(null);
    setDropTarget(null);
  };

  const cancelPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerDragRef.current?.pointerId !== event.pointerId) return;
    pointerDragRef.current = null;
    setDraggedNodeId(null);
    setDropTarget(null);
  };

  const renderNode = (node: DiagramNode, depth: number): ReactNode => {
    if (visited.has(node.id)) return null;
    visited.add(node.id);
    const childNodes = children.get(node.id) ?? [];
    const hasChildren = childNodes.length > 0;
    const selected = selectedNodeIds.includes(node.id);
    const label = node.labels?.[0];
    return (
      <div className="outline-branch" key={node.id}>
        <div
          className={`outline-row${selected ? " is-selected" : ""}${draggedNodeId === node.id ? " is-dragging" : ""}${dropTarget?.nodeId === node.id ? ` is-drop-${dropTarget.mode}` : ""}`}
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={hasChildren ? !node.collapsed : undefined}
          style={{ paddingLeft: 8 + depth * 17 }}
          data-outline-node-id={node.id}
        >
          {hasChildren ? (
            <button className="outline-collapse" type="button" aria-label={node.collapsed ? "Rozwiń gałąź" : "Zwiń gałąź"} onClick={() => onToggleCollapse(node.id)}>
              {node.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : <span className="outline-collapse-spacer" />}
          {!node.locked && <span className="outline-drag-handle" aria-hidden="true" title="Przeciągnij, aby zmienić hierarchię" onPointerDown={(event) => beginPointerDrag(event, node)}><GripVertical size={13} /></span>}
          <button className="outline-node-select" type="button" aria-current={selected ? "true" : undefined} onClick={() => onSelect(node.id)}>
            <span className="outline-priority" data-priority={node.priority ?? "none"} />
            <span className="outline-node-title">{node.title || "Bez nazwy"}</span>
            {dropTarget?.nodeId === node.id && dropTarget.mode === "child" && <span className="outline-drop-hint">jako dziecko</span>}
            {dropTarget?.nodeId === node.id && dropTarget.mode === "parent" && <span className="outline-drop-hint is-parent">jako rodzic</span>}
            {label && <span className="outline-label">{label}</span>}
            {node.notes?.trim() && <span className="outline-note-dot" title="Węzeł ma notatkę" />}
            {node.comments?.trim() && <span className="outline-comment-dot" title="Węzeł ma komentarz" />}
            {node.linkUrl?.trim() && <span className="outline-link-dot" title="Węzeł ma odnośnik" />}
          </button>
        </div>
        {!node.collapsed && childNodes.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const rows = roots.map((root) => renderNode(root, 0));

  return (
    <section className="outline-panel" aria-label="Konspekt mapy myśli">
      <header className="outline-panel-header">
        <div>
          <span className="eyebrow">MAPA MYŚLI</span>
          <h2>Konspekt</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Zamknij konspekt" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="outline-layouts" role="group" aria-label="Automatyczny układ mapy">
        {layoutOptions.map((option) => <button key={option.value} type="button" className={layout === option.value ? "active" : ""} aria-pressed={layout === option.value} title={option.title} onClick={() => onLayoutChange(option.value)}>{option.label}</button>)}
      </div>
      <div
        ref={treeRef}
        className="outline-tree"
        role="tree"
        aria-label="Węzły diagramu"
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={cancelPointerDrag}
        onLostPointerCapture={cancelPointerDrag}
      >{rows}</div>
      <footer className="outline-panel-footer">
        <span><kbd>Tab</kbd> gałąź</span>
        <span><kbd>Enter</kbd> ten sam poziom</span>
        <small>Shift + upuść: źródło jako dziecko · Ctrl + upuść: źródło jako rodzic. Bez klawiszy góra/dół zmienia kolejność, środek ustawia źródło jako dziecko.</small>
      </footer>
    </section>
  );
}
