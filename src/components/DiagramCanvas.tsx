import { memo, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { CornerDownRight, GitBranch, GitBranchPlus, Link2, Lock, Palette, Ruler, Tags, Trash2, Type, Unlock, Spline, X } from "lucide-react";
import type { Camera, CurvePoint, DiagramEdge, DiagramNode, EditorSettings, Guide, GuideAxis, InspectorSection, MeasurementUnit } from "../model";
import { formatMeasurement } from "../units";
import { shapeDefinition } from "../shapeLibrary";
import { bezierPath, connectorGeometry, nodeBounds, nodeCenter, smoothCurve, type Point } from "../geometry";

interface DiagramCanvasProps {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  settings: EditorSettings;
  camera: Camera;
  selectedNodeIds: string[];
  nodesWithChildren: Set<string>;
  toolMode: "select" | "pan" | "freehand";
  connectMode: boolean;
  connectSourceId: string | null;
  selectedEdgeId: string | null;
  allNodes: DiagramNode[];
  activeInspectorSection: InspectorSection | null;
  onOpenInspector: (section: InspectorSection) => void;
  onAddChildNode: (id: string) => void;
  onAddSiblingNode: (id: string) => void;
  onAddParentNode: (id: string) => void;
  onAddRootNode: () => void;
  onToggleLockSelected: () => void;
  onDeleteSelection: () => void;
  onCameraChange: (camera: Camera) => void;
  onSetSelection: (ids: string[]) => void;
  onMoveNodes: (updates: Partial<DiagramNode>[]) => void;
  onBeginHistoryAction: () => void;
  onEndHistoryAction: () => void;
  onConnectNode: (id: string) => void;
  onCreateEdge: (fromId: string, toId: string) => void;
  onSelectEdge: (id: string | null) => void;
  onToggleCollapse: (id: string) => void;
  onAddFreehand: (x: number, y: number, width: number, height: number, points: CurvePoint[]) => void;
  onEditPathPoint: (nodeId: string, index: number, handle: "anchor" | "controlIn" | "controlOut", point: Point) => void;
  onClearSelection: () => void;
  onAddGuide: (axis: GuideAxis, position: number) => string;
  onMoveGuide: (id: string, position: number) => void;
}

export const CANVAS_WIDTH = 1440;
export const CANVAS_HEIGHT = 900;
const RULER_SIZE = 32;
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 4;

interface CanvasViewport {
  width: number;
  height: number;
  originX: number;
  originY: number;
  scale: number;
}

type DragSession =
  | { type: "pan"; pointerId: number; startX: number; startY: number; cameraX: number; cameraY: number }
  | { type: "nodes"; pointerId: number; start: ScreenPoint; nodes: DiagramNode[] }
  | { type: "guide"; pointerId: number; guideId: string; axis: GuideAxis }
  | { type: "marquee"; pointerId: number; start: ScreenPoint; current: ScreenPoint; additive: boolean; baseSelection: string[] }
  | { type: "resize"; pointerId: number; start: ScreenPoint; handle: string; nodes: DiagramNode[]; bounds: WorldBounds }
  | { type: "rotate"; pointerId: number; nodes: DiagramNode[]; pivot: ScreenPoint; startAngle: number }
  | { type: "connect"; pointerId: number; fromId: string; start: ScreenPoint }
  | { type: "freehand"; pointerId: number; points: ScreenPoint[] }
  | { type: "path-handle"; pointerId: number; nodeId: string; index: number; handle: "anchor" | "controlIn" | "controlOut" };

interface ScreenPoint {
  x: number;
  y: number;
}

interface PinchSession {
  pointerIds: [number, number];
  startDistance: number;
  startZoom: number;
  worldX: number;
  worldY: number;
}

interface WorldBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

function shapeFor(node: DiagramNode) {
  const { x, y, width: w, height: h } = node;
  const right = x + w;
  const bottom = y + h;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const style = shapeStyle(node);
  const polygon = (points: string) => <polygon points={points} className="node-shape" style={style} />;
  const rect = (rx = 14) => <rect x={x} y={y} width={w} height={h} rx={rx} className="node-shape" style={style} />;

  if (node.kind === "decision" || node.kind === "preparation") {
    const inset = node.kind === "decision" ? 0 : w * 0.18;
    return polygon(`${cx},${y} ${right - inset},${cy} ${cx},${bottom} ${x + inset},${cy}`);
  }
  if (node.kind === "ellipse" || node.kind === "useCase" || node.kind === "connector") return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} className="node-shape" style={style} />;
  if (node.kind === "pill") return rect(h / 2);
  if (node.kind === "hexagon") return polygon(`${x + w * 0.22},${y} ${x + w * 0.78},${y} ${right},${cy} ${x + w * 0.78},${bottom} ${x + w * 0.22},${bottom} ${x},${cy}`);
  if (node.kind === "parallelogram" || node.kind === "inputOutput") return polygon(`${x + w * 0.2},${y} ${right},${y} ${right - w * 0.2},${bottom} ${x},${bottom}`);
  if (node.kind === "manualInput") return polygon(`${x},${y + h * 0.2} ${right},${y} ${right},${bottom} ${x},${bottom}`);
  if (node.kind === "line") return <line x1={x} y1={cy} x2={right} y2={cy} className="standalone-line" style={{ stroke: node.stroke ?? "#8071d9", strokeWidth: node.strokeWidth ?? 2 }} />;
  if (node.kind === "text") return null;
  if (node.kind === "freehand") return <path d={bezierPath(node.pathPoints ?? [])} transform={`translate(${x} ${y})`} className="freehand-shape" style={{ stroke: node.stroke ?? "#5e50b4", strokeWidth: node.strokeWidth ?? 3 }} />;
  if (node.kind === "image") return <><rect x={x} y={y} width={w} height={h} rx="6" className="image-frame" /><image x={x} y={y} width={w} height={h} href={node.imageData ?? node.imageSrc ?? ""} preserveAspectRatio="xMidYMid meet" /></>;
  if (node.kind === "cloud") return <path d={`M ${x + w * 0.2} ${y + h * 0.8} C ${x - w * 0.02} ${y + h * 0.78}, ${x - w * 0.02} ${y + h * 0.48}, ${x + w * 0.15} ${y + h * 0.4} C ${x + w * 0.12} ${y + h * 0.08}, ${x + w * 0.44} ${y - h * 0.02}, ${x + w * 0.54} ${y + h * 0.25} C ${x + w * 0.75} ${y + h * 0.08}, ${x + w * 0.98} ${y + h * 0.28}, ${x + w * 0.87} ${y + h * 0.48} C ${x + w * 1.08} ${y + h * 0.62}, ${x + w * 0.94} ${y + h * 0.88}, ${x + w * 0.75} ${y + h * 0.82} C ${x + w * 0.59} ${y + h * 1.05}, ${x + w * 0.36} ${y + h * 0.96}, ${x + w * 0.32} ${y + h * 0.82} Z`} className="node-shape" style={style} />;
  if (node.kind === "note") return <path d={`M ${x} ${y} H ${right - 22} L ${right} ${y + 22} V ${bottom} H ${x} Z M ${right - 22} ${y} V ${y + 22} H ${right}`} className="node-shape uml-fold" style={style} />;
  if (node.kind === "callout") return <path d={`M ${x} ${y} H ${right} V ${bottom - 24} H ${x + w * 0.36} L ${x + w * 0.24} ${bottom} L ${x + w * 0.22} ${bottom - 24} H ${x} Z`} className="node-shape" style={style} />;
  if (node.kind === "subprocess") return <g><rect x={x} y={y} width={w} height={h} rx="5" className="node-shape" style={style} /><path d={`M ${x + 18} ${y} V ${bottom} M ${right - 18} ${y} V ${bottom}`} className="shape-symbol-line" style={{ stroke: node.stroke ?? "#d8d8e7" }} /></g>;
  if (node.kind === "offPage") return polygon(`${x},${y} ${right},${y} ${right},${y + h * 0.68} ${cx},${bottom} ${x},${y + h * 0.68}`);
  if (node.kind === "multiDocument") return <g><path d={`M ${x + 16} ${y + 10} H ${right - 8} V ${bottom - 26} Q ${x + w * 0.65} ${bottom - 7} ${x + w * 0.4} ${bottom - 23} Q ${x + w * 0.18} ${bottom - 8} ${x + 16} ${bottom - 24} Z`} className="node-shape" style={style} /><path d={`M ${x + 8} ${y + 5} H ${right - 16} V ${bottom - 30} M ${x} ${y} H ${right - 24} V ${bottom - 35}`} className="shape-symbol-line" style={{ stroke: node.stroke ?? "#d8d8e7" }} /><path d={`M ${x + w * 0.4} ${bottom - 23} Q ${x + w * 0.6} ${bottom - 6} ${x + w * 0.82} ${bottom - 25}`} className="shape-symbol-line" style={{ stroke: node.stroke ?? "#d8d8e7" }} /></g>;
  if (node.kind === "database") return <g className="node-shape" style={style}><path d={`M ${x} ${y + 18} V ${bottom - 18} C ${x} ${bottom + 2}, ${right} ${bottom + 2}, ${right} ${bottom - 18} V ${y + 18}`} /><ellipse cx={cx} cy={y + 18} rx={w / 2} ry="18" /><path d={`M ${x} ${y + 18} C ${x} ${y + 42}, ${right} ${y + 42}, ${right} ${y + 18}`} className="database-rim" /></g>;
  if (node.kind === "document") return <path d={`M ${x} ${y} H ${right} V ${bottom - 14} Q ${x + w * 0.75} ${bottom + 8} ${cx} ${bottom - 8} Q ${x + w * 0.25} ${bottom - 24} ${x} ${bottom - 10} Z`} className="node-shape" style={style} />;
  if (node.kind === "actor") {
    const legEnd = bottom - 38;
    return <g className="actor-symbol" style={{ stroke: node.stroke ?? "#8c7ce0" }}><circle cx={cx} cy={y + 24} r="14" /><path d={`M ${cx} ${y + 38} V ${y + 72} M ${cx - 26} ${y + 50} H ${cx + 26} M ${cx} ${y + 72} L ${cx - 22} ${legEnd} M ${cx} ${y + 72} L ${cx + 22} ${legEnd}`} /></g>;
  }
  if (node.kind === "package") return <g><path d={`M ${x} ${y + 26} H ${x + 70} L ${x + 85} ${y + 43} H ${right} V ${bottom} H ${x} Z M ${x} ${y + 43} H ${x + 85}`} className="node-shape" style={style} /></g>;
  if (node.kind === "component") return <g><rect x={x + 15} y={y} width={w - 15} height={h} rx="5" className="node-shape" style={style} /><rect x={x} y={y + h * 0.34} width="22" height="18" className="node-shape" style={style} /><rect x={x} y={y + h * 0.54} width="22" height="18" className="node-shape" style={style} /></g>;
  if (node.kind === "artifact") return <path d={`M ${x} ${y} H ${right - 24} L ${right} ${y + 24} V ${bottom} H ${x} Z M ${right - 24} ${y} V ${y + 24} H ${right}`} className="node-shape uml-fold" style={style} />;
  if (node.kind === "deploymentNode") return <g><path d={`M ${x + 25} ${y + 25} L ${cx} ${y} L ${right - 25} ${y + 25} L ${cx} ${y + 50} Z M ${x + 25} ${y + 25} V ${bottom - 25} L ${cx} ${bottom} V ${y + 50} M ${right - 25} ${y + 25} V ${bottom - 25} L ${cx} ${bottom}`} className="node-shape" style={style} /></g>;
  if (node.kind === "boundary" || node.kind === "control" || node.kind === "entity") return <g><rect x={x} y={y} width={w} height={h} rx="9" className="node-shape" style={style} /><path d={`M ${x} ${y + 44} H ${right}`} className="class-divider" /><circle cx={x + 20} cy={y + 21} r="12" className="uml-role-symbol" style={{ stroke: node.stroke ?? "#d8d8e7" }} /><text x={x + 20} y={y + 25} className="uml-role-letter">{node.kind === "boundary" ? "B" : node.kind === "control" ? "C" : "E"}</text></g>;
  if (node.kind === "initialState") return <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.34} className="uml-state-fill" style={{ fill: node.fill ?? "#38364c", stroke: node.stroke ?? "#38364c" }} />;
  if (node.kind === "finalState") return <g><circle cx={cx} cy={cy} r={Math.min(w, h) * 0.38} className="node-shape" style={style} /><circle cx={cx} cy={cy} r={Math.min(w, h) * 0.25} className="uml-state-fill" style={{ fill: node.fill ?? "#38364c", stroke: node.stroke ?? "#38364c" }} /></g>;
  if (node.kind === "state") return rect(15);
  if (node.kind === "forkJoin") return <rect x={x} y={cy - Math.max(5, h * 0.14)} width={w} height={Math.max(10, h * 0.28)} rx="5" className="uml-state-fill" style={{ fill: node.fill ?? node.stroke ?? "#514f66", stroke: node.stroke ?? "#514f66" }} />;
  if (node.kind === "lifeline") return <g><rect x={x} y={y} width={w} height="42" rx="7" className="node-shape" style={style} /><line x1={cx} x2={cx} y1={y + 42} y2={bottom} className="uml-lifeline" style={{ stroke: node.stroke ?? "#b9b7c8" }} /></g>;
  if (node.kind === "activation") return <rect x={cx - Math.min(w * 0.25, 17)} y={y} width={Math.min(w * 0.5, 34)} height={h} rx="3" className="node-shape" style={style} />;
  if (node.kind === "providedInterface") return <g><line x1={x + 15} y1={cy} x2={cx} y2={cy} className="shape-symbol-line" style={{ stroke: node.stroke ?? "#d8d8e7" }} /><circle cx={cx + 16} cy={cy} r={Math.min(w, h) * 0.32} className="node-shape" style={style} /></g>;
  if (node.kind === "requiredInterface") return <g><line x1={x + 15} y1={cy} x2={cx + 12} y2={cy} className="shape-symbol-line" style={{ stroke: node.stroke ?? "#d8d8e7" }} /><path d={`M ${cx + 12} ${cy - h * 0.28} A ${h * 0.28} ${h * 0.28} 0 0 0 ${cx + 12} ${cy + h * 0.28}`} className="shape-symbol-line" style={{ stroke: node.stroke ?? "#d8d8e7" }} /></g>;

  const classLike = ["class", "interface", "abstractClass"].includes(node.kind);
  return <g>
    <rect x={x} y={y} width={w} height={h} rx={classLike ? 8 : 16} className="node-shape" style={style} />
    {(classLike || node.kind === "boundary" || node.kind === "control" || node.kind === "entity") && <path d={`M ${x} ${y + 48} H ${right}`} className="class-divider" />}
  </g>;
}

