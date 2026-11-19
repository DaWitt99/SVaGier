import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  Hand,
  Lock,
  Unlock,
  Undo2,
  Redo2,
  Layers,
  Maximize,
  MousePointer2,
  Plus,
  Shapes,
  Sparkles,
  Spline,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import DiagramCanvas from "./components/DiagramCanvas";
import CanvasSettingsPanel from "./components/CanvasSettingsPanel";
import { downloadSvg } from "./exportSvg";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./components/DiagramCanvas";
import { defaultEditorSettings, initialDocument, type Camera, type DiagramDocument, type DiagramNode, type EditorSettings, type GuideAxis, type ShapeKind } from "./model";

const STORAGE_KEY = "svagier.document.v1";

function loadDocument(): DiagramDocument {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialDocument;
    const parsed = JSON.parse(stored) as Partial<DiagramDocument>;
    if (typeof parsed.title === "string" && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      const editor = { ...defaultEditorSettings, ...(parsed.editor ?? {}) } as EditorSettings;
      return {
        ...parsed,
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
  const [toolMode, setToolMode] = useState<"select" | "pan">("select");
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
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const command = event.metaKey || event.ctrlKey;
      if (!command) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, []);

  function updateNode(id: string, updates: Partial<DiagramNode>) {
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...updates } : node)),
    }));
  }

  function moveNodes(updates: Partial<DiagramNode>[]) {
    const updateById = new Map(updates.map((node) => [node.id, node]));
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const updatesForNode = updateById.get(node.id);
        return updatesForNode ? { ...node, ...updatesForNode } : node;
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

  function addNode() {
    const id = `node-${crypto.randomUUID()}`;
    const anchor = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
    const offset = (document.nodes.length % 4) * 22;
    const node: DiagramNode = {
      id,
      kind: "process",
      x: anchor ? anchor.x + anchor.width + 60 : 590,
      y: anchor ? anchor.y + offset : 390,
      width: 210,
      height: 96,
      title: "Nowy element",
      detail: "Dodaj opis",
    };
    updateDocument((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeIds([id]);
    setConnectMode(false);
    setConnectSourceId(null);
  }

  function handleConnectNode(id: string) {
    if (!connectSourceId) {
      setConnectSourceId(id);
      setSelectedNodeIds([id]);
      return;
    }
    if (connectSourceId === id) {
      setConnectSourceId(null);
      return;
    }
    const alreadyConnected = document.edges.some(
      (edge) => edge.from === connectSourceId && edge.to === id,
    );
    if (!alreadyConnected) {
      updateDocument((current) => ({
        ...current,
        edges: [...current.edges, { id: `edge-${crypto.randomUUID()}`, from: connectSourceId, to: id }],
      }));
    }
    setSelectedNodeIds([id]);
    setConnectSourceId(null);
    setConnectMode(false);
  }

  function removeSelectedNode() {
    const removedIds = new Set(selectedNodes.filter((node) => !node.locked).map((node) => node.id));
    if (removedIds.size === 0) return;
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !removedIds.has(node.id)),
      edges: current.edges.filter((edge) => !removedIds.has(edge.from) && !removedIds.has(edge.to)),
    }));
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
    const height = kind === "class" ? 124 : kind === "decision" ? 108 : 96;
    const width = kind === "class" ? 230 : kind === "decision" ? 210 : 210;
    updateNode(selectedNode.id, { kind, width, height });
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
            <button className="rail-button" type="button" aria-label="Dodaj kształt" title="Dodaj kształt" onClick={addNode}>
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

        <main className="editor-area">
          <div className="editor-toolbar">
            <div className="toolbar-context">
              <span className="context-icon"><Shapes size={16} /></span>
              <span>{connectMode ? "Łączenie elementów" : "Edytor diagramów"}</span>
              {connectMode && <span className="mode-hint">{connectSourceId ? "Wybierz drugi element" : "Wybierz pierwszy element"}</span>}
            </div>
            <div className="toolbar-actions">
              <button className="toolbar-button" type="button" aria-label="Dodaj element" title="Dodaj element" onClick={addNode}>
                <Plus size={16} />
                <span>Element</span>
              </button>
              <button className="toolbar-button history-button" type="button" aria-label="Cofnij" title="Cofnij (Ctrl/Cmd+Z)" disabled={!historyStatus.undo} onClick={undo}>
                <Undo2 size={15} />
              </button>
              <button className="toolbar-button history-button" type="button" aria-label="Ponów" title="Ponów (Ctrl/Cmd+Shift+Z)" disabled={!historyStatus.redo} onClick={redo}>
                <Redo2 size={15} />
              </button>
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
                onClick={() => setShowCanvasSettings((current) => !current)}
              >
                <SlidersHorizontal size={15} />
                <span>Widok</span>
              </button>
            </div>
          </div>

          {selectedNodeIds.length > 0 && (
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
              nodes={document.nodes}
              edges={document.edges}
              settings={document.editor}
              camera={camera}
              selectedNodeIds={selectedNodeIds}
              toolMode={toolMode}
              connectMode={connectMode}
              connectSourceId={connectSourceId}
              onCameraChange={setCamera}
              onSetSelection={setSelectedNodeIds}
              onMoveNodes={moveNodes}
              onBeginHistoryAction={beginHistoryAction}
              onEndHistoryAction={endHistoryAction}
              onConnectNode={handleConnectNode}
              onClearSelection={() => setSelectedNodeIds([])}
              onAddGuide={addGuide}
              onMoveGuide={moveGuide}
            />
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
              <span>{document.edges.length} połączeń</span>
            </div>
          </section>
        </main>

        <aside className="inspector" aria-label="Właściwości elementu">
          <div className="inspector-heading">
            <div>
              <span className="eyebrow">PANEL</span>
              <h2>Właściwości</h2>
            </div>
            {selectedNode && (
              <button className="icon-button inspector-close" type="button" aria-label="Usuń element" title="Usuń element" disabled={selectedNode.locked} onClick={removeSelectedNode}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {selectedNode ? (
            <div className="inspector-content">
              <div className="field-group">
                <label htmlFor="node-title">Tekst</label>
                <input
                  id="node-title"
                  value={selectedNode.title}
                  disabled={selectedNode.locked}
                  onChange={(event) => updateNode(selectedNode.id, { title: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="node-detail">Opis</label>
                <textarea
                  id="node-detail"
                  rows={3}
                  value={selectedNode.detail}
                  disabled={selectedNode.locked}
                  onChange={(event) => updateNode(selectedNode.id, { detail: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="node-shape">Kształt</label>
                <select id="node-shape" value={selectedNode.kind} disabled={selectedNode.locked} onChange={(event) => changeNodeKind(event.target.value as ShapeKind)}>
                  <option value="process">Prostokąt</option>
                  <option value="decision">Decyzja</option>
                  <option value="class">Klasa UML</option>
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="node-rotation">Obrót (°)</label>
                <input
                  id="node-rotation"
                  type="number"
                  step={document.editor.rotationSnapDegrees}
                  value={Math.round((selectedNode.rotation ?? 0) * 100) / 100}
                  disabled={selectedNode.locked}
                  onChange={(event) => updateNode(selectedNode.id, { rotation: Number(event.target.value) || 0 })}
                />
              </div>
              <div className="inspector-note">
                <Sparkles size={15} />
                <p>{selectedNode.locked ? "Element jest zablokowany. Odblokuj go na pasku zaznaczenia, aby go edytować." : "Przeciągnij element, uchwyty zmiany rozmiaru lub uchwyt obrotu. Przytrzymaj Shift, aby zachować proporcje i obracać bez przyciągania."}</p>
              </div>
            </div>
          ) : selectedNodes.length > 1 ? (
            <div className="inspector-content">
              <div className="multi-selection-summary">
                <Layers size={19} />
                <strong>{selectedNodes.length} zaznaczone elementy</strong>
                <span>{selectedNodes.filter((node) => node.locked).length} zablokowanych</span>
              </div>
              <div className="inspector-note">
                <Sparkles size={15} />
                <p>Przeciągnij zaznaczenie, aby przesunąć elementy razem. Użyj paska nad płótnem do wyrównania, rozłożenia i zmiany warstw.</p>
              </div>
            </div>
          ) : (
            <div className="empty-inspector">
              <div className="empty-inspector-icon"><MousePointer2 size={19} /></div>
              <p>Zaznacz element, aby edytować jego właściwości.</p>
            </div>
          )}
          <div className="inspector-footer">
            <span className="keyboard-hint"><kbd>Shift+klik</kbd> wiele elementów</span>
            <span className="keyboard-hint"><kbd>Ctrl+Z</kbd> cofanie zmian</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
