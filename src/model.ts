export type ShapeKind = "process" | "decision" | "class" | "ellipse" | "line" | "text" | "database" | "document" | "actor" | "freehand" | "image";

export interface CurvePoint {
  x: number;
  y: number;
  controlIn?: { x: number; y: number };
  controlOut?: { x: number; y: number };
}

export interface DiagramNode {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  detail: string;
  rotation?: number;
  locked?: boolean;
  groupId?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  textColor?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  imageData?: string;
  imageSrc?: string;
  linkUrl?: string;
  pathPoints?: CurvePoint[];
}

export type ConnectorKind = "straight" | "elbow" | "curve";

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  connectorKind?: ConnectorKind;
  autoRoute?: boolean;
  arrowStart?: boolean;
  arrowEnd?: boolean;
}

export type GridStyle = "dots" | "lines" | "isometric";
export type MeasurementUnit = "px" | "mm" | "cm" | "in";
export type GuideAxis = "vertical" | "horizontal";

export interface Guide {
  id: string;
  axis: GuideAxis;
  position: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface SavedView {
  id: string;
  name: string;
  camera: Camera;
}

export interface EditorSettings {
  gridStyle: GridStyle;
  gridSpacingPx: number;
  snapToGrid: boolean;
  rotationSnapDegrees: number;
  showRulers: boolean;
  unit: MeasurementUnit;
  showMinimap: boolean;
  guides: Guide[];
  savedViews: SavedView[];
}

export interface DiagramDocument {
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  editor: EditorSettings;
}

export const defaultEditorSettings: EditorSettings = {
  gridStyle: "dots",
  gridSpacingPx: 24,
  snapToGrid: false,
  rotationSnapDegrees: 15,
  showRulers: true,
  unit: "px",
  showMinimap: true,
  guides: [],
  savedViews: [],
};

export const initialDocument: DiagramDocument = {
  title: "Mapa produktu",
  editor: defaultEditorSettings,
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
