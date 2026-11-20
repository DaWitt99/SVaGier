import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDownToLine,
  Check,
  Hand,
  Pencil,
  ImagePlus,
  Lock,
  Unlock,
  Undo2,
  Redo2,
  Layers,
  Maximize,
  MousePointer2,
  Plus,
  Shapes,
  Spline,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import DiagramCanvas from "./components/DiagramCanvas";
import CanvasSettingsPanel from "./components/CanvasSettingsPanel";
import InspectorPanel from "./components/InspectorPanel";
import OutlinePanel from "./components/OutlinePanel";
import ShapeLibraryPanel from "./components/ShapeLibraryPanel";
import { downloadSvg } from "./exportSvg";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./components/DiagramCanvas";
import { defaultEditorSettings, initialDocument, type Camera, type CurvePoint, type DiagramDocument, type DiagramEdge, type DiagramNode, type EditorSettings, type GuideAxis, type InspectorSection, type MindMapLayout, type ShapeKind } from "./model";
import { getVisibleMindMapNodes, layoutMindMap } from "./mindmapLayout";
import { shapeDefinition } from "./shapeLibrary";

const STORAGE_KEY = "svagier.document.v1";

function loadDocument(): DiagramDocument {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialDocument;
    const parsed = JSON.parse(stored) as Partial<DiagramDocument>;
    if (typeof parsed.title === "string" && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      const editor = { ...defaultEditorSettings, ...(parsed.editor ?? {}) } as EditorSettings;
      const starterIds = new Set(["idea", "mindmaps", "engineering", "uml", "export"]);
      const starterBranches = new Set(parsed.edges
        .filter((edge) => edge.from === "idea" && edge.to !== "idea" && starterIds.has(edge.to))
        .map((edge) => edge.to));
      const starterNodes = parsed.nodes.filter((node) => starterIds.has(node.id));
      const isLegacyStarterMap = starterNodes.length === starterIds.size
        && starterNodes.every((node) => !node.parentId)
        && starterBranches.size === starterIds.size - 1;
      const nodes = isLegacyStarterMap
        ? parsed.nodes.map((node) => node.id === "idea" || !starterIds.has(node.id) ? node : {
            ...node,
            parentId: "idea",
            siblingOrder: ["mindmaps", "engineering", "uml", "export"].indexOf(node.id),
          })
        : parsed.nodes;
      const edges = isLegacyStarterMap ? parsed.edges.filter((edge) => !(edge.from === "idea" && starterBranches.has(edge.to))) : parsed.edges;
      return {
        ...parsed,
        nodes,
        edges,
        editor: {
          ...editor,
          guides: Array.isArray(editor.guides) ? editor.guides : [],
          savedViews: Array.isArray(editor.savedViews) ? editor.savedViews : [],
        },
      } as DiagramDocument;
    }
  } catch {
    return initialDocument;
  }
  return initialDocument;
}