function shapeStyle(node: DiagramNode) {
  return { fill: node.fill ?? (node.kind === "decision" ? "#fbfaff" : "#fff"), stroke: node.stroke ?? "#d8d8e7", strokeWidth: node.strokeWidth ?? 1.5 };
}

interface DiagramNodeViewProps {
  node: DiagramNode;
  selected: boolean;
  connectSource: boolean;
  showConnectHandles: boolean;
  hasChildren: boolean;
}

const DiagramNodeView = memo(function DiagramNodeView({ node, selected, connectSource, showConnectHandles, hasChildren }: DiagramNodeViewProps) {
  const umlClassifier = node.kind === "class" || node.kind === "interface" || node.kind === "abstractClass" || node.kind === "boundary" || node.kind === "control" || node.kind === "entity";
  const labelBelowSymbol = node.kind === "connector" || node.kind === "initialState" || node.kind === "finalState" || node.kind === "providedInterface" || node.kind === "requiredInterface";
  const titleY = umlClassifier ? node.y + 30 : node.kind === "actor" ? node.y + node.height - 18 : node.kind === "lifeline" ? node.y + 26 : labelBelowSymbol ? node.y + node.height + 17 : node.y + node.height / 2 - 8;
  const detailY = umlClassifier ? node.y + 70 : node.kind === "actor" ? node.y + node.height - 2 : labelBelowSymbol ? node.y + node.height + 34 : node.y + node.height / 2 + 18;
  const detailLines = node.detail.split("\n");
  const textNodeLines = [...node.title.split("\n"), ...(node.detail ? node.detail.split("\n") : [])];
  const textAnchor = node.kind === "boundary" || node.kind === "control" || node.kind === "entity" ? "start" : node.textAlign === "left" ? "start" : node.textAlign === "right" ? "end" : "middle";
  const textX = node.kind === "boundary" || node.kind === "control" || node.kind === "entity" ? node.x + 40 : node.textAlign === "left" ? node.x + 12 : node.textAlign === "right" ? node.x + node.width - 12 : node.x + node.width / 2;
  const fontFamily = node.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : node.fontFamily === "monospace" ? "'SFMono-Regular', Consolas, monospace" : "Inter, ui-sans-serif, system-ui, sans-serif";
  const textStyle = { fill: node.textColor ?? "#302f43", fontFamily, fontSize: node.fontSize ?? 15, fontWeight: node.fontWeight ?? (node.kind === "text" ? "normal" : "650"), fontStyle: node.fontStyle ?? (node.kind === "abstractClass" ? "italic" : "normal"), textAnchor } as const;
  const ports = [
    ["top", node.x + node.width / 2, node.y], ["right", node.x + node.width, node.y + node.height / 2],
    ["bottom", node.x + node.width / 2, node.y + node.height], ["left", node.x, node.y + node.height / 2],
  ] as const;
  return (
    <g
      data-node-id={node.id}
      className={`diagram-node${selected ? " is-selected" : ""}${connectSource ? " is-connect-source" : ""}${node.locked ? " is-locked" : ""}`}
      transform={node.rotation ? `rotate(${node.rotation} ${node.x + node.width / 2} ${node.y + node.height / 2})` : undefined}
      role="button"
      tabIndex={0}
      aria-label={`${node.title}, ${shapeDefinition(node.kind)?.title ?? node.kind}`}
      aria-pressed={selected}
    >
      {shapeFor(node)}
      {node.kind === "text" ? <text x={textX} y={node.y + (node.fontSize ?? 18)} className="text-node-content" style={textStyle}>{textNodeLines.map((line, index) => <tspan key={`${node.id}-text-${index}`} x={textX} dy={index === 0 ? 0 : (node.fontSize ?? 18) * 1.25}>{line}</tspan>)}</text> : node.kind !== "image" && node.kind !== "freehand" && node.kind !== "line" && node.kind !== "forkJoin" && node.kind !== "activation" && node.title && <text x={textX} y={titleY} className={`node-title${node.kind === "abstractClass" ? " is-italic" : ""}`} style={textStyle}>{node.title}</text>}
      {node.kind !== "text" && node.kind !== "image" && node.kind !== "freehand" && node.kind !== "line" && node.kind !== "forkJoin" && node.kind !== "activation" && <text x={textX} y={detailY} className="node-detail" style={{ ...textStyle, fill: node.textColor ?? "#858398", fontSize: node.fontSize ? Math.max(9, node.fontSize - 4) : 11 }}>
        {detailLines.map((line, index) => <tspan key={`${node.id}-detail-${index}`} x={textX} dy={index === 0 ? 0 : 18}>{line}</tspan>)}
      </text>}
      {node.locked && (
        <g className="node-lock-mark" transform={`translate(${node.x + node.width - 20} ${node.y + 8})`} aria-hidden="true">
          <rect x="0" y="7" width="12" height="10" rx="2" />
          <path d="M 3 7 V 5 a3 3 0 0 1 6 0 v2" />
        </g>
      )}
      {node.priority && <circle cx={node.x + node.width - 12} cy={node.y + 12} r="5" className={`node-priority-mark priority-${node.priority}`} aria-label={`Priorytet ${node.priority}`} />}
      {node.labels && node.labels.length > 0 && <text x={node.x + node.width / 2} y={node.y + node.height - 7} className="node-label-line">{node.labels.slice(0, 2).join(" · ")}</text>}
      {hasChildren && <g className="node-collapse-control" data-collapse-node-id={node.id} aria-label={node.collapsed ? "Rozwiń gałąź" : "Zwiń gałąź"}>
        <circle cx={node.x + node.width - 4} cy={node.y - 3} r="10" />
        <path d={node.collapsed ? `M ${node.x + node.width - 7} ${node.y - 3} H ${node.x + node.width - 1} M ${node.x + node.width - 4} ${node.y - 6} V ${node.y}` : `M ${node.x + node.width - 7} ${node.y - 3} H ${node.x + node.width - 1}`} />
      </g>}
      {showConnectHandles && !node.locked && ports.map(([side, x, y]) => <circle key={side} cx={x} cy={y} r="7" className="connection-handle" data-connect-handle={side} />)}
    </g>
  );
});

