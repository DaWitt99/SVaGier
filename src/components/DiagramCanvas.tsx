import { memo, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { Camera, CurvePoint, DiagramEdge, DiagramNode, EditorSettings, Guide, GuideAxis, MeasurementUnit } from "../model";
import { formatMeasurement } from "../units";
import { bezierPath, connectorGeometry, nodeBounds, nodeCenter, smoothCurve, type Point } from "../geometry";

interface DiagramCanvasProps {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  settings: EditorSettings;
  camera: Camera;
  selectedNodeIds: string[];
  toolMode: "select" | "pan" | "freehand";
  connectMode: boolean;
  connectSourceId: string | null;
  selectedEdgeId: string | null;
  onCameraChange: (camera: Camera) => void;
  onSetSelection: (ids: string[]) => void;
  onMoveNodes: (updates: Partial<DiagramNode>[]) => void;
  onBeginHistoryAction: () => void;
  onEndHistoryAction: () => void;
  onConnectNode: (id: string) => void;
  onCreateEdge: (fromId: string, toId: string) => void;
  onSelectEdge: (id: string | null) => void;
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
  if (node.kind === "decision") {
    const points = [
      `${node.x + node.width / 2},${node.y}`,
      `${node.x + node.width},${node.y + node.height / 2}`,
      `${node.x + node.width / 2},${node.y + node.height}`,
      `${node.x},${node.y + node.height / 2}`,
    ].join(" ");
    return <polygon points={points} className="node-shape decision-shape" style={shapeStyle(node)} />;
  }
  if (node.kind === "ellipse") return <ellipse cx={node.x + node.width / 2} cy={node.y + node.height / 2} rx={node.width / 2} ry={node.height / 2} className="node-shape" style={shapeStyle(node)} />;
  if (node.kind === "line") return <line x1={node.x} y1={node.y + node.height / 2} x2={node.x + node.width} y2={node.y + node.height / 2} className="standalone-line" style={{ stroke: node.stroke ?? "#8071d9", strokeWidth: node.strokeWidth ?? 2 }} />;
  if (node.kind === "text" || node.kind === "freehand" || node.kind === "image") {
    if (node.kind === "freehand") return <path d={bezierPath(node.pathPoints ?? [])} transform={`translate(${node.x} ${node.y})`} className="freehand-shape" style={{ stroke: node.stroke ?? "#5e50b4", strokeWidth: node.strokeWidth ?? 3 }} />;
    if (node.kind === "image") return <><rect x={node.x} y={node.y} width={node.width} height={node.height} rx="6" className="image-frame" /><image x={node.x} y={node.y} width={node.width} height={node.height} href={node.imageData ?? node.imageSrc ?? ""} preserveAspectRatio="xMidYMid meet" /></>;
    return null;
  }
  if (node.kind === "database") {
    return <g className="node-shape" style={shapeStyle(node)}><path d={`M ${node.x} ${node.y + 18} V ${node.y + node.height - 18} C ${node.x} ${node.y + node.height + 2}, ${node.x + node.width} ${node.y + node.height + 2}, ${node.x + node.width} ${node.y + node.height - 18} V ${node.y + 18}`} /><ellipse cx={node.x + node.width / 2} cy={node.y + 18} rx={node.width / 2} ry="18" /><path d={`M ${node.x} ${node.y + 18} C ${node.x} ${node.y + 42}, ${node.x + node.width} ${node.y + 42}, ${node.x + node.width} ${node.y + 18}`} className="database-rim" /></g>;
  }
  if (node.kind === "document") {
    return <path d={`M ${node.x} ${node.y} H ${node.x + node.width} V ${node.y + node.height - 14} Q ${node.x + node.width * 0.75} ${node.y + node.height + 8} ${node.x + node.width / 2} ${node.y + node.height - 8} Q ${node.x + node.width * 0.25} ${node.y + node.height - 24} ${node.x} ${node.y + node.height - 10} Z`} className="node-shape" style={shapeStyle(node)} />;
  }
  if (node.kind === "actor") {
    const cx = node.x + node.width / 2;
    const legEnd = node.y + node.height - 38;
    return <g className="actor-symbol" style={{ stroke: node.stroke ?? "#8c7ce0" }}><circle cx={cx} cy={node.y + 24} r="14" /><path d={`M ${cx} ${node.y + 38} V ${node.y + 72} M ${cx - 26} ${node.y + 50} H ${cx + 26} M ${cx} ${node.y + 72} L ${cx - 22} ${legEnd} M ${cx} ${node.y + 72} L ${cx + 22} ${legEnd}`} /></g>;
  }
  return (
    <>
      <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={node.kind === "class" ? 12 : 16} className="node-shape" style={shapeStyle(node)} />
      {node.kind === "class" && <path d={`M ${node.x} ${node.y + 48} H ${node.x + node.width}`} className="class-divider" />}
    </>
  );
}

function shapeStyle(node: DiagramNode) {
  return { fill: node.fill ?? (node.kind === "decision" ? "#fbfaff" : "#fff"), stroke: node.stroke ?? "#d8d8e7", strokeWidth: node.strokeWidth ?? 1.5 };
}

interface DiagramNodeViewProps {
  node: DiagramNode;
  selected: boolean;
  connectSource: boolean;
  showConnectHandles: boolean;
}

const DiagramNodeView = memo(function DiagramNodeView({ node, selected, connectSource, showConnectHandles }: DiagramNodeViewProps) {
  const titleY = node.kind === "class" ? node.y + 30 : node.kind === "actor" ? node.y + node.height - 18 : node.y + node.height / 2 - 8;
  const detailY = node.kind === "class" ? node.y + 70 : node.kind === "actor" ? node.y + node.height - 2 : node.y + node.height / 2 + 18;
  const detailLines = node.detail.split("\n");
  const textNodeLines = [...node.title.split("\n"), ...(node.detail ? node.detail.split("\n") : [])];
  const textAnchor = node.textAlign === "left" ? "start" : node.textAlign === "right" ? "end" : "middle";
  const textX = node.textAlign === "left" ? node.x + 12 : node.textAlign === "right" ? node.x + node.width - 12 : node.x + node.width / 2;
  const textStyle = { fill: node.textColor ?? "#302f43", fontSize: node.fontSize ?? 15, fontWeight: node.fontWeight ?? (node.kind === "text" ? "normal" : "650"), fontStyle: node.fontStyle ?? "normal", textAnchor } as const;
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
      aria-label={`${node.title}, ${node.kind === "class" ? "klasa UML" : node.kind === "decision" ? "decyzja" : "proces"}`}
      aria-pressed={selected}
    >
      {shapeFor(node)}
      {node.kind === "text" ? <text x={textX} y={node.y + (node.fontSize ?? 18)} className="text-node-content" style={textStyle}>{textNodeLines.map((line, index) => <tspan key={`${node.id}-text-${index}`} x={textX} dy={index === 0 ? 0 : (node.fontSize ?? 18) * 1.25}>{line}</tspan>)}</text> : node.kind !== "image" && node.kind !== "freehand" && node.kind !== "line" && node.title && <text x={textX} y={titleY} className="node-title" style={textStyle}>{node.title}</text>}
      {node.kind !== "text" && node.kind !== "image" && node.kind !== "freehand" && node.kind !== "line" && <text x={textX} y={detailY} className="node-detail" style={{ ...textStyle, fill: node.textColor ?? "#858398", fontSize: node.fontSize ? Math.max(9, node.fontSize - 4) : 11 }}>
        {detailLines.map((line, index) => <tspan key={`${node.id}-detail-${index}`} x={textX} dy={index === 0 ? 0 : 18}>{line}</tspan>)}
      </text>}
      {node.locked && (
        <g className="node-lock-mark" transform={`translate(${node.x + node.width - 20} ${node.y + 8})`} aria-hidden="true">
          <rect x="0" y="7" width="12" height="10" rx="2" />
          <path d="M 3 7 V 5 a3 3 0 0 1 6 0 v2" />
        </g>
      )}
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
}

const DiagramEdgeView = memo(function DiagramEdgeView({ edge, from, to, nodes, selected }: DiagramEdgeViewProps) {
  const geometry = connectorGeometry(edge, from, to, nodes);
  return <g data-edge-id={edge.id} className={`diagram-connection${selected ? " is-selected" : ""}`}>
    <path d={geometry.d} className="diagram-edge-hit" />
    <path d={geometry.d} className="diagram-edge" markerStart={edge.arrowStart ? "url(#arrowhead)" : undefined} markerEnd={edge.arrowEnd === false ? undefined : "url(#arrowhead)"} />
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
  toolMode,
  connectMode,
  connectSourceId,
  selectedEdgeId,
  onCameraChange,
  onSetSelection,
  onMoveNodes,
  onBeginHistoryAction,
  onEndHistoryAction,
  onConnectNode,
  onCreateEdge,
  onSelectEdge,
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
    setFreehandPreview([]);
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
          {edges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            return from && to ? <DiagramEdgeView key={edge.id} edge={edge} from={from} to={to} nodes={nodes} selected={selectedEdgeId === edge.id} /> : null;
          })}
          {nodes.map((node) => <DiagramNodeView key={node.id} node={node} selected={selectedNodeIds.includes(node.id)} connectSource={node.id === connectSourceId} showConnectHandles={connectMode} />)}
          {freehandPreview.length > 1 && <path d={bezierPath(freehandPreview)} className="freehand-preview" />}
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
      {settings.showMinimap && <MiniMap nodes={nodes} edges={edges} camera={camera} viewport={viewport} onCameraChange={onCameraChange} />}
      <div className="canvas-zoom" aria-label="Sterowanie powiększeniem">
        <button type="button" aria-label="Pomniejsz" onClick={() => updateZoom(camera.zoom - 0.1)}>−</button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <button type="button" aria-label="Powiększ" onClick={() => updateZoom(camera.zoom + 0.1)}>+</button>
      </div>
    </div>
  );
}