function App() {
  const [document, setDocument] = useState(loadDocument);
  const documentRef = useRef(document);
  const historyRef = useRef<{ past: DiagramDocument[]; future: DiagramDocument[] }>({ past: [], future: [] });
  const historyActionRef = useRef<DiagramDocument | null>(null);
  const [historyStatus, setHistoryStatus] = useState({ undo: 0, redo: 0 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(["idea"]);
  const [activeInspectorSection, setActiveInspectorSection] = useState<InspectorSection | null>(null);
  const [toolMode, setToolMode] = useState<"select" | "pan" | "freehand">("select");
  const [showShapeLibrary, setShowShapeLibrary] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [showCanvasSettings, setShowCanvasSettings] = useState(false);
  const [saved, setSaved] = useState(true);
  const selectedNodes = useMemo(
    () => document.nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [document.nodes, selectedNodeIds],
  );
  const selectedNode = useMemo(
    () => selectedNodes.length === 1 ? selectedNodes[0] : null,
    [selectedNodes],
  );
  const selectedEdge = useMemo(
    () => document.edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [document.edges, selectedEdgeId],
  );
  useEffect(() => {
    if (!selectedNode && !selectedEdge) setActiveInspectorSection(null);
    else if (selectedEdge && activeInspectorSection && activeInspectorSection !== "content" && activeInspectorSection !== "style") setActiveInspectorSection(null);
  }, [selectedNode?.id, selectedEdge?.id]);
  const visibleNodes = useMemo(() => getVisibleMindMapNodes(document.nodes), [document.nodes]);
  const { nodesWithChildren, treeBranchCount } = useMemo(() => {
    const nodeIds = new Set(document.nodes.map((node) => node.id));
    const parents = new Set<string>();
    let count = 0;
    for (const node of document.nodes) if (node.parentId && nodeIds.has(node.parentId)) { parents.add(node.parentId); count++; }
    return { nodesWithChildren: parents, treeBranchCount: count };
  }, [document.nodes]);

  useEffect(() => {
    setSaved(false);
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
      setSaved(true);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [document]);

  function updateHistoryStatus() {
    setHistoryStatus({ undo: historyRef.current.past.length, redo: historyRef.current.future.length });
  }

  function pushHistory(snapshot: DiagramDocument) {
    const past = [...historyRef.current.past, snapshot].slice(-100);
    historyRef.current = { past, future: [] };
    updateHistoryStatus();
  }

  function updateDocument(updater: (current: DiagramDocument) => DiagramDocument, recordHistory = true) {
    const current = documentRef.current;
    const next = updater(current);
    if (next === current) return;
    if (recordHistory && historyActionRef.current === null) pushHistory(current);
    documentRef.current = next;
    setDocument(next);
  }

  function beginHistoryAction() {
    if (historyActionRef.current === null) historyActionRef.current = documentRef.current;
  }

  function endHistoryAction() {
    const before = historyActionRef.current;
    historyActionRef.current = null;
    if (before && before !== documentRef.current) pushHistory(before);
  }

  function undo() {
    const previous = historyRef.current.past.at(-1);
    if (!previous) return;
    const past = historyRef.current.past.slice(0, -1);
    const future = [documentRef.current, ...historyRef.current.future].slice(0, 100);
    historyRef.current = { past, future };
    documentRef.current = previous;
    setDocument(previous);
    setSelectedNodeIds((ids) => ids.filter((id) => previous.nodes.some((node) => node.id === id)));
    updateHistoryStatus();
  }

  function redo() {
    const next = historyRef.current.future[0];
    if (!next) return;
    const future = historyRef.current.future.slice(1);
    const past = [...historyRef.current.past, documentRef.current].slice(-100);
    historyRef.current = { past, future };
    documentRef.current = next;
    setDocument(next);
    setSelectedNodeIds((ids) => ids.filter((id) => next.nodes.some((node) => node.id === id)));
    updateHistoryStatus();
  }

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      const target = event.target as Element | null;
      if (target?.closest("input, textarea, select, button, [contenteditable='true']")) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (!command && !event.altKey && !event.shiftKey && event.key === "Tab" && selectedNode) {
        event.preventDefault();
        addChildNode(selectedNode.id);
      } else if (!command && !event.altKey && !event.shiftKey && event.key === "Enter" && selectedNode) {
        event.preventDefault();
        addSiblingNode(selectedNode.id);
      }
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [selectedNode?.id]);

  function updateNode(id: string, updates: Partial<DiagramNode>) {
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== id) return node;
        const next = { ...node, ...updates };
        if (node.pathPoints && (updates.width !== undefined || updates.height !== undefined)) {
          const scaleX = next.width / node.width;
          const scaleY = next.height / node.height;
          next.pathPoints = node.pathPoints.map((point) => ({
            x: point.x * scaleX,
            y: point.y * scaleY,
            controlIn: point.controlIn ? { x: point.controlIn.x * scaleX, y: point.controlIn.y * scaleY } : undefined,
            controlOut: point.controlOut ? { x: point.controlOut.x * scaleX, y: point.controlOut.y * scaleY } : undefined,
          }));
        }
        return next;
      }),
    }));
  }

  function moveNodes(updates: Partial<DiagramNode>[]) {
    const updateById = new Map(updates.map((node) => [node.id, node]));
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const updatesForNode = updateById.get(node.id);
        if (!updatesForNode) return node;
        const next = { ...node, ...updatesForNode };
        if (node.pathPoints && (updatesForNode.width !== undefined || updatesForNode.height !== undefined)) {
          const scaleX = next.width / node.width;
          const scaleY = next.height / node.height;
          next.pathPoints = node.pathPoints.map((point) => ({
            x: point.x * scaleX,
            y: point.y * scaleY,
            controlIn: point.controlIn ? { x: point.controlIn.x * scaleX, y: point.controlIn.y * scaleY } : undefined,
            controlOut: point.controlOut ? { x: point.controlOut.x * scaleX, y: point.controlOut.y * scaleY } : undefined,
          }));
        }
        return next;
      }),
    }));
  }

  function updateEditorSettings(updates: Partial<EditorSettings>) {
    updateDocument((current) => ({ ...current, editor: { ...current.editor, ...updates } }));
  }

  function addGuide(axis: GuideAxis, position: number): string {
    const id = `guide-${crypto.randomUUID()}`;
    updateDocument((current) => ({
      ...current,
      editor: { ...current.editor, guides: [...current.editor.guides, { id, axis, position }] },
    }));
    return id;
  }

  function moveGuide(id: string, position: number) {
    updateDocument((current) => ({
      ...current,
      editor: {
        ...current.editor,
        guides: current.editor.guides.map((guide) => guide.id === id ? { ...guide, position } : guide),
      },
    }));
  }

  function fitDiagram() {
    if (document.nodes.length === 0) {
      setCamera({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const left = Math.min(...document.nodes.map((node) => node.x));
    const top = Math.min(...document.nodes.map((node) => node.y));
    const right = Math.max(...document.nodes.map((node) => node.x + node.width));
    const bottom = Math.max(...document.nodes.map((node) => node.y + node.height));
    const contentWidth = Math.max(1, right - left);
    const contentHeight = Math.max(1, bottom - top);
    const padding = 110;
    const zoom = Math.max(0.06, Math.min(4, (CANVAS_WIDTH - padding * 2) / contentWidth, (CANVAS_HEIGHT - padding * 2) / contentHeight));
    setCamera({
      x: CANVAS_WIDTH / 2 - (left + contentWidth / 2) * zoom,
      y: CANVAS_HEIGHT / 2 - (top + contentHeight / 2) * zoom,
      zoom,
    });
  }

  function saveView(name: string) {
    const cleanName = name.trim() || `Widok ${document.editor.savedViews.length + 1}`;
    updateDocument((current) => ({
      ...current,
      editor: {
        ...current.editor,
        savedViews: [...current.editor.savedViews, { id: `view-${crypto.randomUUID()}`, name: cleanName, camera }],
      },
    }));
  }

  function removeGuide(id: string) {
    updateDocument((current) => ({
      ...current,
      editor: { ...current.editor, guides: current.editor.guides.filter((guide) => guide.id !== id) },
    }));
  }

  function removeSavedView(id: string) {
    updateDocument((current) => ({
      ...current,
      editor: { ...current.editor, savedViews: current.editor.savedViews.filter((view) => view.id !== id) },
    }));
  }

  function addNode(kind: ShapeKind = "process", title?: string, width?: number, height?: number) {
    const id = `node-${crypto.randomUUID()}`;
    const anchor = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
    const offset = (document.nodes.length % 4) * 22;
    const definition = shapeDefinition(kind);
    const defaultWidth = definition?.width ?? (kind === "freehand" ? 160 : 220);
    const defaultHeight = definition?.height ?? (kind === "freehand" ? 120 : 150);
    const node: DiagramNode = {
      id,
      kind,
      x: anchor ? anchor.x + anchor.width + 60 : (CANVAS_WIDTH / 2 - camera.x) / camera.zoom - (width ?? defaultWidth) / 2,
      y: anchor ? anchor.y + offset : (CANVAS_HEIGHT / 2 - camera.y) / camera.zoom - (height ?? defaultHeight) / 2,
      width: width ?? defaultWidth,
      height: height ?? defaultHeight,
      title: title ?? (kind === "text" ? "Dodaj tekst" : kind === "line" ? "" : "Nowy element"),
      detail: definition?.detail ?? (kind === "text" || kind === "line" ? "" : "Dodaj opis"),
      ...(kind === "text" ? { fontSize: 20, textAlign: "left" as const, textColor: "#302f43" } : {}),
    };
    updateDocument((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeIds([id]);
    setSelectedEdgeId(null);
    setConnectMode(false);
    setConnectSourceId(null);
  }

  function addBranchNode(referenceId: string, relation: "child" | "sibling") {
    const id = `branch-${crypto.randomUUID()}`;
    let created = false;
    updateDocument((current) => {
      const reference = current.nodes.find((node) => node.id === referenceId);
      if (!reference || reference.locked) return current;
      const parentId = relation === "child" ? reference.id : reference.parentId;
      const siblings = current.nodes
        .filter((node) => node.parentId === parentId)
        .sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
      const referenceIndex = relation === "sibling"
        ? current.nodes.filter((node) => node.parentId === parentId).sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0)).findIndex((node) => node.id === reference.id)
        : siblings.length;
      const insertIndex = relation === "child" ? siblings.length : Math.max(0, referenceIndex + 1);
      const newNode: DiagramNode = {
        id,
        kind: "process",
        x: relation === "child" ? reference.x + reference.width + 90 : reference.x,
        y: relation === "child" ? reference.y + insertIndex * 24 : reference.y + reference.height + 54,
        width: 196,
        height: 84,
        title: "Nowa gałąź",
        detail: "",
        parentId,
        siblingOrder: insertIndex,
        fill: reference.fill,
        stroke: reference.stroke,
        textColor: reference.textColor,
      };
      const orderById = new Map<string, number>();
      const orderedSiblings = siblings.slice();
      orderedSiblings.splice(insertIndex, 0, newNode);
      orderedSiblings.forEach((node, index) => orderById.set(node.id, index));
      const nodes = current.nodes.map((node) => {
        if (node.id === reference.id && relation === "child") return { ...node, collapsed: false };
        const order = orderById.get(node.id);
        return order === undefined ? node : { ...node, siblingOrder: order };
      }).concat(newNode);
      created = true;
      return { ...current, nodes: layoutMindMap(nodes, current.editor.mindmapLayout) };
    });
    if (!created) return;
    setSelectedNodeIds([id]);
    setSelectedEdgeId(null);
    setConnectMode(false);
    setConnectSourceId(null);
    setToolMode("select");
  }

  function addChildNode(parentId: string) {
    addBranchNode(parentId, "child");
  }

  function addSiblingNode(nodeId: string) {
    addBranchNode(nodeId, "sibling");
  }

  function addParentNode(nodeId: string) {
    const id = `branch-${crypto.randomUUID()}`;
    let created = false;
    updateDocument((current) => {
      const selected = current.nodes.find((node) => node.id === nodeId);
      if (!selected || selected.locked) return current;
      const siblings = current.nodes
        .filter((node) => node.parentId === selected.parentId)
        .sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
      const selectedIndex = siblings.findIndex((node) => node.id === selected.id);
      if (selectedIndex < 0) return current;
      const newParent: DiagramNode = {
        id,
        kind: "process",
        x: selected.x - 286,
        y: selected.y,
        width: 196,
        height: 84,
        title: "Nowa gałąź",
        detail: "",
        parentId: selected.parentId,
        siblingOrder: selectedIndex,
        fill: selected.fill,
        stroke: selected.stroke,
        textColor: selected.textColor,
      };
      const nodes = current.nodes.map((node) => {
        if (node.id === selected.id) return { ...node, parentId: id, siblingOrder: 0 };
        if (node.parentId === selected.parentId && (node.siblingOrder ?? 0) >= selectedIndex) {
          return { ...node, siblingOrder: (node.siblingOrder ?? 0) + 1 };
        }
        return node;
      }).concat(newParent);
      created = true;
      return { ...current, nodes: layoutMindMap(nodes, current.editor.mindmapLayout) };
    });
    if (!created) return;
    setSelectedNodeIds([id]);
    setSelectedEdgeId(null);
    setConnectMode(false);
    setConnectSourceId(null);
    setToolMode("select");
  }

  function addRootBranchNode() {
    const id = `branch-${crypto.randomUUID()}`;
    updateDocument((current) => {
      const ids = new Set(current.nodes.map((node) => node.id));
      const roots = current.nodes
        .filter((node) => !node.parentId || !ids.has(node.parentId))
        .sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
      const newNode: DiagramNode = {
        id,
        kind: "process",
        x: (CANVAS_WIDTH / 2 - camera.x) / camera.zoom - 98 + (roots.length % 3) * 36,
        y: (CANVAS_HEIGHT / 2 - camera.y) / camera.zoom - 42 + (roots.length % 3) * 36,
        width: 196,
        height: 84,
        title: "Nowa gałąź",
        detail: "",
        siblingOrder: roots.length,
      };
      return { ...current, nodes: layoutMindMap([...current.nodes, newNode], current.editor.mindmapLayout) };
    });
    setSelectedNodeIds([id]);
    setSelectedEdgeId(null);
    setConnectMode(false);
    setConnectSourceId(null);
    setToolMode("select");
  }

  function toggleBranchCollapsed(nodeId: string) {
    const node = documentRef.current.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const descendants = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of documentRef.current.nodes) {
        if (candidate.parentId === nodeId || (candidate.parentId && descendants.has(candidate.parentId))) {
          if (!descendants.has(candidate.id)) { descendants.add(candidate.id); changed = true; }
        }
      }
    }
    updateNode(nodeId, { collapsed: !node.collapsed });
    setSelectedNodeIds((ids) => ids.some((id) => descendants.has(id)) || !ids.includes(nodeId) ? [nodeId] : ids);
    setSelectedEdgeId(null);
  }

  function changeMindMapLayout(layout: MindMapLayout) {
    updateDocument((current) => ({
      ...current,
      nodes: layoutMindMap(current.nodes, layout),
      editor: { ...current.editor, mindmapLayout: layout },
    }));
  }

  function reorderMindMapSibling(nodeId: string, targetId: string, after: boolean) {
    updateDocument((current) => {
      const source = current.nodes.find((node) => node.id === nodeId);
      const target = current.nodes.find((node) => node.id === targetId);
      if (!source || !target || source.parentId !== target.parentId || source.id === target.id) return current;
      const siblings = current.nodes
        .filter((node) => node.parentId === source.parentId)
        .sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
      const reordered = siblings.filter((node) => node.id !== source.id);
      const targetIndex = reordered.findIndex((node) => node.id === target.id);
      if (targetIndex < 0) return current;
      if (source.locked || target.locked) return current;
      reordered.splice(targetIndex + (after ? 1 : 0), 0, source);
      const originalSlots = siblings.map((node) => ({ x: node.x, y: node.y }));
      const orderById = new Map(reordered.map((node, index) => [node.id, { order: index, position: originalSlots[index] }]));
      const nodes = current.nodes.map((node) => {
        const entry = orderById.get(node.id);
        if (!entry) return node;
        return current.editor.mindmapLayout === "manual"
          ? { ...node, siblingOrder: entry.order, ...entry.position }
          : { ...node, siblingOrder: entry.order };
      });
      return { ...current, nodes: layoutMindMap(nodes, current.editor.mindmapLayout) };
    });
  }

  function addImage(data: string, fileName: string) {
    const id = `image-${crypto.randomUUID()}`;
    const node: DiagramNode = {
      id,
      kind: "image",
      x: (CANVAS_WIDTH / 2 - camera.x) / camera.zoom - 120,
      y: (CANVAS_HEIGHT / 2 - camera.y) / camera.zoom - 80,
      width: 240,
      height: 160,
      title: fileName,
      detail: "",
      imageData: data,
      stroke: "#d8d8e7",
    };
    updateDocument((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeIds([id]);
    setSelectedEdgeId(null);
  }

  function handleImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") addImage(reader.result, file.name);
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  function addFreehand(x: number, y: number, width: number, height: number, pathPoints: CurvePoint[]) {
    const node: DiagramNode = {
      id: `path-${crypto.randomUUID()}`,
      kind: "freehand",
      x,
      y,
      width,
      height,
      title: "",
      detail: "",
      pathPoints,
      stroke: "#5e50b4",
      strokeWidth: 3,
    };
    updateDocument((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeIds([node.id]);
    setSelectedEdgeId(null);
    setToolMode("select");
  }

  function editPathPoint(nodeId: string, index: number, handle: "anchor" | "controlIn" | "controlOut", point: { x: number; y: number }) {
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== nodeId || !node.pathPoints || !node.pathPoints[index]) return node;
        const pathPoints = node.pathPoints.map((item) => ({ ...item, controlIn: item.controlIn && { ...item.controlIn }, controlOut: item.controlOut && { ...item.controlOut } }));
        const target = pathPoints[index];
        if (handle === "anchor") {
          const deltaX = point.x - target.x;
          const deltaY = point.y - target.y;
          target.x = point.x;
          target.y = point.y;
          if (target.controlIn) target.controlIn = { x: target.controlIn.x + deltaX, y: target.controlIn.y + deltaY };
          if (target.controlOut) target.controlOut = { x: target.controlOut.x + deltaX, y: target.controlOut.y + deltaY };
        } else target[handle] = point;
        return { ...node, pathPoints };
      }),
    }));
  }

  function createEdge(from: string, to: string) {
    if (from === to) return;
    const existing = documentRef.current.edges.find((edge) => edge.from === from && edge.to === to);
    if (existing) {
      setSelectedNodeIds([]);
      setSelectedEdgeId(existing.id);
      return;
    }
    const edge: DiagramEdge = { id: `edge-${crypto.randomUUID()}`, from, to, connectorKind: "elbow", autoRoute: true, arrowEnd: true };
    updateDocument((current) => ({ ...current, edges: [...current.edges, edge] }));
    setSelectedNodeIds([]);
    setSelectedEdgeId(edge.id);
  }

  function updateEdge(id: string, updates: Partial<DiagramEdge>) {
    updateDocument((current) => ({ ...current, edges: current.edges.map((edge) => edge.id === id ? { ...edge, ...updates } : edge) }));
  }

  function removeSelectedEdge() {
    if (!selectedEdgeId) return;
    updateDocument((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== selectedEdgeId) }));
    setSelectedEdgeId(null);
  }

  function handleConnectNode(id: string) {
    if (!connectSourceId) {
      setConnectSourceId(id);
      setSelectedNodeIds([id]);
      setSelectedEdgeId(null);
      return;
    }
    if (connectSourceId === id) {
      setConnectSourceId(null);
      return;
    }
    createEdge(connectSourceId, id);
    setConnectSourceId(null);
    setConnectMode(false);
  }

  function removeSelectedNode() {
    const removedIds = new Set(selectedNodes.filter((node) => !node.locked).map((node) => node.id));
    if (removedIds.size === 0) return;
    updateDocument((current) => {
      const nodes = current.nodes.filter((node) => !removedIds.has(node.id)).map((node) => {
        if (!node.parentId || !removedIds.has(node.parentId)) return node;
        let parentId: string | undefined = node.parentId;
        const seen = new Set<string>();
        while (parentId && removedIds.has(parentId) && !seen.has(parentId)) {
          seen.add(parentId);
          parentId = current.nodes.find((candidate) => candidate.id === parentId)?.parentId;
        }
        return { ...node, parentId, siblingOrder: undefined };
      });
      return {
        ...current,
        nodes: layoutMindMap(nodes, current.editor.mindmapLayout),
        edges: current.edges.filter((edge) => !removedIds.has(edge.from) && !removedIds.has(edge.to)),
      };
    });
    setSelectedNodeIds((ids) => ids.filter((id) => !removedIds.has(id)));
  }

  function groupSelected() {
    const ids = new Set(selectedNodes.filter((node) => !node.locked).map((node) => node.id));
    if (ids.size < 2) return;
    const groupId = `group-${crypto.randomUUID()}`;
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => ids.has(node.id) ? { ...node, groupId } : node),
    }));
  }

  function ungroupSelected() {
    const groupIds = new Set(selectedNodes.map((node) => node.groupId).filter((id): id is string => Boolean(id)));
    if (groupIds.size === 0) return;
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.groupId && groupIds.has(node.groupId) ? { ...node, groupId: undefined } : node),
    }));
  }

  function alignSelected(alignment: "left" | "centerX" | "right" | "top" | "centerY" | "bottom") {
    const items = selectedNodes.filter((node) => !node.locked);
    if (items.length < 2) return;
    const left = Math.min(...items.map((node) => node.x));
    const top = Math.min(...items.map((node) => node.y));
    const right = Math.max(...items.map((node) => node.x + node.width));
    const bottom = Math.max(...items.map((node) => node.y + node.height));
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const changes = new Map(items.map((node) => [node.id, {
      x: alignment === "left" ? left : alignment === "centerX" ? centerX - node.width / 2 : alignment === "right" ? right - node.width : node.x,
      y: alignment === "top" ? top : alignment === "centerY" ? centerY - node.height / 2 : alignment === "bottom" ? bottom - node.height : node.y,
    }]));
    updateDocument((current) => ({ ...current, nodes: current.nodes.map((node) => changes.has(node.id) ? { ...node, ...changes.get(node.id) } : node) }));
  }

  function distributeSelected(axis: "horizontal" | "vertical") {
    const items = selectedNodes.filter((node) => !node.locked).slice().sort((a, b) => axis === "horizontal" ? a.x - b.x : a.y - b.y);
    if (items.length < 3) return;
    const start = axis === "horizontal" ? items[0].x : items[0].y;
    const last = items[items.length - 1];
    const end = axis === "horizontal" ? last.x + last.width : last.y + last.height;
    const totalSize = items.reduce((total, node) => total + (axis === "horizontal" ? node.width : node.height), 0);
    const gap = (end - start - totalSize) / (items.length - 1);
    let cursor = start;
    const changes = new Map<string, number>();
    for (const node of items) {
      changes.set(node.id, cursor);
      cursor += (axis === "horizontal" ? node.width : node.height) + gap;
    }
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const value = changes.get(node.id);
        if (value === undefined) return node;
        return axis === "horizontal" ? { ...node, x: value } : { ...node, y: value };
      }),
    }));
  }

  function snapSelectedToGrid() {
    const ids = new Set(selectedNodes.filter((node) => !node.locked).map((node) => node.id));
    if (ids.size === 0) return;
    const spacing = document.editor.gridSpacingPx;
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => ids.has(node.id) ? {
        ...node,
        x: Math.round(node.x / spacing) * spacing,
        y: Math.round(node.y / spacing) * spacing,
      } : node),
    }));
  }

  function reorderSelected(direction: "front" | "back") {
    const ids = new Set(selectedNodeIds);
    if (ids.size === 0) return;
    updateDocument((current) => {
      const selected = current.nodes.filter((node) => ids.has(node.id));
      const rest = current.nodes.filter((node) => !ids.has(node.id));
      return { ...current, nodes: direction === "front" ? [...rest, ...selected] : [...selected, ...rest] };
    });
  }

  function toggleLockSelected() {
    const ids = new Set(selectedNodes.map((node) => node.id));
    if (ids.size === 0) return;
    const shouldLock = !selectedNodes.every((node) => node.locked);
    updateDocument((current) => ({ ...current, nodes: current.nodes.map((node) => ids.has(node.id) ? { ...node, locked: shouldLock } : node) }));
  }

  function updateDocumentTitle(title: string) {
    updateDocument((current) => ({ ...current, title }));
  }

  function changeNodeKind(kind: ShapeKind) {
    if (!selectedNode) return;
    const definition = shapeDefinition(kind);
    updateNode(selectedNode.id, {
      kind,
      width: definition?.width ?? selectedNode.width,
      height: definition?.height ?? selectedNode.height,
      detail: definition?.detail ?? selectedNode.detail,
    });
  }

  const movableSelectionCount = selectedNodes.filter((node) => !node.locked).length;
  const groupedSelection = selectedNodes.some((node) => node.groupId);
  const selectionLocked = selectedNodes.length > 0 && selectedNodes.every((node) => node.locked);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="SVaGier — strona główna">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span>SVaGier</span>
        </a>
        <div className="topbar-divider" />
        <div className="document-name">
          <input
            aria-label="Nazwa diagramu"
            value={document.title}
            onChange={(event) => updateDocumentTitle(event.target.value)}
          />
        </div>
        <div className="save-status" aria-live="polite">
          {saved ? <Check size={14} /> : <span className="saving-dot" />}
          <span>{saved ? "Zapisano lokalnie" : "Zapisywanie…"}</span>
        </div>
        <div className="topbar-actions">
          <button className="export-button" type="button" onClick={() => downloadSvg(document)}>
            <ArrowDownToLine size={16} />
            <span>Eksportuj SVG</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="tool-rail" aria-label="Narzędzia">
          <div className="rail-group">
            <button className={`rail-button${toolMode === "select" ? " active" : ""}`} type="button" aria-label="Zaznaczanie" title="Zaznaczanie" onClick={() => setToolMode("select")}>
              <MousePointer2 size={19} />
            </button>
            <button className={`rail-button${toolMode === "pan" ? " active" : ""}`} type="button" aria-label="Przesuwanie płótna" title="Przesuwanie płótna" onClick={() => setToolMode("pan")}>
              <Hand size={18} />
            </button>
            <button className={`rail-button${toolMode === "freehand" ? " active" : ""}`} type="button" aria-label="Rysowanie odręczne" title="Rysowanie krzywych Béziera" onClick={() => { setToolMode("freehand"); setConnectMode(false); }}>
              <Pencil size={18} />
            </button>
            <button className="rail-button" type="button" aria-label="Dodaj kształt" title="Dodaj kształt" onClick={() => addNode()}>
              <Plus size={20} />
            </button>
            <button
              className={`rail-button${connectMode ? " active" : ""}`}
              type="button"
              aria-label="Połącz elementy"
              title="Połącz elementy"
              onClick={() => {
                setConnectMode((current) => !current);
                setConnectSourceId(null);
              }}
            >
              <Spline size={19} />
            </button>
          </div>
        </aside>

        {activeInspectorSection && (selectedNode || selectedEdge) && (
          <InspectorPanel
            section={activeInspectorSection}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            rotationSnapDegrees={document.editor.rotationSnapDegrees}
            onUpdateNode={updateNode}
            onChangeNodeKind={changeNodeKind}
            onUpdateEdge={updateEdge}
            onDelete={() => selectedEdge ? removeSelectedEdge() : removeSelectedNode()}
            onClose={() => setActiveInspectorSection(null)}
          />
        )}

        <main className="editor-area">
          <div className="editor-toolbar">
            <div className="toolbar-context">
              <span className="context-icon"><Shapes size={16} /></span>
              <span>{connectMode ? "Łączenie elementów" : "Edytor diagramów"}</span>
              {connectMode && <span className="mode-hint">{connectSourceId ? "Wybierz drugi element" : "Wybierz pierwszy element"}</span>}
            </div>
            <div className="toolbar-actions">
              <button className={`toolbar-button${showOutline ? " selected" : ""}`} type="button" aria-label="Otwórz konspekt mapy" title="Konspekt i układy mapy myśli" aria-expanded={showOutline} onClick={() => setShowOutline((current) => { if (!current) { setShowShapeLibrary(false); setShowCanvasSettings(false); } return !current; })}>
                <Layers size={16} />
                <span>Konspekt</span>
              </button>
              <button className={`toolbar-button${showShapeLibrary ? " selected" : ""}`} type="button" aria-label="Otwórz bibliotekę kształtów" title="Biblioteka kształtów i symboli" aria-expanded={showShapeLibrary} onClick={() => setShowShapeLibrary((current) => { if (!current) { setShowCanvasSettings(false); setShowOutline(false); } return !current; })}>
                <Shapes size={16} />
                <span>Kształty</span>
              </button>
              <button className="toolbar-button" type="button" aria-label="Dodaj element" title="Dodaj element" onClick={() => addNode()}>
                <Plus size={16} />
                <span>Element</span>
              </button>
              <button className="toolbar-button history-button" type="button" aria-label="Cofnij" title="Cofnij (Ctrl/Cmd+Z)" disabled={!historyStatus.undo} onClick={undo}>
                <Undo2 size={15} />
              </button>
              <button className="toolbar-button history-button" type="button" aria-label="Ponów" title="Ponów (Ctrl/Cmd+Shift+Z)" disabled={!historyStatus.redo} onClick={redo}>
                <Redo2 size={15} />
              </button>
              <button className="toolbar-button" type="button" aria-label="Wstaw obraz" title="Wstaw obraz z pliku" onClick={() => imageInputRef.current?.click()}>
                <ImagePlus size={15} />
                <span>Obraz</span>
              </button>
              <input ref={imageInputRef} className="hidden-file-input" type="file" accept="image/*" onChange={handleImageFile} />
              <button
                className={`toolbar-button${connectMode ? " selected" : ""}`}
                type="button"
                aria-label="Połącz elementy"
                title="Połącz elementy"
                onClick={() => {
                  setConnectMode((current) => !current);
                  setConnectSourceId(null);
                }}
              >
                <Spline size={16} />
                <span>Połączenie</span>
              </button>
              <button className="toolbar-button" type="button" aria-label="Dopasuj cały diagram do widoku" onClick={fitDiagram} title="Dopasuj cały diagram do widoku">
                <Maximize size={15} />
                <span>Dopasuj</span>
              </button>
              <button
                className={`toolbar-button${showCanvasSettings ? " selected" : ""}`}
                type="button"
                aria-label="Ustawienia widoku"
                title="Ustawienia widoku"
                aria-expanded={showCanvasSettings}
                onClick={() => setShowCanvasSettings((current) => { if (!current) { setShowShapeLibrary(false); setShowOutline(false); } return !current; })}
              >
                <SlidersHorizontal size={15} />
                <span>Widok</span>
              </button>
            </div>
          </div>

          {selectedNodeIds.length > 1 && (
            <div className="selection-toolbar" role="toolbar" aria-label="Narzędzia zaznaczania i układania">
              <span className="selection-toolbar-count">{selectedNodeIds.length} zazn.</span>
              <button type="button" disabled={movableSelectionCount < 2} title="Grupuj zaznaczone elementy" onClick={groupSelected}>Grupuj</button>
              <button type="button" disabled={!groupedSelection} title="Rozgrupuj zaznaczone elementy" onClick={ungroupSelected}>Rozgrupuj</button>
              <span className="selection-toolbar-divider" />
              <button type="button" aria-label="Wyrównaj do lewej" disabled={movableSelectionCount < 2} title="Wyrównaj do lewej" onClick={() => alignSelected("left")}>←</button>
              <button type="button" aria-label="Wyrównaj do środka w poziomie" disabled={movableSelectionCount < 2} title="Wyrównaj do środka w poziomie" onClick={() => alignSelected("centerX")}>↔</button>
              <button type="button" aria-label="Wyrównaj do prawej" disabled={movableSelectionCount < 2} title="Wyrównaj do prawej" onClick={() => alignSelected("right")}>→</button>
              <button type="button" aria-label="Wyrównaj do góry" disabled={movableSelectionCount < 2} title="Wyrównaj do góry" onClick={() => alignSelected("top")}>↑</button>
              <button type="button" aria-label="Wyrównaj do środka w pionie" disabled={movableSelectionCount < 2} title="Wyrównaj do środka w pionie" onClick={() => alignSelected("centerY")}>↕</button>
              <button type="button" aria-label="Wyrównaj do dołu" disabled={movableSelectionCount < 2} title="Wyrównaj do dołu" onClick={() => alignSelected("bottom")}>↓</button>
              <button type="button" disabled={movableSelectionCount === 0} title="Przyciągnij zaznaczenie do siatki" onClick={snapSelectedToGrid}>Siatka</button>
              <button type="button" disabled={movableSelectionCount < 3} title="Rozłóż równomiernie w poziomie" onClick={() => distributeSelected("horizontal")}>Rozłóż ↔</button>
              <button type="button" disabled={movableSelectionCount < 3} title="Rozłóż równomiernie w pionie" onClick={() => distributeSelected("vertical")}>Rozłóż ↕</button>
              <span className="selection-toolbar-divider" />
              <button type="button" title="Przenieś na wierzch" onClick={() => reorderSelected("front")}>Na wierzch</button>
              <button type="button" title="Przenieś na spód" onClick={() => reorderSelected("back")}>Na spód</button>
              <button type="button" aria-label={selectionLocked ? "Odblokuj elementy" : "Zablokuj elementy"} title={selectionLocked ? "Odblokuj elementy" : "Zablokuj elementy"} onClick={toggleLockSelected}>{selectionLocked ? <Unlock size={14} /> : <Lock size={14} />}</button>
              <label className="rotation-step-control">
                <span>Kąt</span>
                <select aria-label="Krok przyciągania obrotu" value={document.editor.rotationSnapDegrees} onChange={(event) => updateEditorSettings({ rotationSnapDegrees: Number(event.target.value) })}>
                  {[1, 5, 10, 15, 30, 45, 90].map((degrees) => <option key={degrees} value={degrees}>{degrees}°</option>)}
                </select>
              </label>
              <button type="button" aria-label="Usuń zaznaczone, odblokowane elementy" disabled={movableSelectionCount === 0} title="Usuń zaznaczone, odblokowane elementy" onClick={removeSelectedNode}><Trash2 size={14} /></button>
            </div>
          )}

          <section className="canvas-stage" aria-label="Obszar roboczy">
            <DiagramCanvas
              nodes={visibleNodes}
              allNodes={document.nodes}
              edges={document.edges}
              settings={document.editor}
              camera={camera}
              selectedNodeIds={selectedNodeIds}
              nodesWithChildren={nodesWithChildren}
              toolMode={toolMode}
              connectMode={connectMode}
              connectSourceId={connectSourceId}
              selectedEdgeId={selectedEdgeId}
              activeInspectorSection={activeInspectorSection}
              onOpenInspector={setActiveInspectorSection}
              onAddChildNode={addChildNode}
              onAddSiblingNode={addSiblingNode}
              onAddParentNode={addParentNode}
              onAddRootNode={addRootBranchNode}
              onToggleLockSelected={toggleLockSelected}
              onDeleteSelection={() => selectedEdge ? removeSelectedEdge() : removeSelectedNode()}
              onCameraChange={setCamera}
              onSetSelection={(ids) => { setSelectedNodeIds(ids); if (ids.length === 0) setActiveInspectorSection(null); }}
              onMoveNodes={moveNodes}
              onBeginHistoryAction={beginHistoryAction}
              onEndHistoryAction={endHistoryAction}
              onConnectNode={handleConnectNode}
              onCreateEdge={createEdge}
              onSelectEdge={(id) => { setSelectedEdgeId(id); if (id !== null) setSelectedNodeIds([]); }}
              onToggleCollapse={toggleBranchCollapsed}
              onAddFreehand={addFreehand}
              onEditPathPoint={editPathPoint}
              onClearSelection={() => setSelectedNodeIds([])}
              onAddGuide={addGuide}
              onMoveGuide={moveGuide}
            />
            {showOutline && (
              <OutlinePanel
                nodes={document.nodes}
                selectedNodeIds={selectedNodeIds}
                layout={document.editor.mindmapLayout}
                onSelect={(id) => { setSelectedNodeIds([id]); setSelectedEdgeId(null); }}
                onToggleCollapse={toggleBranchCollapsed}
                onLayoutChange={changeMindMapLayout}
                onReorder={reorderMindMapSibling}
                onClose={() => setShowOutline(false)}
              />
            )}
            {showShapeLibrary && (
              <ShapeLibraryPanel
                onAdd={(kind, title, width, height) => {
                  addNode(kind, title, width, height);
                  setShowShapeLibrary(false);
                  setToolMode("select");
                }}
                onSelectFreehand={() => {
                  setShowShapeLibrary(false);
                  setToolMode("freehand");
                  setConnectMode(false);
                }}
                onClose={() => setShowShapeLibrary(false)}
              />
            )}
            {showCanvasSettings && (
              <CanvasSettingsPanel
                settings={document.editor}
                camera={camera}
                onChange={updateEditorSettings}
                onClose={() => setShowCanvasSettings(false)}
                onFit={fitDiagram}
                onAddGuide={(axis) => addGuide(axis, axis === "vertical" ? (CANVAS_WIDTH / 2 - camera.x) / camera.zoom : (CANVAS_HEIGHT / 2 - camera.y) / camera.zoom)}
                onRemoveGuide={removeGuide}
                onSaveView={saveView}
                onRestoreView={setCamera}
                onRemoveView={removeSavedView}
              />
            )}
            <div className="canvas-status">
              <span>{document.nodes.length} elementów</span>
              <span className="status-dot" />
              <span>{document.edges.length + treeBranchCount} połączeń</span>
            </div>
          </section>
        </main>


      </div>
    </div>
  );
}

export default App;