interface DiagramEdgeViewProps {
  edge: DiagramEdge;
  from: DiagramNode;
  to: DiagramNode;
  nodes: DiagramNode[];
  selected: boolean;
  selectable?: boolean;
  className?: string;
  stroke?: string;
}

const DiagramEdgeView = memo(function DiagramEdgeView({ edge, from, to, nodes, selected, selectable = true, className, stroke }: DiagramEdgeViewProps) {
  const geometry = connectorGeometry(edge, from, to, nodes);
  return <g data-edge-id={selectable ? edge.id : undefined} className={`diagram-connection${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`} pointerEvents={selectable ? undefined : "none"}>
    {selectable && <path d={geometry.d} className="diagram-edge-hit" />}
    <path d={geometry.d} className="diagram-edge" style={stroke ? { stroke } : undefined} markerStart={edge.arrowStart ? "url(#arrowhead)" : undefined} markerEnd={edge.arrowEnd === false ? undefined : "url(#arrowhead)"} />
    {edge.label && <text x={geometry.labelPoint.x} y={geometry.labelPoint.y - 8} className="edge-label">{edge.label}</text>}
  </g>;
});

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function niceWorldStep(zoom: number): number {
  const target = 72 / zoom;
  const power = 10 ** Math.floor(Math.log10(target));
  for (const factor of [1, 2, 5, 10]) {
    const step = factor * power;
    if (step >= target) return step;
  }
  return 10 * power;
}

function GridPattern({ settings, camera }: { settings: EditorSettings; camera: Camera }) {
  const size = Math.max(1, settings.gridSpacingPx);
  const width = settings.gridStyle === "isometric" ? size * 2 : size;
  const height = settings.gridStyle === "isometric" ? size * Math.sqrt(3) : size;
  const transform = `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`;

  if (settings.gridStyle === "dots") {
    return (
      <pattern id="grid-pattern" width={width} height={height} patternUnits="userSpaceOnUse" patternTransform={transform}>
        <circle cx="1.1" cy="1.1" r="1" fill="#dedde9" />
      </pattern>
    );
  }
  if (settings.gridStyle === "lines") {
    return (
      <pattern id="grid-pattern" width={width} height={height} patternUnits="userSpaceOnUse" patternTransform={transform}>
        <path d={`M ${width} 0 H 0 V ${height}`} fill="none" stroke="#e5e4ee" strokeWidth="0.7" />
      </pattern>
    );
  }
  return (
    <pattern id="grid-pattern" width={width} height={height} patternUnits="userSpaceOnUse" patternTransform={transform}>
      <path d={`M 0 ${height / 2} L ${size} 0 L ${width} ${height / 2} L ${size} ${height} Z M ${size} 0 V ${height}`} fill="none" stroke="#e5e4ee" strokeWidth="0.7" />
    </pattern>
  );
}

function Rulers({ camera, unit, viewport }: { camera: Camera; unit: MeasurementUnit; viewport: CanvasViewport }) {
  const step = niceWorldStep(camera.zoom);
  const rulerSize = RULER_SIZE / viewport.scale;
  const verticalStart = (viewport.originX + rulerSize - camera.x) / camera.zoom;
  const horizontalStart = (viewport.originY + rulerSize - camera.y) / camera.zoom;
  const verticalEnd = (viewport.originX + viewport.width - camera.x) / camera.zoom;
  const horizontalEnd = (viewport.originY + viewport.height - camera.y) / camera.zoom;
  const xTicks: { value: number; screen: number }[] = [];
  const yTicks: { value: number; screen: number }[] = [];

  for (let value = Math.ceil(verticalStart / step) * step, count = 0; value <= verticalEnd && count < 300; value += step, count++) {
    xTicks.push({ value, screen: camera.x + value * camera.zoom });
  }
  for (let value = Math.ceil(horizontalStart / step) * step, count = 0; value <= horizontalEnd && count < 300; value += step, count++) {
    yTicks.push({ value, screen: camera.y + value * camera.zoom });
  }

  const localX = (screen: number) => (screen - viewport.originX) * viewport.scale;
  const localY = (screen: number) => (screen - viewport.originY) * viewport.scale;

  return (
    <g transform={`translate(${viewport.originX} ${viewport.originY}) scale(${1 / viewport.scale})`} className="canvas-rulers">
      <rect x={RULER_SIZE} y="0" width={viewport.width * viewport.scale - RULER_SIZE} height={RULER_SIZE} className="ruler-surface" data-ruler-axis="vertical" />
      <rect x="0" y={RULER_SIZE} width={RULER_SIZE} height={viewport.height * viewport.scale - RULER_SIZE} className="ruler-surface" data-ruler-axis="horizontal" />
      <rect x="0" y="0" width={RULER_SIZE} height={RULER_SIZE} className="ruler-corner" />
      {xTicks.map(({ value, screen }) => (
        <g key={`x-${value}`}>
          <line x1={localX(screen)} x2={localX(screen)} y1={RULER_SIZE - 7} y2={RULER_SIZE} className="ruler-tick" />
          <text x={localX(screen) + 4} y="12" className="ruler-label" data-ruler-axis="vertical">{formatMeasurement(value, unit)}</text>
          <rect x={localX(screen) - 6} y="14" width="12" height="12" className="ruler-hit-area" data-ruler-axis="vertical" />
        </g>
      ))}
      {yTicks.map(({ value, screen }) => (
        <g key={`y-${value}`}>
          <line x1={RULER_SIZE - 7} x2={RULER_SIZE} y1={localY(screen)} y2={localY(screen)} className="ruler-tick" />
          <text x="4" y={localY(screen) - 3} className="ruler-label" data-ruler-axis="horizontal">{formatMeasurement(value, unit)}</text>
          <rect x="0" y={localY(screen) - 6} width={RULER_SIZE} height="12" className="ruler-hit-area" data-ruler-axis="horizontal" />
        </g>
      ))}
    </g>
  );
}

