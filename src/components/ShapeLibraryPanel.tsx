import { Shapes } from "lucide-react";
import type { ShapeKind } from "../model";

interface ShapeLibraryPanelProps {
  onAdd: (kind: ShapeKind, title: string, width: number, height: number) => void;
  onSelectFreehand: () => void;
  onClose: () => void;
}

const items: { kind: ShapeKind; title: string; width: number; height: number; description: string; icon: string }[] = [
  { kind: "process", title: "Prostokąt", width: 210, height: 96, description: "Proces lub pojęcie", icon: "▭" },
  { kind: "decision", title: "Romb", width: 190, height: 110, description: "Decyzja lub warunek", icon: "◇" },
  { kind: "ellipse", title: "Elipsa", width: 190, height: 110, description: "Początek lub zakończenie", icon: "◯" },
  { kind: "class", title: "Klasa UML", width: 230, height: 124, description: "Klasa z sekcją atrybutów", icon: "▤" },
  { kind: "database", title: "Baza danych", width: 190, height: 116, description: "Magazyn danych", icon: "▱" },
  { kind: "document", title: "Dokument", width: 190, height: 116, description: "Dokument lub raport", icon: "▱" },
  { kind: "actor", title: "Aktor UML", width: 130, height: 170, description: "Użytkownik diagramu przypadków", icon: "♙" },
  { kind: "text", title: "Pole tekstowe", width: 240, height: 70, description: "Tekst bez obramowania", icon: "T" },
  { kind: "line", title: "Linia", width: 180, height: 8, description: "Linia rysunkowa", icon: "／" },
];

export default function ShapeLibraryPanel({ onAdd, onSelectFreehand, onClose }: ShapeLibraryPanelProps) {
  return (
    <section className="shape-library-panel" aria-label="Biblioteka kształtów i symboli">
      <header>
        <div>
          <span className="eyebrow">BIBLIOTEKA</span>
          <h2>Kształty i symbole</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Zamknij bibliotekę" onClick={onClose}>×</button>
      </header>
      <div className="shape-library-grid">
        {items.map((item) => (
          <button key={item.kind} type="button" className="shape-library-item" onClick={() => onAdd(item.kind, item.title, item.width, item.height)}>
            <span className={`shape-library-glyph glyph-${item.kind}`}>{item.icon}</span>
            <span className="shape-library-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
          </button>
        ))}
        <button type="button" className="shape-library-item" onClick={onSelectFreehand}>
          <span className="shape-library-glyph glyph-freehand">∿</span>
          <span className="shape-library-copy"><strong>Rysowanie odręczne</strong><small>Krzywe Béziera, edytowalne punkty</small></span>
        </button>
      </div>
      <footer><Shapes size={14} /><span>Wstawiony kształt można edytować w panelu właściwości.</span></footer>
    </section>
  );
}
