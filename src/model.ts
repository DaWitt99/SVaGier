export type ShapeKind =
  | "process" | "decision" | "class" | "ellipse" | "line" | "text" | "database" | "document" | "actor"
  | "cloud" | "pill" | "note" | "callout" | "hexagon" | "parallelogram"
  | "subprocess" | "inputOutput" | "manualInput" | "preparation" | "connector" | "offPage" | "multiDocument"
  | "useCase" | "interface" | "abstractClass" | "package" | "component" | "artifact" | "deploymentNode"
  | "boundary" | "control" | "entity" | "initialState" | "finalState" | "state" | "forkJoin" | "lifeline"
  | "activation" | "providedInterface" | "requiredInterface" | "freehand" | "image";
export type InspectorSection = "content" | "style" | "size" | "details" | "link" | "flashcards";
export type MindMapLayout = "manual" | "tree" | "radial" | "horizontal";
export type NodePriority = "low" | "medium" | "high";
export type DiagramFontFamily = "sans" | "serif" | "monospace";
export type FreehandToolMode = "pen" | "highlighter" | "line" | "arrow" | "eraser-point" | "eraser-object";

export interface FreehandProfile {
  id: string;
  name: string;
  color: string;
  width: number;
  opacity: number;
  tool: "pen" | "highlighter";
}

export interface CurvePoint {
  x: number;
  y: number;
  controlIn?: { x: number; y: number };
  controlOut?: { x: number; y: number };
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface FlashcardEntry {
  card: Flashcard;
  nodeId: string;
  nodeTitle: string;
  projectId: string;
  projectName: string;
  drawingId: string;
  drawingTitle: string;
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
  parentId?: string;
  parentConnection?: DiagramEdgeStyle;
  siblingOrder?: number;
  collapsed?: boolean;
  labels?: string[];
  priority?: NodePriority;
  notes?: string;
  comments?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  textColor?: string;
  fontFamily?: DiagramFontFamily;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  imageData?: string;
  imageSrc?: string;
  linkUrl?: string;
  flashcards?: Flashcard[];
  pathPoints?: CurvePoint[];
  strokeOpacity?: number;
  lineArrow?: boolean;
  closedPath?: boolean;
}

export type ConnectorKind = "straight" | "elbow" | "curve";
export type ArrowheadKind = "none" | "triangle" | "open" | "diamond" | "circle" | "bar";

export interface DiagramEdgeStyle {
  label?: string;
  stroke?: string;
  connectorKind?: ConnectorKind;
  autoRoute?: boolean;
  startArrowhead?: ArrowheadKind;
  endArrowhead?: ArrowheadKind;
}

export interface DiagramEdge extends DiagramEdgeStyle {
  id: string;
  from: string;
  to: string;
  /** @deprecated Use startArrowhead. Kept to migrate existing local documents. */
  arrowStart?: boolean;
  /** @deprecated Use endArrowhead. Kept to migrate existing local documents. */
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
  snapFreehandToGrid: boolean;
  rotationSnapDegrees: number;
  showRulers: boolean;
  unit: MeasurementUnit;
  showMinimap: boolean;
  guides: Guide[];
  savedViews: SavedView[];
  mindmapLayout: MindMapLayout;
}

export interface DiagramDocument {
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  editor: EditorSettings;
}

export interface ProjectDrawing {
  id: string;
  document: DiagramDocument;
}

export interface DiagramProject {
  id: string;
  name: string;
  drawings: ProjectDrawing[];
  activeDrawingId: string;
}

export interface ProjectWorkspace {
  projects: DiagramProject[];
  activeProjectId: string;
}

export const defaultEditorSettings: EditorSettings = {
  gridStyle: "dots",
  gridSpacingPx: 24,
  snapToGrid: false,
  snapFreehandToGrid: false,
  rotationSnapDegrees: 15,
  showRulers: true,
  unit: "px",
  showMinimap: true,
  guides: [],
  savedViews: [],
  mindmapLayout: "manual",
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
      parentId: "idea",
      siblingOrder: 0,
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
      parentId: "idea",
      siblingOrder: 1,
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
      parentId: "idea",
      siblingOrder: 2,
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
      parentId: "idea",
      siblingOrder: 3,
    },
  ],
  edges: [],
};
