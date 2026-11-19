import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";
import type { DiagramNode, MindMapLayout } from "../model";

interface OutlinePanelProps {
  nodes: DiagramNode[];
  selectedNodeIds: string[];
  layout: MindMapLayout;
  onSelect: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onLayoutChange: (layout: MindMapLayout) => void;
  onReorder: (nodeId: string, targetId: string, after: boolean) => void;
  onClose: () => void;
}

const layoutOptions: { value: MindMapLayout; label: string; title: string }[] = [
  { value: "manual", label: "Ręcznie", title: "Pozycje ręczne" },
  { value: "tree", label: "Drzewo", title: "Układ drzewiasty" },
  { value: "radial", label: "Promień", title: "Układ promienisty" },
  { value: "horizontal", label: "Poziomo", title: "Układ poziomy" },
];

export default function OutlinePanel({ nodes, selectedNodeIds, layout, onSelect, onToggleCollapse, onLayoutChange, onReorder, onClose }: OutlinePanelProps) {
  const nodeIds = new Set(nodes.map((node) => node.id));
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
          className={`outline-row${selected ? " is-selected" : ""}`}
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={hasChildren ? !node.collapsed : undefined}
          style={{ paddingLeft: 8 + depth * 17 }}
          draggable={!node.locked}
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", node.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDrop={(event) => {
            event.preventDefault();
            const draggedId = event.dataTransfer.getData("text/plain");
            if (!draggedId || draggedId === node.id) return;
            const dragged = nodes.find((item) => item.id === draggedId);
            if (!dragged || dragged.locked || node.locked || dragged.parentId !== node.parentId) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            onReorder(draggedId, node.id, event.clientY >= bounds.top + bounds.height / 2);
          }}
        >
          {hasChildren ? (
            <button className="outline-collapse" type="button" aria-label={node.collapsed ? "Rozwiń gałąź" : "Zwiń gałąź"} onClick={() => onToggleCollapse(node.id)}>
              {node.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : <span className="outline-collapse-spacer" />}
          <button className="outline-node-select" type="button" aria-current={selected ? "true" : undefined} onClick={() => onSelect(node.id)}>
            <span className="outline-priority" data-priority={node.priority ?? "none"} />
            <span className="outline-node-title">{node.title || "Bez nazwy"}</span>
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
      <div className="outline-tree" role="tree" aria-label="Węzły diagramu">{rows}</div>
      <footer className="outline-panel-footer">
        <span><kbd>Tab</kbd> gałąź</span>
        <span><kbd>Enter</kbd> ten sam poziom</span>
        <small>Przeciągnij węzeł, by zmienić kolejność.</small>
      </footer>
    </section>
  );
}
