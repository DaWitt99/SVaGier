import { memo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { Camera, DiagramEdge, DiagramNode, EditorSettings, Guide, GuideAxis, MeasurementUnit } from "../model";
import { formatMeasurement } from "../units";

interface DiagramCanvasProps {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  settings: EditorSettings;
  camera: Camera;
  selectedNodeIds: string[];
  toolMode: "select" | "pan";
  connectMode: boolean;
  connectSourceId: string | null;
  onCameraChange: (camera: Camera) => void;
  onSetSelection: (ids: string[]) => void;
  onMoveNodes: (updates: Partial<DiagramNode>[]) => void;
  onBeginHistoryAction: () => void;
  onEndHistoryAction: () => void;
  onConnectNode: (id: string) => void;
  onClearSelection: () => void;
  onAddGuide: (axis: GuideAxis, position: number) => string;
  onMoveGuide: (id: string, position: number) => void;
}

export const CANVAS_WIDTH = 1440;
export const CANVAS_HEIGHT = 900;
const RULER_SIZE = 25;
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 4;

type DragSession =
  | { type: "pan"; pointerId: number; startX: number; startY: number; cameraX: number; cameraY: number }
  | { type: "nodes"; pointerId: number; start: ScreenPoint; nodes: DiagramNode[] }
  | { type: "guide"; pointerId: number; guideId: string; axis: GuideAxis }
  | { type: "marquee"; pointerId: number; start: ScreenPoint; current: ScreenPoint; additive: boolean; baseSelection: string[] }
  | { type: "resize"; pointerId: number; start: ScreenPoint; handle: string; nodes: DiagramNode[]; bounds: WorldBounds }
  | { type: "rotate"; pointerId: number; nodes: DiagramNode[]; pivot: ScreenPoint; startAngle: number };

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
    return <polygon points={points} className="node-shape decision-shape" />;
  }

  return (
    <>
      <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={node.kind === "class" ? 12 : 16} className="node-shape" />
      {node.kind === "class" && <path d={`M ${node.x} ${node.y + 48} H ${node.x + node.width}`} className="class-divider" />}
    </>
  );
}

interface DiagramNodeViewProps {
  node: DiagramNode;
  selected: boolean;
  connectSource: boolean;
}

const DiagramNodeView = memo(function DiagramNodeView({ node, selected, connectSource }: DiagramNodeViewProps) {
  const titleY = node.kind === "class" ? node.y + 30 : node.y + node.height / 2 - 8;
  const detailY = node.kind === "class" ? node.y + 70 : node.y + node.height / 2 + 18;
  const detailLines = node.detail.split("\n");
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
      <text x={node.x + node.width / 2} y={titleY} className="node-title">{node.title}</text>
      <text x={node.x + node.width / 2} y={detailY} className="node-detail">
        {detailLines.map((line, index) => <tspan key={`${node.id}-detail-${index}`} x={node.x + node.width / 2} dy={index === 0 ? 0 : 18}>{line}</tspan>)}
      </text>
      {node.locked && (
        <g className="node-lock-mark" transform={`translate(${node.x + node.width - 20} ${node.y + 8})`} aria-hidden="true">
          <rect x="0" y="7" width="12" height="10" rx="2" />
          <path d="M 3 7 V 5 a3 3 0 0 1 6 0 v2" />
        </g>
      )}
    </g>
  );
});

interface DiagramEdgeViewProps {
  from: DiagramNode;
  to: DiagramNode;
}

