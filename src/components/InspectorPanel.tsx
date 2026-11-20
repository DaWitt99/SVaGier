import { useEffect, useState } from "react";
import { BookOpen, Link2, PencilLine, Plus, Sparkles, Spline, Tag, Trash2, Type, X } from "lucide-react";
import type { DiagramEdge, DiagramNode, Flashcard, InspectorSection, ShapeKind } from "../model";
import { shapeLibrary } from "../shapeLibrary";

interface InspectorPanelProps {
  section: InspectorSection;
  selectedNode: DiagramNode | null;
  selectedEdge: DiagramEdge | null;
  rotationSnapDegrees: number;
  onUpdateNode: (id: string, updates: Partial<DiagramNode>) => void;
  onChangeNodeKind: (kind: ShapeKind) => void;
  onUpdateEdge: (id: string, updates: Partial<DiagramEdge>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const sectionTitles: Record<InspectorSection, string> = {
  content: "Treść",
  style: "Wygląd",
  size: "Wymiary i obrót",
  details: "Notatki i etykiety",
  link: "Odnośniki",
  flashcards: "Fiszki",
};

function FlashcardsEditor({ node, disabled, onUpdateNode }: { node: DiagramNode; disabled: boolean; onUpdateNode: (id: string, updates: Partial<DiagramNode>) => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const cards = node.flashcards ?? [];

  useEffect(() => {
    setFront("");
    setBack("");
    setEditingId(null);
  }, [node.id]);

  function saveCard() {
    const normalizedFront = front.trim();
    const normalizedBack = back.trim();
    if (!normalizedFront || !normalizedBack) return;
    const next: Flashcard[] = editingId
      ? cards.map((card) => card.id === editingId ? { ...card, front: normalizedFront, back: normalizedBack } : card)
      : [...cards, { id: `flashcard-${crypto.randomUUID()}`, front: normalizedFront, back: normalizedBack }];
    onUpdateNode(node.id, { flashcards: next });
    setFront("");
    setBack("");
    setEditingId(null);
  }

  function editCard(card: Flashcard) {
    setEditingId(card.id);
    setFront(card.front);
    setBack(card.back);
  }

  function removeCard(cardId: string) {
    onUpdateNode(node.id, { flashcards: cards.filter((card) => card.id !== cardId) });
    if (editingId === cardId) {
      setEditingId(null);
      setFront("");
      setBack("");
    }
  }

  return <>
    <div className="flashcard-form">
      <h3>{editingId ? "Edytuj fiszkę" : "Dodaj fiszkę"}</h3>
      <div className="field-group">
        <label htmlFor="flashcard-front">Przód · pytanie</label>
        <textarea id="flashcard-front" rows={3} value={front} disabled={disabled} maxLength={1200} placeholder="Wpisz pytanie lub pojęcie…" onChange={(event) => setFront(event.target.value)} />
      </div>
      <div className="field-group">
        <label htmlFor="flashcard-back">Tył · odpowiedź</label>
        <textarea id="flashcard-back" rows={3} value={back} disabled={disabled} maxLength={2400} placeholder="Wpisz odpowiedź lub wyjaśnienie…" onChange={(event) => setBack(event.target.value)} />
      </div>
      <div className="flashcard-form-actions">
        {editingId && <button type="button" className="flashcard-cancel" onClick={() => { setEditingId(null); setFront(""); setBack(""); }}>Anuluj</button>}
        <button type="button" className="flashcard-save" disabled={disabled || !front.trim() || !back.trim()} onClick={saveCard}>
          <Plus size={14} /> {editingId ? "Zapisz fiszkę" : "Dodaj fiszkę"}
        </button>
      </div>
    </div>
    <div className="flashcard-node-cards">
      <div className="flashcard-node-cards-heading"><h3>Fiszki elementu</h3><span>{cards.length}</span></div>
      {cards.length === 0 ? <p className="flashcard-empty-hint">Dodaj fiszkę, aby powiązać pytanie z tym elementem.</p> : cards.map((card) => (
        <article className="flashcard-node-card" key={card.id}>
          <div className="flashcard-node-card-text">
            <strong>{card.front}</strong>
            <p>{card.back}</p>
          </div>
          <div className="flashcard-node-card-actions">
            <button type="button" aria-label="Edytuj fiszkę" title="Edytuj fiszkę" disabled={disabled} onClick={() => editCard(card)}><PencilLine size={13} /></button>
            <button type="button" aria-label="Usuń fiszkę" title="Usuń fiszkę" disabled={disabled} onClick={() => removeCard(card.id)}><Trash2 size={13} /></button>
          </div>
        </article>
      ))}
    </div>
  </>;
}

export default function InspectorPanel({
  section,
  selectedNode,
  selectedEdge,
  rotationSnapDegrees,
  onUpdateNode,
  onChangeNodeKind,
  onUpdateEdge,
  onDelete,
  onClose,
}: InspectorPanelProps) {
  const node = selectedNode;
  const edge = selectedEdge;
  const disabled = node?.locked ?? false;

  return (
    <aside className="inspector" aria-label={`Właściwości: ${sectionTitles[section]}`}>
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">EDYCJA OBIEKTU</span>
          <h2>{sectionTitles[section]}</h2>
        </div>
        <div className="inspector-heading-actions">
          {(node || edge) && <button className="icon-button" type="button" aria-label={edge ? "Usuń połączenie" : "Usuń element"} title={edge ? "Usuń połączenie" : "Usuń element"} disabled={disabled} onClick={onDelete}><Trash2 size={15} /></button>}
          <button className="icon-button" type="button" aria-label="Zamknij panel właściwości" onClick={onClose}><X size={16} /></button>
        </div>
      </div>

      {node ? (
        <div className="inspector-content">
          {section === "content" && <>
            <div className="field-group">
              <label htmlFor="node-title">{node.kind === "image" ? "Tekst alternatywny" : "Nazwa lub tekst"}</label>
              <input id="node-title" value={node.title} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { title: event.target.value })} />
            </div>
            {node.kind !== "line" && node.kind !== "freehand" && node.kind !== "image" && <div className="field-group">
              <label htmlFor="node-detail">Opis / zawartość</label>
              <textarea id="node-detail" rows={5} value={node.detail} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { detail: event.target.value })} />
            </div>}
            {(node.kind === "class" || node.kind === "interface" || node.kind === "abstractClass") && <p className="inspector-hint">Wpisz atrybuty i metody w osobnych wierszach.</p>}
            {node.kind !== "line" && node.kind !== "freehand" && node.kind !== "image" && node.kind !== "forkJoin" && node.kind !== "activation" && <div className="inspector-typography">
              <h3>Typografia</h3>
              <label className="settings-field">
                <span>Czcionka</span>
                <select value={node.fontFamily ?? "sans"} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { fontFamily: event.target.value as DiagramNode["fontFamily"] })}>
                  <option value="sans">Bezszeryfowa</option><option value="serif">Szeryfowa</option><option value="monospace">Monospace</option>
                </select>
              </label>
              <div className="settings-fields-row inspector-typography-row">
                <label className="field-group"><span>Rozmiar (px)</span><input type="number" min="8" max="96" value={node.fontSize ?? 15} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { fontSize: Math.max(8, Math.min(96, Number(event.target.value) || 8)) })} /></label>
                <label className="field-group"><span>Wyrównanie</span><select value={node.textAlign ?? "center"} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { textAlign: event.target.value as DiagramNode["textAlign"] })}><option value="left">Do lewej</option><option value="center">Do środka</option><option value="right">Do prawej</option></select></label>
              </div>
              <div className="text-format-toggles">
                <label><input type="checkbox" checked={node.fontWeight === "bold"} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { fontWeight: event.target.checked ? "bold" : "normal" })} /> Pogrubienie</label>
                <label><input type="checkbox" checked={node.fontStyle === "italic"} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { fontStyle: event.target.checked ? "italic" : "normal" })} /> Kursywa</label>
              </div>
            </div>}
          </>}

          {section === "style" && <>
            {node.kind !== "image" && node.kind !== "freehand" && <div className="field-group">
              <label htmlFor="node-shape">Kształt · {shapeLibrary.length} dostępnych</label>
              <select id="node-shape" value={node.kind} disabled={disabled} onChange={(event) => onChangeNodeKind(event.target.value as ShapeKind)}>
                {shapeLibrary.map((shape) => <option key={shape.kind} value={shape.kind}>{shape.category} · {shape.title}</option>)}
              </select>
            </div>}
            {node.kind !== "line" && node.kind !== "freehand" && node.kind !== "image" && <>
              <div className="settings-fields-row inspector-color-row">
                <label className="field-group"><span>Wypełnienie</span><input type="color" value={node.fill ?? "#ffffff"} disabled={disabled || node.kind === "text" || node.kind === "initialState" || node.kind === "actor" || node.kind === "requiredInterface"} onChange={(event) => onUpdateNode(node.id, { fill: event.target.value })} /></label>
                <label className="field-group"><span>Kontur</span><input type="color" value={node.stroke ?? "#d8d8e7"} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { stroke: event.target.value })} /></label>
              </div>
              <label className="field-group inspector-color-control"><span>Kolor tekstu</span><input type="color" value={node.textColor ?? "#302f43"} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { textColor: event.target.value })} /></label>
            </>}
            {(node.kind === "freehand" || node.kind === "line") && <div className="settings-fields-row inspector-color-row">
              <label className="field-group"><span>Kolor linii</span><input type="color" value={node.stroke ?? "#5e50b4"} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { stroke: event.target.value })} /></label>
              <label className="field-group"><span>Grubość</span><input type="number" min="1" max="20" value={node.strokeWidth ?? 3} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { strokeWidth: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} /></label>
            </div>}
          </>}

          {section === "size" && <>
            <div className="settings-fields-row inspector-dimensions-row">
              <label className="field-group"><span>Szerokość</span><input type="number" min="8" max="5000" value={Math.round(node.width)} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { width: Math.max(8, Number(event.target.value) || 8) })} /></label>
              <label className="field-group"><span>Wysokość</span><input type="number" min="8" max="5000" value={Math.round(node.height)} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { height: Math.max(8, Number(event.target.value) || 8) })} /></label>
            </div>
            <label className="field-group"><span>Obrót (°)</span><input type="number" step={rotationSnapDegrees} value={Math.round((node.rotation ?? 0) * 100) / 100} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { rotation: Number(event.target.value) || 0 })} /></label>
            <div className="inspector-note"><Sparkles size={15} /><p>Możesz też zmieniać rozmiar uchwytami wokół zaznaczenia.</p></div>
          </>}

          {section === "details" && <>
            <div className="field-group"><label htmlFor="node-labels">Etykiety</label><input id="node-labels" value={node.labels?.join(", ") ?? ""} placeholder="np. Badania, Etap 1" disabled={disabled} onChange={(event) => onUpdateNode(node.id, { labels: [...new Set(event.target.value.split(/[,;\n]/).map((label) => label.trim()).filter(Boolean))] })} /></div>
            <label className="settings-field"><span>Priorytet</span><select value={node.priority ?? ""} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { priority: event.target.value ? event.target.value as DiagramNode["priority"] : undefined })}><option value="">Brak</option><option value="low">Niski</option><option value="medium">Średni</option><option value="high">Wysoki</option></select></label>
            <div className="field-group"><label htmlFor="node-notes">Notatki</label><textarea id="node-notes" rows={4} value={node.notes ?? ""} disabled={disabled} placeholder="Dodatkowe informacje…" onChange={(event) => onUpdateNode(node.id, { notes: event.target.value })} /></div>
            <div className="field-group"><label htmlFor="node-comments">Komentarze</label><textarea id="node-comments" rows={4} value={node.comments ?? ""} disabled={disabled} placeholder="Komentarz do węzła…" onChange={(event) => onUpdateNode(node.id, { comments: event.target.value })} /></div>
          </>}

          {section === "link" && <>
            {node.kind === "image" && <div className="field-group"><label htmlFor="image-source">Adres obrazu</label><input id="image-source" value={node.imageSrc ?? ""} placeholder="https://…" disabled={disabled} onChange={(event) => onUpdateNode(node.id, { imageSrc: event.target.value, imageData: undefined })} /></div>}
            <div className="field-group"><label htmlFor="node-link">Odnośnik</label><input id="node-link" value={node.linkUrl ?? ""} placeholder="https://… lub file:///…" disabled={disabled} onChange={(event) => onUpdateNode(node.id, { linkUrl: event.target.value })} /></div>
            {node.linkUrl && <a className="external-link-open" href={node.linkUrl} target="_blank" rel="noreferrer"><Link2 size={13} /> Otwórz odnośnik</a>}
          </>}

          {section === "flashcards" && <>
            <div className="inspector-note"><BookOpen size={15} /><p>Fiszki są przypisane do tego elementu i pojawiają się w bibliotece do powtórek.</p></div>
            <FlashcardsEditor node={node} disabled={disabled} onUpdateNode={onUpdateNode} />
          </>}

          {disabled && <div className="inspector-note"><Tag size={15} /><p>Element jest zablokowany. Odblokuj go z paska nad zaznaczeniem, aby edytować jego wartości.</p></div>}
        </div>
      ) : edge ? (
        <div className="inspector-content">
          {section === "content" && <div className="field-group"><label htmlFor="edge-label">Etykieta połączenia</label><input id="edge-label" value={edge.label ?? ""} onChange={(event) => onUpdateEdge(edge.id, { label: event.target.value })} placeholder="Opis relacji" /></div>}
          {section === "style" && <>
            <div className="field-group"><label htmlFor="edge-style">Rodzaj łącznika</label><select id="edge-style" value={edge.connectorKind ?? "straight"} onChange={(event) => onUpdateEdge(edge.id, { connectorKind: event.target.value as DiagramEdge["connectorKind"] })}><option value="straight">Prosty</option><option value="elbow">Łamany</option><option value="curve">Krzywy</option></select></div>
            <label className="settings-toggle"><input type="checkbox" checked={edge.autoRoute !== false} onChange={(event) => onUpdateEdge(edge.id, { autoRoute: event.target.checked })} /><span>Omijaj pozostałe kształty</span></label>
            <label className="settings-toggle"><input type="checkbox" checked={edge.arrowStart === true} onChange={(event) => onUpdateEdge(edge.id, { arrowStart: event.target.checked })} /><span>Grot na początku</span></label>
            <label className="settings-toggle"><input type="checkbox" checked={edge.arrowEnd !== false} onChange={(event) => onUpdateEdge(edge.id, { arrowEnd: event.target.checked })} /><span>Grot na końcu</span></label>
            <div className="inspector-note"><Spline size={15} /><p>Połączenie pozostaje przyłączone do kształtów podczas ich przesuwania.</p></div>
          </>}
        </div>
      ) : null}

      <div className="inspector-footer">
        <span className="keyboard-hint"><kbd>Shift+klik</kbd> wiele elementów</span>
        <span className="keyboard-hint"><kbd>Ctrl+Z</kbd> cofanie zmian</span>
      </div>
    </aside>
  );
}
