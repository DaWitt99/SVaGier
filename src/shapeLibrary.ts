import type { ShapeKind } from "./model";

export type ShapeCategory = "Podstawowe" | "Mapy myśli" | "Schematy" | "UML";

export interface ShapeDefinition {
  kind: ShapeKind;
  title: string;
  description: string;
  category: ShapeCategory;
  glyph: string;
  width: number;
  height: number;
  detail?: string;
}

// The library contains 40 ready to use shapes. Freehand paths and images stay
// available through their dedicated tools rather than as library symbols.
export const shapeLibrary: ShapeDefinition[] = [
  { kind: "process", title: "Temat / proces", description: "Węzeł mapy lub czynność", category: "Podstawowe", glyph: "▭", width: 210, height: 96 },
  { kind: "decision", title: "Decyzja", description: "Warunek lub rozgałęzienie", category: "Podstawowe", glyph: "◇", width: 190, height: 110 },
  { kind: "ellipse", title: "Elipsa", description: "Początek, koniec lub idea", category: "Podstawowe", glyph: "◯", width: 190, height: 110 },
  { kind: "class", title: "Klasa UML", description: "Klasa z atrybutami i metodami", category: "UML", glyph: "▤", width: 230, height: 124, detail: "+ atrybuty\n+ metody" },
  { kind: "database", title: "Baza danych", description: "Magazyn danych", category: "Podstawowe", glyph: "▱", width: 190, height: 116 },
  { kind: "document", title: "Dokument", description: "Dokument lub raport", category: "Podstawowe", glyph: "▧", width: 190, height: 116 },
  { kind: "actor", title: "Aktor UML", description: "Użytkownik lub system zewnętrzny", category: "UML", glyph: "♙", width: 130, height: 170 },
  { kind: "text", title: "Pole tekstowe", description: "Tekst bez obramowania", category: "Podstawowe", glyph: "T", width: 240, height: 70 },
  { kind: "line", title: "Linia", description: "Linia rysunkowa", category: "Podstawowe", glyph: "／", width: 180, height: 8 },

  { kind: "cloud", title: "Chmurka", description: "Główna idea lub temat", category: "Mapy myśli", glyph: "☁", width: 220, height: 145 },
  { kind: "pill", title: "Zaokrąglony temat", description: "Miękki węzeł mapy myśli", category: "Mapy myśli", glyph: "⬭", width: 210, height: 90 },
  { kind: "note", title: "Notatka", description: "Węzeł z zawiniętym rogiem", category: "Mapy myśli", glyph: "▱", width: 180, height: 120 },
  { kind: "callout", title: "Dymek", description: "Komentarz z ogonkiem", category: "Mapy myśli", glyph: "◁", width: 220, height: 130 },
  { kind: "hexagon", title: "Sześciokąt", description: "Etap lub kategoria", category: "Mapy myśli", glyph: "⬡", width: 190, height: 116 },
  { kind: "parallelogram", title: "Równoległobok", description: "Wyróżniony węzeł lub dane", category: "Mapy myśli", glyph: "▱", width: 200, height: 100 },

  { kind: "subprocess", title: "Podproces", description: "Proces złożony z etapów", category: "Schematy", glyph: "▥", width: 210, height: 100 },
  { kind: "inputOutput", title: "Wejście / wyjście", description: "Dane wchodzące lub wynik", category: "Schematy", glyph: "▱", width: 200, height: 100 },
  { kind: "manualInput", title: "Wprowadzanie ręczne", description: "Dane wpisywane przez osobę", category: "Schematy", glyph: "⌑", width: 200, height: 100 },
  { kind: "preparation", title: "Przygotowanie", description: "Inicjalizacja lub konfiguracja", category: "Schematy", glyph: "⬡", width: 190, height: 110 },
  { kind: "connector", title: "Łącznik", description: "Punkt kontynuacji schematu", category: "Schematy", glyph: "○", width: 100, height: 100, detail: "" },
  { kind: "offPage", title: "Łącznik poza stronę", description: "Przejście do innej części", category: "Schematy", glyph: "⬟", width: 140, height: 120 },
  { kind: "multiDocument", title: "Wiele dokumentów", description: "Zestaw dokumentów", category: "Schematy", glyph: "▧", width: 200, height: 130 },

  { kind: "useCase", title: "Przypadek użycia", description: "Funkcja widziana przez aktora", category: "UML", glyph: "⬭", width: 220, height: 120, detail: "Opis przypadku użycia" },
  { kind: "interface", title: "Interfejs UML", description: "Kontrakt operacji klasy", category: "UML", glyph: "▤", width: 230, height: 140, detail: "«interface»\n+ operacja()" },
  { kind: "abstractClass", title: "Klasa abstrakcyjna", description: "Klasa bazowa UML", category: "UML", glyph: "▤", width: 230, height: 140, detail: "«abstract»\n+ operacja()" },
  { kind: "package", title: "Pakiet UML", description: "Grupa elementów modelu", category: "UML", glyph: "▱", width: 220, height: 150 },
  { kind: "component", title: "Komponent UML", description: "Moduł systemu", category: "UML", glyph: "▣", width: 200, height: 150, detail: "«component»" },
  { kind: "artifact", title: "Artefakt UML", description: "Plik lub wdrażany zasób", category: "UML", glyph: "▧", width: 200, height: 140, detail: "«artifact»" },
  { kind: "deploymentNode", title: "Węzeł wdrożenia", description: "Urządzenie lub środowisko", category: "UML", glyph: "⬡", width: 240, height: 170, detail: "«device»" },
  { kind: "boundary", title: "Boundary UML", description: "Granica interfejsu systemu", category: "UML", glyph: "Ⓑ", width: 200, height: 130, detail: "«boundary»" },
  { kind: "control", title: "Control UML", description: "Sterowanie logiką przypadku", category: "UML", glyph: "Ⓒ", width: 200, height: 130, detail: "«control»" },
  { kind: "entity", title: "Entity UML", description: "Trwały obiekt dziedziny", category: "UML", glyph: "Ⓔ", width: 200, height: 130, detail: "«entity»" },
  { kind: "initialState", title: "Stan początkowy", description: "Punkt startowy maszyny stanów", category: "UML", glyph: "●", width: 90, height: 90, detail: "" },
  { kind: "finalState", title: "Stan końcowy", description: "Punkt końcowy maszyny stanów", category: "UML", glyph: "⊙", width: 100, height: 100, detail: "" },
  { kind: "state", title: "Stan UML", description: "Stan obiektu lub procesu", category: "UML", glyph: "▭", width: 200, height: 120 },
  { kind: "forkJoin", title: "Fork / Join", description: "Równoległe przejścia stanów", category: "UML", glyph: "━", width: 220, height: 60, detail: "" },
  { kind: "lifeline", title: "Linia życia", description: "Uczestnik diagramu sekwencji", category: "UML", glyph: "┆", width: 160, height: 300, detail: "" },
  { kind: "activation", title: "Aktywacja", description: "Czas wykonywania operacji", category: "UML", glyph: "▯", width: 76, height: 180, detail: "" },
  { kind: "providedInterface", title: "Interfejs dostarczany", description: "Interfejs udostępniany przez komponent", category: "UML", glyph: "○", width: 110, height: 110, detail: "" },
  { kind: "requiredInterface", title: "Interfejs wymagany", description: "Interfejs wykorzystywany przez komponent", category: "UML", glyph: "◖", width: 110, height: 110, detail: "" },
];

export const shapeByKind = new Map<ShapeKind, ShapeDefinition>(shapeLibrary.map((shape): [ShapeKind, ShapeDefinition] => [shape.kind, shape]));

export function shapeDefinition(kind: ShapeKind): ShapeDefinition | undefined {
  return shapeByKind.get(kind);
}
