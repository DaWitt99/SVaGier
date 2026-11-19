export type ShapeKind = "process" | "decision" | "class";

export interface DiagramNode {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  detail: string;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
}

export interface DiagramDocument {
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export const initialDocument: DiagramDocument = {
  title: "Mapa produktu",
  nodes: [
    {
      id: "idea",
      kind: "process",
      x: 550,
      y: 350,
      width: 230,
      height: 104,
      title: "Edytor SVG",
      detail: "mapy · techniczne · UML",
    },
    {
      id: "mindmaps",
      kind: "process",
      x: 180,
      y: 150,
      width: 210,
      height: 96,
      title: "Mapy myśli",
      detail: "swobodne łączenie idei",
    },
    {
      id: "engineering",
      kind: "process",
      x: 925,
      y: 150,
      width: 210,
      height: 96,
      title: "Rysunki techniczne",
      detail: "siatka i precyzyjne wymiary",
    },
    {
      id: "uml",
      kind: "class",
      x: 170,
      y: 600,
      width: 230,
      height: 124,
      title: "Diagram UML",
      detail: "+ atrybuty\n+ metody",
    },
    {
      id: "export",
      kind: "decision",
      x: 930,
      y: 610,
      width: 210,
      height: 108,
      title: "Eksport SVG",
      detail: "edytowalny wektor",
    },
  ],
  edges: [
    { id: "edge-idea-mindmaps", from: "idea", to: "mindmaps" },
    { id: "edge-idea-engineering", from: "idea", to: "engineering" },
    { id: "edge-idea-uml", from: "idea", to: "uml" },
    { id: "edge-idea-export", from: "idea", to: "export" },
  ],
};