function GuideOverlays({ guides, camera, viewport }: { guides: Guide[]; camera: Camera; viewport: CanvasViewport }) {
  return (
    <g className="canvas-guides">
      {guides.map((guide) => {
        const position = guide.position * camera.zoom + (guide.axis === "vertical" ? camera.x : camera.y);
        return (
          <g key={guide.id} data-guide-id={guide.id} className="canvas-guide">
            {guide.axis === "vertical" ? (
              <>
                <line x1={position} x2={position} y1={viewport.originY} y2={viewport.originY + viewport.height} className="guide-hit-area" />
                <line x1={position} x2={position} y1={viewport.originY} y2={viewport.originY + viewport.height} className="guide-line" />
              </>
            ) : (
              <>
                <line x1={viewport.originX} x2={viewport.originX + viewport.width} y1={position} y2={position} className="guide-hit-area" />
                <line x1={viewport.originX} x2={viewport.originX + viewport.width} y1={position} y2={position} className="guide-line" />
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

function nodeWorldBounds(node: DiagramNode): WorldBounds {
  return nodeBounds(node);
}

function boundsForNodes(nodes: DiagramNode[]): WorldBounds | null {
  if (nodes.length === 0) return null;
  const boxes = nodes.map(nodeWorldBounds);
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  return { left, top, width: right - left, height: bottom - top };
}

function SelectionOverlay({ bounds, camera }: { bounds: WorldBounds | null; camera: Camera }) {
  if (!bounds) return null;
  const size = 8 / camera.zoom;
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const rotationY = bounds.top - 25 / camera.zoom;
  const handles = [
    ["nw", bounds.left, bounds.top], ["n", centerX, bounds.top], ["ne", bounds.left + bounds.width, bounds.top],
    ["e", bounds.left + bounds.width, centerY], ["se", bounds.left + bounds.width, bounds.top + bounds.height],
    ["s", centerX, bounds.top + bounds.height], ["sw", bounds.left, bounds.top + bounds.height], ["w", bounds.left, centerY],
  ] as const;

  return (
    <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`} className="selection-transform-overlay">
      <rect x={bounds.left} y={bounds.top} width={bounds.width} height={bounds.height} className="selection-outline" />
      {handles.map(([handle, x, y]) => (
        <rect key={handle} x={x - size / 2} y={y - size / 2} width={size} height={size} className="resize-handle" data-resize-handle={handle} />
      ))}
      <line x1={centerX} y1={bounds.top} x2={centerX} y2={rotationY + size / 2} className="rotation-stem" />
      <circle cx={centerX} cy={rotationY} r={7 / camera.zoom} className="rotation-handle" data-rotate-handle="true" />
    </g>
  );
}

const ROOT_INSERT_ID = "__svagier_root__";

function hierarchyOptions(nodes: DiagramNode[]): { node: DiagramNode; depth: number }[] {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, DiagramNode[]>();
  for (const node of nodes) {
    if (!node.parentId || !ids.has(node.parentId)) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
  const roots = nodes.filter((node) => !node.parentId || !ids.has(node.parentId)).sort((a, b) => (a.siblingOrder ?? 0) - (b.siblingOrder ?? 0));
  const result: { node: DiagramNode; depth: number }[] = [];
  const visited = new Set<string>();
  function visit(node: DiagramNode, depth: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    result.push({ node, depth });
    for (const child of children.get(node.id) ?? []) visit(child, depth + 1);
  }
  for (const root of roots) visit(root, 0);
  for (const node of nodes) if (!visited.has(node.id)) visit(node, 0);
  return result;
}

function ObjectContextToolbar({
  node,
  allNodes,
  edgeSelected,
  activeSection,
  position,
  dockToInspector,
  onOpenInspector,
  onAddChild,
  onAddSibling,
  onAddParent,
  onAddAtParent,
  onAddRoot,
  onToggleLock,
  onDelete,
}: {
  node: DiagramNode | null;
  allNodes: DiagramNode[];
  edgeSelected: boolean;
  activeSection: InspectorSection | null;
  position: { left: number; top: number };
  dockToInspector: boolean;
  onOpenInspector: (section: InspectorSection) => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onAddParent: () => void;
  onAddAtParent: (parentId: string) => void;
  onAddRoot: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  const [hierarchyMenuOpen, setHierarchyMenuOpen] = useState(false);
  const [insertParentId, setInsertParentId] = useState(node?.id ?? ROOT_INSERT_ID);
  const hierarchyRows = hierarchyOptions(allNodes);
  useEffect(() => {
    setHierarchyMenuOpen(false);
    setInsertParentId(node?.id ?? ROOT_INSERT_ID);
  }, [node?.id]);
  if (!node && !edgeSelected) return null;
  const nodeOptions: { section: InspectorSection; label: string; icon: typeof Type }[] = [
    { section: "content", label: "Edytuj treść", icon: Type },
    { section: "style", label: "Zmień wygląd", icon: Palette },
    { section: "size", label: "Wymiary i obrót", icon: Ruler },
    { section: "details", label: "Etykiety i notatki", icon: Tags },
    { section: "link", label: "Odnośniki", icon: Link2 },
  ];
  const edgeOptions: { section: InspectorSection; label: string; icon: typeof Type }[] = [
    { section: "content", label: "Etykieta połączenia", icon: Type },
    { section: "style", label: "Styl połączenia", icon: Spline },
  ];
  const options = edgeSelected ? edgeOptions : nodeOptions;

  const selectedParent = allNodes.find((item) => item.id === insertParentId);
  const insertDisabled = insertParentId !== ROOT_INSERT_ID && (!selectedParent || selectedParent.locked);

  return (
    <div
      className={`object-context-anchor${dockToInspector ? " is-docked" : ""}`}
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="object-context-toolbar" role="toolbar" aria-label="Opcje zaznaczonego obiektu">
        {options.map(({ section, label, icon: Icon }) => (
          <button key={section} type="button" className={activeSection === section ? "active" : ""} aria-label={label} title={label} aria-pressed={activeSection === section} onClick={() => onOpenInspector(section)}>
            <Icon size={15} />
          </button>
        ))}
        {node && <>
          <span className="object-context-divider" />
          <button type="button" aria-label="Dodaj podgałąź" title="Dodaj podgałąź (Tab)" disabled={node.locked} onClick={onAddChild}><GitBranchPlus size={15} /></button>
          <button type="button" aria-label="Dodaj element na tym samym poziomie" title="Dodaj element na tym samym poziomie (Enter)" disabled={node.locked} onClick={onAddSibling}><CornerDownRight size={15} /></button>
          <button type="button" className={hierarchyMenuOpen ? "active" : ""} aria-label="Dodaj element w dowolnym miejscu hierarchii" title="Dodaj element w dowolnym miejscu hierarchii" aria-expanded={hierarchyMenuOpen} onClick={() => { setInsertParentId(node.id); setHierarchyMenuOpen((open) => !open); }}><GitBranch size={15} /></button>
          <button type="button" aria-label={node.locked ? "Odblokuj element" : "Zablokuj element"} title={node.locked ? "Odblokuj element" : "Zablokuj element"} onClick={onToggleLock}>{node.locked ? <Unlock size={15} /> : <Lock size={15} />}</button>
        </>}
        <button type="button" className="context-delete-button" aria-label="Usuń zaznaczony obiekt" title="Usuń zaznaczony obiekt" disabled={Boolean(node?.locked)} onClick={onDelete}><Trash2 size={15} /></button>
      </div>
      {hierarchyMenuOpen && node && <div className="hierarchy-insert-popover" role="dialog" aria-label="Dodaj element w hierarchii">
        <div className="hierarchy-insert-heading">
          <strong>Dodaj element w hierarchii</strong>
          <button type="button" aria-label="Zamknij" title="Zamknij" onClick={() => setHierarchyMenuOpen(false)}><X size={15} /></button>
        </div>
        <label className="hierarchy-insert-label" htmlFor="hierarchy-insert-parent">Rodzic nowego elementu</label>
        <select id="hierarchy-insert-parent" value={insertParentId} onChange={(event) => setInsertParentId(event.target.value)}>
          <option value={ROOT_INSERT_ID}>Poziom główny</option>
          {hierarchyRows.map(({ node: option, depth }) => <option key={option.id} value={option.id} disabled={option.locked}>
            {`${"　".repeat(Math.min(depth, 8))}${depth ? "└ " : ""}${option.title || "Bez nazwy"}`}
          </option>)}
        </select>
        <button className="hierarchy-insert-action" type="button" disabled={insertDisabled} onClick={() => { if (insertParentId === ROOT_INSERT_ID) onAddRoot(); else onAddAtParent(insertParentId); setHierarchyMenuOpen(false); }}>
          Dodaj na wybranym poziomie
        </button>
        <div className="hierarchy-insert-divider" />
        <button className="hierarchy-insert-parent-action" type="button" disabled={node.locked} onClick={() => { onAddParent(); setHierarchyMenuOpen(false); }}>
          Utwórz rodzica zaznaczonego elementu
        </button>
      </div>}
    </div>
  );
}

function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
}

function worldPathPoint(node: DiagramNode, point: Point): Point {
  return rotatePoint({ x: node.x + point.x, y: node.y + point.y }, nodeCenter(node), node.rotation ?? 0);
}

function PathHandlesOverlay({ nodes, selectedNodeIds, camera }: { nodes: DiagramNode[]; selectedNodeIds: string[]; camera: Camera }) {
  const size = 7 / camera.zoom;
  const selected = nodes.filter((node) => selectedNodeIds.includes(node.id) && node.kind === "freehand" && !node.locked && node.pathPoints);
  if (selected.length === 0) return null;
  return <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`} className="path-handles-overlay">
    {selected.flatMap((node) => (node.pathPoints ?? []).map((point, index) => {
      const anchor = worldPathPoint(node, point);
      const controls = [
        ["controlIn", point.controlIn], ["controlOut", point.controlOut],
      ] as const;
      return <g key={`${node.id}-${index}`}>
        {controls.map(([handle, control]) => {
          if (!control) return null;
          const world = worldPathPoint(node, control);
          return <g key={handle}><line x1={anchor.x} y1={anchor.y} x2={world.x} y2={world.y} className="bezier-control-line" /><circle cx={world.x} cy={world.y} r={size / 2} className="bezier-control-handle" data-path-handle="true" data-path-node-id={node.id} data-path-index={index} data-path-kind={handle} /></g>;
        })}
        <circle cx={anchor.x} cy={anchor.y} r={size / 2} className="bezier-anchor-handle" data-path-handle="true" data-path-node-id={node.id} data-path-index={index} data-path-kind="anchor" />
      </g>;
    }))}
  </g>;
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getMinimapBounds(nodes: DiagramNode[], camera: Camera, viewport: CanvasViewport): WorldBounds {
  const viewLeft = (viewport.originX - camera.x) / camera.zoom;
  const viewTop = (viewport.originY - camera.y) / camera.zoom;
  const viewRight = viewLeft + viewport.width / camera.zoom;
  const viewBottom = viewTop + viewport.height / camera.zoom;
  const left = Math.min(viewLeft, ...nodes.map((node) => node.x));
  const top = Math.min(viewTop, ...nodes.map((node) => node.y));
  const right = Math.max(viewRight, ...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(viewBottom, ...nodes.map((node) => node.y + node.height));
  const marginX = Math.max(60, (right - left) * 0.06);
  const marginY = Math.max(60, (bottom - top) * 0.06);
  return { left: left - marginX, top: top - marginY, width: right - left + marginX * 2, height: bottom - top + marginY * 2 };
}

function MiniMap({ nodes, edges, camera, viewport, onCameraChange }: {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  camera: Camera;
  viewport: CanvasViewport;
  onCameraChange: (camera: Camera) => void;
}) {
  const [dragBounds, setDragBounds] = useState<WorldBounds | null>(null);
  const bounds = dragBounds ?? getMinimapBounds(nodes, camera, viewport);
  const width = 190;
  const height = 126;
  const pad = 8;
  const scale = Math.min((width - pad * 2) / bounds.width, (height - pad * 2) / bounds.height);
  const worldToMini = (x: number, y: number) => ({ x: pad + (x - bounds.left) * scale, y: pad + (y - bounds.top) * scale });
  const viewLeft = (viewport.originX - camera.x) / camera.zoom;
  const viewTop = (viewport.originY - camera.y) / camera.zoom;
  const viewWidth = viewport.width / camera.zoom;
  const viewHeight = viewport.height / camera.zoom;
  const miniView = worldToMini(viewLeft, viewTop);
  const mapNode = new Map(nodes.map((node) => [node.id, node]));

  function centerCamera(event: ReactPointerEvent<SVGSVGElement>, mapBounds: WorldBounds) {
    const rect = event.currentTarget.getBoundingClientRect();
    const miniX = ((event.clientX - rect.left) / rect.width) * width;
    const miniY = ((event.clientY - rect.top) / rect.height) * height;
    const mapScale = Math.min((width - pad * 2) / mapBounds.width, (height - pad * 2) / mapBounds.height);
    const worldX = mapBounds.left + (miniX - pad) / mapScale;
    const worldY = mapBounds.top + (miniY - pad) / mapScale;
    onCameraChange({ x: viewport.originX + viewport.width / 2 - worldX * camera.zoom, y: viewport.originY + viewport.height / 2 - worldY * camera.zoom, zoom: camera.zoom });
  }

  return (
    <div className="minimap-wrap">
      <svg
        className="canvas-minimap"
        viewBox={`0 0 ${width} ${height}`}
        role="application"
        aria-label="Miniatura płótna — kliknij lub przeciągnij, aby zmienić widok"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragBounds(bounds);
          centerCamera(event, bounds);
        }}
        onPointerMove={(event) => {
          if (dragBounds && event.currentTarget.hasPointerCapture(event.pointerId)) centerCamera(event, dragBounds);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          setDragBounds(null);
        }}
        onPointerCancel={() => setDragBounds(null)}
      >
        <rect x="0" y="0" width={width} height={height} rx="8" className="minimap-background" />
        {edges.map((edge) => {
          const from = mapNode.get(edge.from);
          const to = mapNode.get(edge.to);
          if (!from || !to) return null;
          const a = worldToMini(from.x + from.width / 2, from.y + from.height / 2);
          const b = worldToMini(to.x + to.width / 2, to.y + to.height / 2);
          return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="minimap-edge" />;
        })}
        {nodes.map((node) => {
          const parent = node.parentId ? mapNode.get(node.parentId) : null;
          if (!parent) return null;
          const a = worldToMini(parent.x + parent.width / 2, parent.y + parent.height / 2);
          const b = worldToMini(node.x + node.width / 2, node.y + node.height / 2);
          return <line key={`tree-${node.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="minimap-edge" />;
        })}
        {nodes.map((node) => {
          const point = worldToMini(node.x, node.y);
          return <rect key={node.id} x={point.x} y={point.y} width={Math.max(2, node.width * scale)} height={Math.max(2, node.height * scale)} rx="1.5" className="minimap-node" />;
        })}
        <rect
          x={miniView.x}
          y={miniView.y}
          width={viewWidth * scale}
          height={viewHeight * scale}
          className="minimap-viewport"
        />
      </svg>
      <span className="minimap-label">Miniatura</span>
    </div>
  );
}

export default function DiagramCanvas({
  nodes,
  edges,
  settings,
  camera,
  selectedNodeIds,
  nodesWithChildren,
  toolMode,
  connectMode,
  connectSourceId,
  selectedEdgeId,
  allNodes,
  activeInspectorSection,
  onOpenInspector,
  onAddChildNode,
  onAddSiblingNode,
  onAddParentNode,
  onAddRootNode,
  onToggleLockSelected,
  onDeleteSelection,
  onCameraChange,
  onSetSelection,
  onMoveNodes,
  onBeginHistoryAction,
  onEndHistoryAction,
  onConnectNode,
  onCreateEdge,
  onSelectEdge,
  onToggleCollapse,
  onAddFreehand,
  onEditPathPoint,
  onClearSelection,
  onAddGuide,
  onMoveGuide,
}: DiagramCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState<CanvasViewport>({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, originX: 0, originY: 0, scale: 1 });
  const dragRef = useRef<DragSession | null>(null);
  const pointerPointsRef = useRef(new Map<number, ScreenPoint>());
  const pinchRef = useRef<PinchSession | null>(null);
  const [marquee, setMarquee] = useState<{ start: ScreenPoint; current: ScreenPoint } | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<{ start: Point; end: Point } | null>(null);
  const [freehandPreview, setFreehandPreview] = useState<CurvePoint[]>([]);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const selectedNodes = nodes.filter((node) => selectedNodeIds.includes(node.id));
  const movableSelectedNodes = selectedNodes.filter((node) => !node.locked);
  const selectionBounds = boundsForNodes(movableSelectedNodes);
  const contextBounds = boundsForNodes(selectedNodes);
  const selectedContextNode = selectedNodeIds.length === 1 ? selectedNodes[0] ?? null : null;
  const selectedContextEdge = selectedNodeIds.length === 0 ? edges.find((edge) => edge.id === selectedEdgeId) ?? null : null;
  const contextEdgeFrom = selectedContextEdge ? nodeById.get(selectedContextEdge.from) : undefined;
  const contextEdgeTo = selectedContextEdge ? nodeById.get(selectedContextEdge.to) : undefined;
  const contextWorldPoint = contextBounds
    ? { x: contextBounds.left + contextBounds.width / 2, y: contextBounds.top }
    : contextEdgeFrom && contextEdgeTo
      ? { x: (nodeCenter(contextEdgeFrom).x + nodeCenter(contextEdgeTo).x) / 2, y: (nodeCenter(contextEdgeFrom).y + nodeCenter(contextEdgeTo).y) / 2 }
      : null;
  const frameWidth = viewport.width * viewport.scale;
  const contextScreenX = contextWorldPoint ? (camera.x + contextWorldPoint.x * camera.zoom - viewport.originX) * viewport.scale : 0;
  const frameHeight = viewport.height * viewport.scale;
  const contextScreenY = contextWorldPoint ? (camera.y + contextWorldPoint.y * camera.zoom - viewport.originY) * viewport.scale : 0;
  const contextBottomY = contextBounds ? (camera.y + (contextBounds.top + contextBounds.height) * camera.zoom - viewport.originY) * viewport.scale : contextScreenY;
  const contextIsVisible = Boolean(contextWorldPoint && contextScreenX >= 0 && contextScreenX <= frameWidth && contextScreenY <= frameHeight && contextBottomY >= 0);
  const inspectorIsOpen = Boolean(activeInspectorSection && (selectedContextNode || selectedContextEdge));
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const inspectorOverlaysCanvas = inspectorIsOpen && viewportWidth > 620 && viewportWidth <= 850;
  const dockToolbarBesideInspector = inspectorOverlaysCanvas && viewportWidth <= 740;
  const contextToolbarPosition = contextIsVisible ? {
    left: dockToolbarBesideInspector
      ? 298
      : inspectorOverlaysCanvas
        ? Math.max(464, Math.min(frameWidth - 166, contextScreenX))
        : Math.max(Math.min(frameWidth / 2, 185), Math.min(frameWidth - Math.min(frameWidth / 2, 185), contextScreenX)),
    top: inspectorIsOpen && viewportWidth <= 620
      ? 8
      : Math.max(8, Math.min(frameHeight - 48, contextScreenY - 48)),
  } : null;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      if (width <= 0 || height <= 0) return;
      const scale = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT);
      const nextWidth = width / scale;
      const nextHeight = height / scale;
      const nextViewport = {
        width: nextWidth,
        height: nextHeight,
        originX: (CANVAS_WIDTH - nextWidth) / 2,
        originY: (CANVAS_HEIGHT - nextHeight) / 2,
        scale,
      };
      setViewport((current) => Math.abs(current.width - nextWidth) < 0.5 && Math.abs(current.height - nextHeight) < 0.5 && Math.abs(current.scale - scale) < 0.001 ? current : nextViewport);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  function pointInSvg(event: { clientX: number; clientY: number }): ScreenPoint {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function worldPoint(point: ScreenPoint): ScreenPoint {
    return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
  }

  function startPan(pointerId: number, point: ScreenPoint) {
    dragRef.current = { type: "pan", pointerId, startX: point.x, startY: point.y, cameraX: camera.x, cameraY: camera.y };
  }

  function beginTouchGesture(event: ReactPointerEvent<SVGSVGElement>, point: ScreenPoint, allowSelection: boolean) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerPointsRef.current.set(event.pointerId, point);
    if (pointerPointsRef.current.size >= 2) {
      const entries = [...pointerPointsRef.current.entries()].slice(0, 2);
      const first = entries[0][1];
      const second = entries[1][1];
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const anchor = worldPoint(midpoint);
      pinchRef.current = {
        pointerIds: [entries[0][0], entries[1][0]],
        startDistance: Math.max(1, distance(first, second)),
        startZoom: camera.zoom,
        worldX: anchor.x,
        worldY: anchor.y,
      };
      dragRef.current = null;
      setMarquee(null);
      setFreehandPreview([]);
    } else if (allowSelection) {
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      dragRef.current = { type: "marquee", pointerId: event.pointerId, start: point, current: point, additive, baseSelection: selectedNodeIds };
      setMarquee({ start: point, current: point });
    } else {
      startPan(event.pointerId, point);
    }
  }

  function expandGroup(node: DiagramNode): string[] {
    return node.groupId ? nodes.filter((item) => item.groupId === node.groupId).map((item) => item.id) : [node.id];
  }

  function worldBoundsForPointDrag(start: ScreenPoint, current: ScreenPoint) {
    const a = worldPoint(start);
    const b = worldPoint(current);
    return {
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x),
      bottom: Math.max(a.y, b.y),
    };
  }

  function beginNodeDrag(event: ReactPointerEvent<SVGSVGElement>, node: DiagramNode) {
    const groupedIds = expandGroup(node);
    const toggle = event.ctrlKey || event.metaKey;
    const additive = event.shiftKey;
    const alreadySelected = groupedIds.every((id) => selectedNodeIds.includes(id));
    const togglingOff = toggle && alreadySelected;
    let nextSelection: string[];
    if (togglingOff) {
      nextSelection = selectedNodeIds.filter((id) => !groupedIds.includes(id));
    } else if (toggle || additive) {
      nextSelection = [...new Set([...selectedNodeIds, ...groupedIds])];
    } else if (selectedNodeIds.includes(node.id)) {
      nextSelection = selectedNodeIds;
    } else {
      nextSelection = groupedIds;
    }
    onSetSelection(nextSelection);
    if (togglingOff) return;

    const movable = nodes.filter((item) => nextSelection.includes(item.id) && !item.locked);
    if (movable.length === 0 || event.button !== 0) return;
    const start = pointInSvg(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    onBeginHistoryAction();
    dragRef.current = { type: "nodes", pointerId: event.pointerId, start, nodes: movable.map((item) => ({ ...item })) };
  }

  function beginFreehand(event: ReactPointerEvent<SVGSVGElement>, point: ScreenPoint) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch") pointerPointsRef.current.set(event.pointerId, point);
    dragRef.current = { type: "freehand", pointerId: event.pointerId, points: [point] };
    setFreehandPreview(smoothCurve([worldPoint(point)]));
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const target = event.target as Element;
    if (event.pointerType !== "touch" && event.button !== 0 && event.button !== 1) return;
    const isGuideTarget = Boolean(target.closest("[data-guide-id]"));
    const isRulerTarget = Boolean(target.closest("[data-ruler-axis]"));
    const connectHandle = target.closest("[data-connect-handle]");
    if (connectMode && connectHandle && event.button === 0) {
      const nodeId = connectHandle.closest("[data-node-id]")?.getAttribute("data-node-id");
      if (!nodeId) return;
      const start = worldPoint(pointInSvg(event));
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { type: "connect", pointerId: event.pointerId, fromId: nodeId, start };
      setConnectionPreview({ start, end: start });
      return;
    }
    const collapseNodeId = target.closest("[data-collapse-node-id]")?.getAttribute("data-collapse-node-id");
    if (collapseNodeId && event.button === 0) {
      onSetSelection([collapseNodeId]);
      onSelectEdge(null);
      onToggleCollapse(collapseNodeId);
      return;
    }
    if (event.pointerType === "touch" && pointerPointsRef.current.size === 1 && !isGuideTarget && !isRulerTarget) {
      beginTouchGesture(event, pointInSvg(event), false);
      return;
    }
    if (event.pointerType !== "touch" && (event.button === 1 || toolMode === "pan") && !isGuideTarget && !isRulerTarget) {
      const point = pointInSvg(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      startPan(event.pointerId, point);
      onClearSelection();
      return;
    }
    if (event.pointerType === "touch" && toolMode === "pan" && !isGuideTarget && !isRulerTarget) {
      beginTouchGesture(event, pointInSvg(event), false);
      onClearSelection();
      return;
    }
    const resizeHandle = target.closest("[data-resize-handle]")?.getAttribute("data-resize-handle");
    if (resizeHandle && event.button === 0 && movableSelectedNodes.length > 0 && selectionBounds) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onBeginHistoryAction();
      dragRef.current = { type: "resize", pointerId: event.pointerId, start: pointInSvg(event), handle: resizeHandle, nodes: movableSelectedNodes.map((item) => ({ ...item })), bounds: selectionBounds };
      return;
    }
    if (target.closest("[data-rotate-handle]") && event.button === 0 && movableSelectedNodes.length > 0 && selectionBounds) {
      event.preventDefault();
      const pivot = { x: selectionBounds.left + selectionBounds.width / 2, y: selectionBounds.top + selectionBounds.height / 2 };
      const start = worldPoint(pointInSvg(event));
      event.currentTarget.setPointerCapture(event.pointerId);
      onBeginHistoryAction();
      dragRef.current = {
        type: "rotate",
        pointerId: event.pointerId,
        nodes: movableSelectedNodes.map((item) => ({ ...item })),
        pivot,
        startAngle: Math.atan2(start.y - pivot.y, start.x - pivot.x),
      };
      return;
    }

    const guideElement = target.closest("[data-guide-id]");
    const guideId = guideElement?.getAttribute("data-guide-id");
    if (guideId && event.button === 0) {
      const guide = settings.guides.find((item) => item.id === guideId);
      if (!guide) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      onBeginHistoryAction();
      dragRef.current = { type: "guide", pointerId: event.pointerId, guideId, axis: guide.axis };
      return;
    }

    const rulerElement = target.closest("[data-ruler-axis]");
    const rulerAxis = rulerElement?.getAttribute("data-ruler-axis");
    if (settings.showRulers && (rulerAxis === "vertical" || rulerAxis === "horizontal") && event.button === 0) {
      const point = worldPoint(pointInSvg(event));
      const axis = rulerAxis as GuideAxis;
      onBeginHistoryAction();
      const id = onAddGuide(axis, axis === "vertical" ? point.x : point.y);
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { type: "guide", pointerId: event.pointerId, guideId: id, axis };
      return;
    }

    if (toolMode === "freehand" && !connectMode && event.button === 0) {
      onSelectEdge(null);
      beginFreehand(event, pointInSvg(event));
      return;
    }

    const edgeId = target.closest("[data-edge-id]")?.getAttribute("data-edge-id");
    if (edgeId && event.button === 0) {
      onSetSelection([]);
      onSelectEdge(edgeId);
      return;
    }

    const pathHandle = target.closest("[data-path-handle]");
    if (pathHandle && event.button === 0) {
      const nodeId = pathHandle.getAttribute("data-path-node-id");
      const index = Number(pathHandle.getAttribute("data-path-index"));
      const kind = pathHandle.getAttribute("data-path-kind");
      if (!nodeId || !Number.isInteger(index) || (kind !== "anchor" && kind !== "controlIn" && kind !== "controlOut")) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onBeginHistoryAction();
      dragRef.current = { type: "path-handle", pointerId: event.pointerId, nodeId, index, handle: kind };
      return;
    }

    const nodeElement = target.closest("[data-node-id]");
    const nodeId = nodeElement?.getAttribute("data-node-id");
    if (nodeId) {
      onSelectEdge(null);
      if (connectMode) {
        onConnectNode(nodeId);
        return;
      }
      if (event.button !== 0) return;
      const node = nodeById.get(nodeId);
      if (!node) return;
      beginNodeDrag(event, node);
      return;
    }
    if (event.button !== 0 && event.button !== 1) return;

    const point = pointInSvg(event);
    onSelectEdge(null);
    if (event.pointerType === "touch") {
      beginTouchGesture(event, point, true);
    } else {
      event.currentTarget.setPointerCapture(event.pointerId);
      if (event.button === 1 || toolMode === "pan") {
        startPan(event.pointerId, point);
      } else {
        const additive = event.shiftKey || event.ctrlKey || event.metaKey;
        dragRef.current = { type: "marquee", pointerId: event.pointerId, start: point, current: point, additive, baseSelection: selectedNodeIds };
        setMarquee({ start: point, current: point });
      }
    }
    if (!connectMode && toolMode === "pan") onClearSelection();
  }

  function handleKeyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as Element;
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");
    if (!nodeId) return;
    event.preventDefault();
    if (connectMode) onConnectNode(nodeId);
    else onSetSelection(expandGroup(nodeById.get(nodeId)!));
  }

  function snapGroupDelta(selected: DiagramNode[], dx: number, dy: number): ScreenPoint {
    const bounds = boundsForNodes(selected);
    if (!bounds) return { x: dx, y: dy };
    let nextX = dx;
    let nextY = dy;
    if (settings.snapToGrid) {
      nextX = Math.round((bounds.left + nextX) / settings.gridSpacingPx) * settings.gridSpacingPx - bounds.left;
      nextY = Math.round((bounds.top + nextY) / settings.gridSpacingPx) * settings.gridSpacingPx - bounds.top;
    }
    const threshold = 8 / camera.zoom;
    for (const guide of settings.guides) {
      if (guide.axis === "vertical") {
        const anchors = [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width];
        const closest = anchors.map((anchor) => guide.position - (anchor + nextX)).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
        if (Math.abs(closest) <= threshold) nextX += closest;
      } else {
        const anchors = [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height];
        const closest = anchors.map((anchor) => guide.position - (anchor + nextY)).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
        if (Math.abs(closest) <= threshold) nextY += closest;
      }
    }
    return { x: nextX, y: nextY };
  }

  function resizeNodes(session: Extract<DragSession, { type: "resize" }>, pointer: ScreenPoint, keepRatio: boolean) {
    const { bounds, handle, nodes: startNodes } = session;
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const leftSide = handle.includes("w");
    const rightSide = handle.includes("e");
    const topSide = handle.includes("n");
    const bottomSide = handle.includes("s");
    const startWorld = worldPoint(session.start);
    const dx = pointer.x - startWorld.x;
    const dy = pointer.y - startWorld.y;
    const fixedX = leftSide ? bounds.left + bounds.width : rightSide ? bounds.left : bounds.left + bounds.width / 2;
    const fixedY = topSide ? bounds.top + bounds.height : bottomSide ? bounds.top : bounds.top + bounds.height / 2;
    let scaleX = leftSide ? (bounds.width - dx) / bounds.width : rightSide ? (bounds.width + dx) / bounds.width : 1;
    let scaleY = topSide ? (bounds.height - dy) / bounds.height : bottomSide ? (bounds.height + dy) / bounds.height : 1;
    if (keepRatio) {
      const ratio = leftSide || rightSide ? Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) || (!topSide && !bottomSide) ? scaleX : scaleY : scaleY;
      scaleX = ratio;
      scaleY = ratio;
    }
    const minScaleX = Math.max(...startNodes.map((node) => 48 / node.width));
    const minScaleY = Math.max(...startNodes.map((node) => 32 / node.height));
    scaleX = Math.max(minScaleX, scaleX);
    scaleY = Math.max(minScaleY, scaleY);
    const nextWidth = bounds.width * scaleX;
    const nextHeight = bounds.height * scaleY;
    const nextLeft = leftSide ? fixedX - nextWidth : rightSide ? fixedX : fixedX - nextWidth / 2;
    const nextTop = topSide ? fixedY - nextHeight : bottomSide ? fixedY : fixedY - nextHeight / 2;
    onMoveNodes(startNodes.map((node) => {
      const box = nodeWorldBounds(node);
      const centerX = nextLeft + (box.left + box.width / 2 - bounds.left) * scaleX;
      const centerY = nextTop + (box.top + box.height / 2 - bounds.top) * scaleY;
      const width = node.width * scaleX;
      const height = node.height * scaleY;
      return { id: node.id, x: centerX - width / 2, y: centerY - height / 2, width, height };
    }));
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = pointInSvg(event);
    if (event.pointerType === "touch" && pointerPointsRef.current.has(event.pointerId)) {
      pointerPointsRef.current.set(event.pointerId, point);
      const pinch = pinchRef.current;
      if (pinch) {
        const first = pointerPointsRef.current.get(pinch.pointerIds[0]);
        const second = pointerPointsRef.current.get(pinch.pointerIds[1]);
        if (first && second) {
          const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
          const zoom = clampZoom(pinch.startZoom * distance(first, second) / pinch.startDistance);
          onCameraChange({ x: midpoint.x - pinch.worldX * zoom, y: midpoint.y - pinch.worldY * zoom, zoom });
          return;
        }
      }
    }

    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.type === "pan") {
      onCameraChange({ ...camera, x: session.cameraX + point.x - session.startX, y: session.cameraY + point.y - session.startY });
      return;
    }
    const world = worldPoint(point);
    if (session.type === "connect") {
      setConnectionPreview({ start: session.start, end: world });
      return;
    }
    if (session.type === "freehand") {
      const last = session.points[session.points.length - 1];
      const nextPoints = distance(last, point) >= 2 ? [...session.points, point] : session.points;
      dragRef.current = { ...session, points: nextPoints };
      setFreehandPreview(smoothCurve(nextPoints.map((item) => worldPoint(item))));
      return;
    }
    if (session.type === "marquee") {
      dragRef.current = { ...session, current: point };
      setMarquee({ start: session.start, current: point });
      return;
    }
    if (session.type === "guide") {
      onMoveGuide(session.guideId, session.axis === "vertical" ? world.x : world.y);
      return;
    }
    if (session.type === "nodes") {
      const startWorld = worldPoint(session.start);
      const delta = snapGroupDelta(session.nodes, world.x - startWorld.x, world.y - startWorld.y);
      onMoveNodes(session.nodes.map((node) => ({ id: node.id, x: node.x + delta.x, y: node.y + delta.y })));
      return;
    }
    if (session.type === "resize") {
      resizeNodes(session, world, event.shiftKey);
      return;
    }
    if (session.type === "path-handle") {
      const node = nodeById.get(session.nodeId);
      if (!node) return;
      const localWorld = rotatePoint(world, nodeCenter(node), -(node.rotation ?? 0));
      onEditPathPoint(session.nodeId, session.index, session.handle, { x: localWorld.x - node.x, y: localWorld.y - node.y });
      return;
    }
    const angle = Math.atan2(world.y - session.pivot.y, world.x - session.pivot.x);
    let deltaDegrees = ((angle - session.startAngle) * 180 / Math.PI + 540) % 360 - 180;
    const step = Math.max(1, settings.rotationSnapDegrees);
    if (!event.shiftKey) deltaDegrees = Math.round(deltaDegrees / step) * step;
    const deltaRadians = deltaDegrees * Math.PI / 180;
    const cos = Math.cos(deltaRadians);
    const sin = Math.sin(deltaRadians);
    onMoveNodes(session.nodes.map((node) => {
      const centerX = node.x + node.width / 2 - session.pivot.x;
      const centerY = node.y + node.height / 2 - session.pivot.y;
      const nextCenterX = session.pivot.x + centerX * cos - centerY * sin;
      const nextCenterY = session.pivot.y + centerX * sin + centerY * cos;
      const rotation = ((node.rotation ?? 0) + deltaDegrees + 360) % 360;
      return { id: node.id, x: nextCenterX - node.width / 2, y: nextCenterY - node.height / 2, rotation };
    }));
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const wasPinch = pinchRef.current?.pointerIds.includes(event.pointerId) ?? false;
    if (event.pointerType === "touch") pointerPointsRef.current.delete(event.pointerId);
    if (wasPinch) {
      pinchRef.current = null;
      dragRef.current = null;
      setMarquee(null);
      const remaining = [...pointerPointsRef.current.entries()][0];
      if (remaining) startPan(remaining[0], remaining[1]);
      return;
    }
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.type === "connect") {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const targetNodeId = hit?.closest("[data-node-id]")?.getAttribute("data-node-id");
      if (targetNodeId && targetNodeId !== session.fromId) onCreateEdge(session.fromId, targetNodeId);
      setConnectionPreview(null);
      dragRef.current = null;
      return;
    }
    if (session.type === "freehand") {
      const screenPoints = session.points;
      const end = pointInSvg(event);
      if (distance(screenPoints[screenPoints.length - 1], end) >= 1) screenPoints.push(end);
      if (screenPoints.length >= 2) {
        const points = screenPoints.map((item) => worldPoint(item));
        const left = Math.min(...points.map((item) => item.x));
        const top = Math.min(...points.map((item) => item.y));
        const width = Math.max(1, Math.max(...points.map((item) => item.x)) - left);
        const height = Math.max(1, Math.max(...points.map((item) => item.y)) - top);
        const local = points.map((item) => ({ x: item.x - left, y: item.y - top }));
        onAddFreehand(left, top, width, height, smoothCurve(local));
      }
      setFreehandPreview([]);
      dragRef.current = null;
      return;
    }
    if (session.type === "marquee") {
      const bounds = worldBoundsForPointDrag(session.start, session.current);
      const hitIds = nodes.filter((node) => {
        const box = nodeWorldBounds(node);
        return box.left <= bounds.right && box.left + box.width >= bounds.left && box.top <= bounds.bottom && box.top + box.height >= bounds.top;
      }).map((node) => node.id);
      const hitGroups = new Set(nodes.filter((node) => hitIds.includes(node.id) && node.groupId).map((node) => node.groupId));
      const hits = nodes.filter((node) => hitIds.includes(node.id) || (node.groupId && hitGroups.has(node.groupId))).map((node) => node.id);
      onSetSelection(session.additive ? [...new Set([...session.baseSelection, ...hits])] : hits);
      setMarquee(null);
    } else if (session.type === "nodes" || session.type === "resize" || session.type === "rotate" || session.type === "guide" || session.type === "path-handle") {
      onEndHistoryAction();
    }
    dragRef.current = null;
  }

  function handlePointerCancel(event: ReactPointerEvent<SVGSVGElement>) {
    const wasPinch = pinchRef.current?.pointerIds.includes(event.pointerId) ?? false;
    if (event.pointerType === "touch") pointerPointsRef.current.delete(event.pointerId);
    if (wasPinch) {
      pinchRef.current = null;
      dragRef.current = null;
      setMarquee(null);
      setFreehandPreview([]);
      return;
    }
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.type === "nodes" || session.type === "resize" || session.type === "rotate" || session.type === "guide" || session.type === "path-handle") onEndHistoryAction();
    setMarquee(null);
    setConnectionPreview(null);
    setFreehandPreview([]);
    dragRef.current = null;
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = pointInSvg(event);
    const nextZoom = clampZoom(camera.zoom * Math.exp(-event.deltaY * 0.001));
    const worldX = (point.x - camera.x) / camera.zoom;
    const worldY = (point.y - camera.y) / camera.zoom;
    onCameraChange({ x: point.x - worldX * nextZoom, y: point.y - worldY * nextZoom, zoom: nextZoom });
  }

  function updateZoom(zoom: number) {
    const nextZoom = clampZoom(zoom);
    const centerX = viewport.originX + viewport.width / 2;
    const centerY = viewport.originY + viewport.height / 2;
    const worldX = (centerX - camera.x) / camera.zoom;
    const worldY = (centerY - camera.y) / camera.zoom;
    onCameraChange({ x: centerX - worldX * nextZoom, y: centerY - worldY * nextZoom, zoom: nextZoom });
  }

  return (
    <div className="canvas-frame">
      <svg
        ref={svgRef}
        className={`diagram-canvas${connectMode ? " is-connecting" : ""}${toolMode === "select" ? " is-select-tool" : toolMode === "pan" ? " is-pan-tool" : " is-freehand-tool"}`}
        viewBox={`${viewport.originX} ${viewport.originY} ${viewport.width} ${viewport.height}`}
        tabIndex={0}
        role="application"
        aria-label="Płótno diagramu. W trybie zaznaczania przeciągnij tło, aby zaznaczyć obszar. Narzędzie ręki przesuwa widok, pióro rysuje krzywe, a kółko myszy lub gest dwoma palcami zmienia powiększenie."
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      >
        <defs>
          <GridPattern settings={settings} camera={camera} />
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#aaa6c4" />
          </marker>
        </defs>
        <rect x={viewport.originX} y={viewport.originY} width={viewport.width} height={viewport.height} fill="#fbfbfe" data-canvas-background="true" />
        <rect x={viewport.originX} y={viewport.originY} width={viewport.width} height={viewport.height} fill="url(#grid-pattern)" data-canvas-background="true" />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {nodes.map((node) => {
            const parent = node.parentId ? nodeById.get(node.parentId) : null;
            if (!parent) return null;
            const edge: DiagramEdge = { id: `tree-${node.id}`, from: parent.id, to: node.id, connectorKind: "curve", autoRoute: false, arrowEnd: false };
            return <DiagramEdgeView key={edge.id} edge={edge} from={parent} to={node} nodes={nodes} selected={false} selectable={false} className="mindmap-branch" stroke={node.stroke ?? "#bdb6da"} />;
          })}
          {edges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            return from && to ? <DiagramEdgeView key={edge.id} edge={edge} from={from} to={to} nodes={nodes} selected={selectedEdgeId === edge.id} /> : null;
          })}
          {nodes.map((node) => <DiagramNodeView key={node.id} node={node} selected={selectedNodeIds.includes(node.id)} connectSource={node.id === connectSourceId} showConnectHandles={connectMode} hasChildren={nodesWithChildren.has(node.id)} />)}
          {freehandPreview.length > 1
            ? <path d={bezierPath(freehandPreview)} className="freehand-preview" />
            : freehandPreview.length === 1 && <circle cx={freehandPreview[0].x} cy={freehandPreview[0].y} r={2 / camera.zoom} className="freehand-preview-point" />}
          {connectionPreview && <path d={`M ${connectionPreview.start.x} ${connectionPreview.start.y} L ${connectionPreview.end.x} ${connectionPreview.end.y}`} className="connection-preview" />}
        </g>
        <GuideOverlays guides={settings.guides} camera={camera} viewport={viewport} />
        <SelectionOverlay bounds={selectionBounds} camera={camera} />
        <PathHandlesOverlay nodes={nodes} selectedNodeIds={selectedNodeIds} camera={camera} />
        {marquee && (
          <rect
            x={Math.min(marquee.start.x, marquee.current.x)}
            y={Math.min(marquee.start.y, marquee.current.y)}
            width={Math.abs(marquee.current.x - marquee.start.x)}
            height={Math.abs(marquee.current.y - marquee.start.y)}
            className="selection-marquee"
          />
        )}
        {settings.showRulers && <Rulers camera={camera} unit={settings.unit} viewport={viewport} />}
      </svg>
      {contextToolbarPosition && (selectedContextNode || selectedContextEdge) && <ObjectContextToolbar
        key={selectedContextNode?.id ?? selectedContextEdge?.id ?? "none"}
        node={selectedContextNode}
        allNodes={allNodes}
        edgeSelected={Boolean(selectedContextEdge)}
        activeSection={activeInspectorSection}
        position={contextToolbarPosition}
        dockToInspector={dockToolbarBesideInspector}
        onOpenInspector={onOpenInspector}
        onAddChild={() => { if (selectedContextNode) onAddChildNode(selectedContextNode.id); }}
        onAddSibling={() => { if (selectedContextNode) onAddSiblingNode(selectedContextNode.id); }}
        onAddParent={() => { if (selectedContextNode) onAddParentNode(selectedContextNode.id); }}
        onAddAtParent={onAddChildNode}
        onAddRoot={onAddRootNode}
        onToggleLock={onToggleLockSelected}
        onDelete={onDeleteSelection}
      />}
      {settings.showMinimap && <MiniMap nodes={nodes} edges={edges} camera={camera} viewport={viewport} onCameraChange={onCameraChange} />}
      <div className="canvas-zoom" aria-label="Sterowanie powiększeniem">
        <button type="button" aria-label="Pomniejsz" onClick={() => updateZoom(camera.zoom - 0.1)}>−</button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <button type="button" aria-label="Powiększ" onClick={() => updateZoom(camera.zoom + 0.1)}>+</button>
      </div>
    </div>
  );
}