const DiagramEdgeView = memo(function DiagramEdgeView({ from, to }: DiagramEdgeViewProps) {
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height / 2;
  const x2 = to.x + to.width / 2;
  const y2 = to.y + to.height / 2;
  return <path d={`M ${x1} ${y1} L ${x2} ${y2}`} className="diagram-edge" markerEnd="url(#arrowhead)" />;
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

function Rulers({ camera, unit }: { camera: Camera; unit: MeasurementUnit }) {
  const step = niceWorldStep(camera.zoom);
  const verticalStart = (RULER_SIZE - camera.x) / camera.zoom;
  const horizontalStart = (RULER_SIZE - camera.y) / camera.zoom;
  const verticalEnd = (CANVAS_WIDTH - camera.x) / camera.zoom;
  const horizontalEnd = (CANVAS_HEIGHT - camera.y) / camera.zoom;
  const xTicks: { value: number; screen: number }[] = [];
  const yTicks: { value: number; screen: number }[] = [];

  for (let value = Math.ceil(verticalStart / step) * step, count = 0; value <= verticalEnd && count < 300; value += step, count++) {
    xTicks.push({ value, screen: camera.x + value * camera.zoom });
  }
  for (let value = Math.ceil(horizontalStart / step) * step, count = 0; value <= horizontalEnd && count < 300; value += step, count++) {
    yTicks.push({ value, screen: camera.y + value * camera.zoom });
  }

  return (
    <g className="canvas-rulers">
      <rect x={RULER_SIZE} y="0" width={CANVAS_WIDTH - RULER_SIZE} height={RULER_SIZE} className="ruler-surface" data-ruler-axis="vertical" />
      <rect x="0" y={RULER_SIZE} width={RULER_SIZE} height={CANVAS_HEIGHT - RULER_SIZE} className="ruler-surface" data-ruler-axis="horizontal" />
      <rect x="0" y="0" width={RULER_SIZE} height={RULER_SIZE} className="ruler-corner" />
      {xTicks.map(({ value, screen }) => (
        <g key={`x-${value}`}>
          <line x1={screen} x2={screen} y1={RULER_SIZE - 6} y2={RULER_SIZE} className="ruler-tick" />
          <text x={screen + 3} y="10" className="ruler-label" data-ruler-axis="vertical">{formatMeasurement(value, unit)}</text>
          <rect x={screen - 6} y="12" width="12" height="12" className="ruler-hit-area" data-ruler-axis="vertical" />
        </g>
      ))}
      {yTicks.map(({ value, screen }) => (
        <g key={`y-${value}`}>
          <line x1={RULER_SIZE - 6} x2={RULER_SIZE} y1={screen} y2={screen} className="ruler-tick" />
          <text x="3" y={screen - 3} className="ruler-label" data-ruler-axis="horizontal">{formatMeasurement(value, unit)}</text>
          <rect x="0" y={screen - 6} width={RULER_SIZE} height="12" className="ruler-hit-area" data-ruler-axis="horizontal" />
        </g>
      ))}
    </g>
  );
}

function GuideOverlays({ guides, camera }: { guides: Guide[]; camera: Camera }) {
  return (
    <g className="canvas-guides">
      {guides.map((guide) => {
        const position = guide.position * camera.zoom + (guide.axis === "vertical" ? camera.x : camera.y);
        return (
          <g key={guide.id} data-guide-id={guide.id} className="canvas-guide">
            {guide.axis === "vertical" ? (
              <>
                <line x1={position} x2={position} y1={0} y2={CANVAS_HEIGHT} className="guide-hit-area" />
                <line x1={position} x2={position} y1={0} y2={CANVAS_HEIGHT} className="guide-line" />
              </>
            ) : (
              <>
                <line x1={0} x2={CANVAS_WIDTH} y1={position} y2={position} className="guide-hit-area" />
                <line x1={0} x2={CANVAS_WIDTH} y1={position} y2={position} className="guide-line" />
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

function nodeWorldBounds(node: DiagramNode): WorldBounds {
  const radians = ((node.rotation ?? 0) * Math.PI) / 180;
  const width = Math.abs(node.width * Math.cos(radians)) + Math.abs(node.height * Math.sin(radians));
  const height = Math.abs(node.width * Math.sin(radians)) + Math.abs(node.height * Math.cos(radians));
  return {
    left: node.x + node.width / 2 - width / 2,
    top: node.y + node.height / 2 - height / 2,
    width,
    height,
  };
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

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getMinimapBounds(nodes: DiagramNode[], camera: Camera): WorldBounds {
  const viewLeft = -camera.x / camera.zoom;
  const viewTop = -camera.y / camera.zoom;
  const viewRight = viewLeft + CANVAS_WIDTH / camera.zoom;
  const viewBottom = viewTop + CANVAS_HEIGHT / camera.zoom;
  const left = Math.min(viewLeft, ...nodes.map((node) => node.x));
  const top = Math.min(viewTop, ...nodes.map((node) => node.y));
  const right = Math.max(viewRight, ...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(viewBottom, ...nodes.map((node) => node.y + node.height));
  const marginX = Math.max(60, (right - left) * 0.06);
  const marginY = Math.max(60, (bottom - top) * 0.06);
  return { left: left - marginX, top: top - marginY, width: right - left + marginX * 2, height: bottom - top + marginY * 2 };
}

function MiniMap({ nodes, edges, camera, onCameraChange }: {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
}) {
  const [dragBounds, setDragBounds] = useState<WorldBounds | null>(null);
  const bounds = dragBounds ?? getMinimapBounds(nodes, camera);
  const width = 190;
  const height = 126;
  const pad = 8;
  const scale = Math.min((width - pad * 2) / bounds.width, (height - pad * 2) / bounds.height);
  const worldToMini = (x: number, y: number) => ({ x: pad + (x - bounds.left) * scale, y: pad + (y - bounds.top) * scale });
  const viewLeft = -camera.x / camera.zoom;
  const viewTop = -camera.y / camera.zoom;
  const viewWidth = CANVAS_WIDTH / camera.zoom;
  const viewHeight = CANVAS_HEIGHT / camera.zoom;
  const miniView = worldToMini(viewLeft, viewTop);
  const mapNode = new Map(nodes.map((node) => [node.id, node]));

  function centerCamera(event: ReactPointerEvent<SVGSVGElement>, mapBounds: WorldBounds) {
    const rect = event.currentTarget.getBoundingClientRect();
    const miniX = ((event.clientX - rect.left) / rect.width) * width;
    const miniY = ((event.clientY - rect.top) / rect.height) * height;
    const mapScale = Math.min((width - pad * 2) / mapBounds.width, (height - pad * 2) / mapBounds.height);
    const worldX = mapBounds.left + (miniX - pad) / mapScale;
    const worldY = mapBounds.top + (miniY - pad) / mapScale;
    onCameraChange({ x: CANVAS_WIDTH / 2 - worldX * camera.zoom, y: CANVAS_HEIGHT / 2 - worldY * camera.zoom, zoom: camera.zoom });
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
  onCameraChange,
  onSetSelection,
  onMoveNodes,
  onBeginHistoryAction,
  onEndHistoryAction,
  onConnectNode,
  onClearSelection,
  onAddGuide,
  onMoveGuide,
}: DiagramCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const pointerPointsRef = useRef(new Map<number, ScreenPoint>());
  const pinchRef = useRef<PinchSession | null>(null);
  const [marquee, setMarquee] = useState<{ start: ScreenPoint; current: ScreenPoint } | null>(null);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const selectedNodes = nodes.filter((node) => selectedNodeIds.includes(node.id));
  const movableSelectedNodes = selectedNodes.filter((node) => !node.locked);
  const selectionBounds = boundsForNodes(movableSelectedNodes);

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

  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const target = event.target as Element;
    if (event.pointerType !== "touch" && event.button !== 0 && event.button !== 1) return;
    const isGuideTarget = Boolean(target.closest("[data-guide-id]"));
    const isRulerTarget = Boolean(target.closest("[data-ruler-axis]"));
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

    const nodeElement = target.closest("[data-node-id]");
    const nodeId = nodeElement?.getAttribute("data-node-id");
    if (nodeId) {
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
    } else if (session.type === "nodes" || session.type === "resize" || session.type === "rotate" || session.type === "guide") {
      onEndHistoryAction();
    }
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
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    const worldX = (centerX - camera.x) / camera.zoom;
    const worldY = (centerY - camera.y) / camera.zoom;
    onCameraChange({ x: centerX - worldX * nextZoom, y: centerY - worldY * nextZoom, zoom: nextZoom });
  }

  return (
    <div className="canvas-frame">
      <svg
        ref={svgRef}
        className={`diagram-canvas${connectMode ? " is-connecting" : ""}${toolMode === "select" ? " is-select-tool" : " is-pan-tool"}`}
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        tabIndex={0}
        role="application"
        aria-label="Nieograniczone płótno diagramu. W trybie zaznaczania przeciągnij tło, aby zaznaczyć obszar. Wybierz narzędzie ręki, aby przesuwać widok; kółko myszy lub gest dwoma palcami zmienia powiększenie."
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      >
        <defs>
          <GridPattern settings={settings} camera={camera} />
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#aaa6c4" />
          </marker>
        </defs>
        <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#fbfbfe" data-canvas-background="true" />
        <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#grid-pattern)" data-canvas-background="true" />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {edges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            return from && to ? <DiagramEdgeView key={edge.id} from={from} to={to} /> : null;
          })}
          {nodes.map((node) => <DiagramNodeView key={node.id} node={node} selected={selectedNodeIds.includes(node.id)} connectSource={node.id === connectSourceId} />)}
        </g>
        <GuideOverlays guides={settings.guides} camera={camera} />
        <SelectionOverlay bounds={selectionBounds} camera={camera} />
        {marquee && (
          <rect
            x={Math.min(marquee.start.x, marquee.current.x)}
            y={Math.min(marquee.start.y, marquee.current.y)}
            width={Math.abs(marquee.current.x - marquee.start.x)}
            height={Math.abs(marquee.current.y - marquee.start.y)}
            className="selection-marquee"
          />
        )}
        {settings.showRulers && <Rulers camera={camera} unit={settings.unit} />}
      </svg>
      {settings.showMinimap && <MiniMap nodes={nodes} edges={edges} camera={camera} onCameraChange={onCameraChange} />}
      <div className="canvas-zoom" aria-label="Sterowanie powiększeniem">
        <button type="button" aria-label="Pomniejsz" onClick={() => updateZoom(camera.zoom - 0.1)}>−</button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <button type="button" aria-label="Powiększ" onClick={() => updateZoom(camera.zoom + 0.1)}>+</button>
      </div>
    </div>
  );
}
