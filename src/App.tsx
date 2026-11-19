import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  MousePointer2,
  Plus,
  Shapes,
  Sparkles,
  Spline,
  Trash2,
} from "lucide-react";
import DiagramCanvas from "./components/DiagramCanvas";
import { downloadSvg } from "./exportSvg";
import { initialDocument, type DiagramDocument, type DiagramNode, type ShapeKind } from "./model";

const STORAGE_KEY = "svagier.document.v1";

function loadDocument(): DiagramDocument {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialDocument;
    const parsed = JSON.parse(stored) as Partial<DiagramDocument>;
    if (typeof parsed.title === "string" && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return parsed as DiagramDocument;
    }
  } catch {
    return initialDocument;
  }
  return initialDocument;
}

function App() {
  const [document, setDocument] = useState(loadDocument);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("idea");
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const selectedNode = useMemo(
    () => document.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [document.nodes, selectedNodeId],
  );

  useEffect(() => {
    setSaved(false);
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
      setSaved(true);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [document]);

  function updateNode(id: string, updates: Partial<DiagramNode>) {
    setDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...updates } : node)),
    }));
  }

  function addNode() {
    const id = `node-${crypto.randomUUID()}`;
    const anchor = document.nodes.find((node) => node.id === selectedNodeId);
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
    setDocument((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeId(id);
    setConnectMode(false);
    setConnectSourceId(null);
  }

  function handleConnectNode(id: string) {
    if (!connectSourceId) {
      setConnectSourceId(id);
      setSelectedNodeId(id);
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
      setDocument((current) => ({
        ...current,
        edges: [...current.edges, { id: `edge-${crypto.randomUUID()}`, from: connectSourceId, to: id }],
      }));
    }
    setSelectedNodeId(id);
    setConnectSourceId(null);
    setConnectMode(false);
  }

  function removeSelectedNode() {
    if (!selectedNodeId) return;
    setDocument((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== selectedNodeId),
      edges: current.edges.filter((edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId),
    }));
    setSelectedNodeId(null);
  }

  function changeNodeKind(kind: ShapeKind) {
    if (!selectedNode) return;
    const height = kind === "class" ? 124 : kind === "decision" ? 108 : 96;
    const width = kind === "class" ? 230 : kind === "decision" ? 210 : 210;
    updateNode(selectedNode.id, { kind, width, height });
  }

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
            onChange={(event) => setDocument((current) => ({ ...current, title: event.target.value }))}
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
            <button className="rail-button active" type="button" aria-label="Zaznaczanie" title="Zaznaczanie">
              <MousePointer2 size={19} />
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
              <button className="toolbar-button" type="button" onClick={addNode}>
                <Plus size={16} />
                <span>Element</span>
              </button>
              <button
                className={`toolbar-button${connectMode ? " selected" : ""}`}
                type="button"
                onClick={() => {
                  setConnectMode((current) => !current);
                  setConnectSourceId(null);
                }}
              >
                <Spline size={16} />
                <span>Połączenie</span>
              </button>
            </div>
          </div>

          <section className="canvas-stage" aria-label="Obszar roboczy">
            <DiagramCanvas
              nodes={document.nodes}
              edges={document.edges}
              selectedNodeId={selectedNodeId}
              connectMode={connectMode}
              connectSourceId={connectSourceId}
              onSelectNode={setSelectedNodeId}
              onMoveNode={(id, x, y) => updateNode(id, { x, y })}
              onConnectNode={handleConnectNode}
              onClearSelection={() => setSelectedNodeId(null)}
            />
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
              <button className="icon-button inspector-close" type="button" aria-label="Usuń element" title="Usuń element" onClick={removeSelectedNode}>
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
                  onChange={(event) => updateNode(selectedNode.id, { title: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="node-detail">Opis</label>
                <textarea
                  id="node-detail"
                  rows={3}
                  value={selectedNode.detail}
                  onChange={(event) => updateNode(selectedNode.id, { detail: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="node-shape">Kształt</label>
                <select id="node-shape" value={selectedNode.kind} onChange={(event) => changeNodeKind(event.target.value as ShapeKind)}>
                  <option value="process">Prostokąt</option>
                  <option value="decision">Decyzja</option>
                  <option value="class">Klasa UML</option>
                </select>
              </div>
              <div className="inspector-note">
                <Sparkles size={15} />
                <p>Przeciągnij element na płótnie, aby zmienić jego położenie.</p>
              </div>
            </div>
          ) : (
            <div className="empty-inspector">
              <div className="empty-inspector-icon"><MousePointer2 size={19} /></div>
              <p>Zaznacz element, aby edytować jego właściwości.</p>
            </div>
          )}
          <div className="inspector-footer">
            <span className="keyboard-hint"><kbd>Scroll</kbd> powiększanie</span>
            <span className="keyboard-hint"><kbd>Przeciągnij</kbd> przesuwanie</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
