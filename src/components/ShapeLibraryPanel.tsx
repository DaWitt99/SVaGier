import { Shapes } from "lucide-react";
import { useState } from "react";
import type { ShapeKind } from "../model";
import { shapeLibrary, type ShapeCategory } from "../shapeLibrary";

interface ShapeLibraryPanelProps {
  onAdd: (kind: ShapeKind, title: string, width: number, height: number) => void;
  onSelectFreehand: () => void;
  onClose: () => void;
}

const categories: ("Wszystkie" | ShapeCategory)[] = ["Wszystkie", "Podstawowe", "Mapy myśli", "Schematy", "UML"];

function ShapePreview({ kind }: { kind: ShapeKind }) {
  const style = { fill: "#f7f5ff", stroke: "#7868dc", strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const rect = (rx = 4) => <rect x="5" y="7" width="34" height="22" rx={rx} style={style} />;
  const ellipse = (rx = 16, ry = 11) => <ellipse cx="22" cy="18" rx={rx} ry={ry} style={style} />;
  if (kind === "decision") return <polygon points="22,4 40,18 22,32 4,18" style={style} />;
  if (["ellipse", "useCase", "connector"].includes(kind)) return ellipse(kind === "connector" ? 10 : 16, kind === "connector" ? 10 : 11);
  if (kind === "cloud") return <path d="M 11 27 C 3 27 3 17 9 15 C 7 7 18 5 22 11 C 29 5 39 10 36 17 C 43 21 37 29 31 27 C 26 32 16 31 14 27 Z" style={style} />;
  if (kind === "pill") return rect(11);
  if (kind === "hexagon" || kind === "preparation") return <polygon points="11,6 33,6 41,18 33,30 11,30 3,18" style={style} />;
  if (["parallelogram", "inputOutput"].includes(kind)) return <polygon points="11,7 41,7 33,29 3,29" style={style} />;
  if (kind === "manualInput") return <polygon points="4,12 40,6 40,29 4,29" style={style} />;
  if (kind === "line") return <line x1="4" y1="18" x2="40" y2="18" stroke="#7868dc" strokeWidth="2.2" />;
  if (kind === "text") return <text x="22" y="25" textAnchor="middle" fill="#7868dc" fontSize="22" fontWeight="700">T</text>;
  if (kind === "note" || kind === "artifact") return <path d="M 5 5 H 29 L 39 15 V 31 H 5 Z M 29 5 V 15 H 39" style={style} />;
  if (kind === "callout") return <path d="M 5 5 H 39 V 25 H 20 L 14 32 L 13 25 H 5 Z" style={style} />;
  if (kind === "subprocess") return <g><rect x="4" y="7" width="36" height="22" rx="3" style={style} /><path d="M 10 7 V 29 M 34 7 V 29" fill="none" stroke="#7868dc" strokeWidth="1.4" /></g>;
  if (kind === "offPage") return <polygon points="4,6 40,6 40,23 22,32 4,23" style={style} />;
  if (kind === "multiDocument") return <g><path d="M 10 5 H 38 V 26 Q 27 33 18 26 H 10 Z" style={style} /><path d="M 6 3 V 23 M 3 1 H 34 V 25" fill="none" stroke="#7868dc" strokeWidth="1.4" /></g>;
  if (kind === "database") return <g><path d="M 5 10 V 25 C 5 32 39 32 39 25 V 10" fill="#f7f5ff" stroke="#7868dc" strokeWidth="1.6" /><ellipse cx="22" cy="10" rx="17" ry="5" fill="#f7f5ff" stroke="#7868dc" strokeWidth="1.6" /><path d="M 5 17 C 5 23 39 23 39 17" fill="none" stroke="#7868dc" strokeWidth="1.3" /></g>;
  if (kind === "document") return <path d="M 5 5 H 39 V 26 Q 29 32 22 27 Q 13 32 5 27 Z" style={style} />;
  if (kind === "actor") return <g fill="none" stroke="#7868dc" strokeWidth="1.8" strokeLinecap="round"><circle cx="22" cy="7" r="4" /><path d="M 22 11 V 23 M 13 16 H 31 M 22 23 L 14 32 M 22 23 L 30 32" /></g>;
  if (kind === "package") return <path d="M 4 11 H 17 L 21 15 H 40 V 31 H 4 Z M 4 15 H 21" style={style} />;
  if (kind === "component") return <g><rect x="10" y="5" width="30" height="26" rx="3" style={style} /><rect x="4" y="11" width="9" height="5" style={style} /><rect x="4" y="20" width="9" height="5" style={style} /></g>;
  if (kind === "deploymentNode") return <path d="M 5 11 L 22 3 L 39 11 L 22 19 Z M 5 11 V 27 L 22 34 V 19 M 39 11 V 27 L 22 34" fill="#f7f5ff" stroke="#7868dc" strokeWidth="1.6" strokeLinejoin="round" />;
  if (kind === "boundary" || kind === "control" || kind === "entity") return <g><rect x="5" y="6" width="34" height="25" rx="4" style={style} /><path d="M 5 14 H 39" fill="none" stroke="#7868dc" strokeWidth="1.3" /><circle cx="11" cy="10" r="3" fill="#fff" stroke="#7868dc" strokeWidth="1.2" /></g>;
  if (kind === "initialState") return <circle cx="22" cy="18" r="9" fill="#504b68" />;
  if (kind === "finalState") return <g><circle cx="22" cy="18" r="12" fill="#fff" stroke="#7868dc" strokeWidth="1.6" /><circle cx="22" cy="18" r="8" fill="#504b68" /></g>;
  if (kind === "state") return rect(7);
  if (kind === "forkJoin") return <rect x="4" y="13" width="36" height="10" rx="3" fill="#504b68" />;
  if (kind === "lifeline") return <g><rect x="7" y="3" width="30" height="10" rx="3" style={style} /><path d="M 22 13 V 33" fill="none" stroke="#7868dc" strokeWidth="1.5" strokeDasharray="3 3" /></g>;
  if (kind === "activation") return <rect x="16" y="3" width="12" height="30" rx="2" style={style} />;
  if (kind === "providedInterface") return <g><path d="M 3 18 H 18" fill="none" stroke="#7868dc" strokeWidth="1.6" /><circle cx="27" cy="18" r="9" fill="#fff" stroke="#7868dc" strokeWidth="1.6" /></g>;
  if (kind === "requiredInterface") return <g><path d="M 3 18 H 19 M 19 9 A 9 9 0 0 0 19 27" fill="none" stroke="#7868dc" strokeWidth="1.6" /></g>;
  if (kind === "class" || kind === "interface" || kind === "abstractClass") return <g><rect x="5" y="3" width="34" height="30" rx="3" style={style} /><path d="M 5 13 H 39 M 5 23 H 39" fill="none" stroke="#7868dc" strokeWidth="1.3" /></g>;
  return rect();
}

export default function ShapeLibraryPanel({ onAdd, onSelectFreehand, onClose }: ShapeLibraryPanelProps) {
  const [category, setCategory] = useState<(typeof categories)[number]>("Wszystkie");
  const items = category === "Wszystkie" ? shapeLibrary : shapeLibrary.filter((item) => item.category === category);

  return (
    <section className="shape-library-panel" aria-label="Biblioteka kształtów i symboli">
      <header>
        <div>
          <span className="eyebrow">BIBLIOTEKA</span>
          <h2>Kształty i symbole</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Zamknij bibliotekę" onClick={onClose}>×</button>
      </header>
      <nav className="shape-library-categories" aria-label="Kategorie kształtów">
        {categories.map((item) => (
          <button key={item} type="button" className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
            {item === "Wszystkie" ? `Wszystkie · ${shapeLibrary.length}` : item}
          </button>
        ))}
      </nav>
      <div className="shape-library-grid">
        {items.map((item) => (
          <button key={item.kind} type="button" className="shape-library-item" onClick={() => onAdd(item.kind, item.title, item.width, item.height)}>
            <span className={`shape-library-glyph glyph-${item.kind}`} title={item.glyph}><ShapePreview kind={item.kind} /></span>
            <span className="shape-library-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
          </button>
        ))}
        <button type="button" className="shape-library-item" onClick={onSelectFreehand}>
          <span className="shape-library-glyph glyph-freehand">∿</span>
          <span className="shape-library-copy"><strong>Rysowanie odręczne</strong><small>Krzywe Béziera, edytowalne punkty</small></span>
        </button>
      </div>
      <footer><Shapes size={14} /><span>Wybierz ikonę nad obiektem, aby otworzyć jego właściwości po lewej.</span></footer>
    </section>
  );
}
