import { memo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { DiagramEdge, DiagramNode } from "../model";

interface DiagramCanvasProps {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  selectedNodeId: string | null;
  connectMode: boolean;
  connectSourceId: string | null;
  onSelectNode: (id: string) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onConnectNode: (id: string) => void;
  onClearSelection: () => void;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

type DragSession =
  | { type: "pan"; pointerId: number; startX: number; startY: number; cameraX: number; cameraY: number }
  | { type: "node"; pointerId: number; nodeId: string; offsetX: number; offsetY: number };

const WIDTH = 1440;
const HEIGHT = 900;

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
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={node.kind === "class" ? 12 : 16}
        className="node-shape"
      />
      {node.kind === "class" && (
        <path
          d={`M ${node.x} ${node.y + 48} H ${node.x + node.width}`}
          className="class-divider"
        />
      )}
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
      className={`diagram-node${selected ? " is-selected" : ""}${connectSource ? " is-connect-source" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${node.title}, ${node.kind === "class" ? "klasa UML" : node.kind === "decision" ? "decyzja" : "proces"}`}
      aria-pressed={selected}
    >
      {shapeFor(node)}
      <text x={node.x + node.width / 2} y={titleY} className="node-title">
        {node.title}
      </text>
      <text x={node.x + node.width / 2} y={detailY} className="node-detail">
        {detailLines.map((line, index) => (
          <tspan key={`${node.id}-detail-${index}`} x={node.x + node.width / 2} dy={index === 0 ? 0 : 18}>
            {line}
          </tspan>
        ))}
      </text>
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

export default function DiagramCanvas({
  nodes,
  edges,
  selectedNodeId,
  connectMode,
  connectSourceId,
  onSelectNode,
  onMoveNode,
  onConnectNode,
  onClearSelection,
}: DiagramCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  function pointInSvg(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function worldPoint(event: { clientX: number; clientY: number }) {
    const point = pointInSvg(event);
    return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const target = event.target as Element;
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
      const point = worldPoint(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        type: "node",
        pointerId: event.pointerId,
        nodeId,
        offsetX: point.x - node.x,
        offsetY: point.y - node.y,
      };
      onSelectNode(nodeId);
      return;
    }
    if (event.button !== 0 && event.button !== 1) return;

    const point = pointInSvg(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "pan",
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      cameraX: camera.x,
      cameraY: camera.y,
    };
    if (!connectMode) onClearSelection();
  }

  function handleKeyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as Element;
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");
    if (!nodeId) return;
    event.preventDefault();
    if (connectMode) onConnectNode(nodeId);
    else onSelectNode(nodeId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const point = pointInSvg(event);

    if (session.type === "pan") {
      setCamera((current) => ({
        ...current,
        x: session.cameraX + point.x - session.startX,
        y: session.cameraY + point.y - session.startY,
      }));
      return;
    }

    const worldX = (point.x - camera.x) / camera.zoom;
    const worldY = (point.y - camera.y) / camera.zoom;
    onMoveNode(session.nodeId, worldX - session.offsetX, worldY - session.offsetY);
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = pointInSvg(event);
    const nextZoom = Math.max(0.4, Math.min(2.4, camera.zoom * Math.exp(-event.deltaY * 0.001)));
    const worldX = (point.x - camera.x) / camera.zoom;
    const worldY = (point.y - camera.y) / camera.zoom;
    setCamera({ x: point.x - worldX * nextZoom, y: point.y - worldY * nextZoom, zoom: nextZoom });
  }

  function updateZoom(zoom: number) {
    const nextZoom = Math.max(0.4, Math.min(2.4, zoom));
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    const worldX = (centerX - camera.x) / camera.zoom;
    const worldY = (centerY - camera.y) / camera.zoom;
    setCamera({ x: centerX - worldX * nextZoom, y: centerY - worldY * nextZoom, zoom: nextZoom });
  }

  return (
    <div className="canvas-frame">
      <svg
        ref={svgRef}
        className={`diagram-canvas${connectMode ? " is-connecting" : ""}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="application"
        aria-label="Płótno diagramu. Przeciągaj elementy, aby zmienić ich położenie."
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      >
        <defs>
          <pattern
            id="grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
          >
            <circle cx="1" cy="1" r="1" fill="#dedde9" />
          </pattern>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#aaa6c4" />
          </marker>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="#fbfbfe" data-canvas-background="true" />
        <rect width={WIDTH} height={HEIGHT} fill="url(#grid)" data-canvas-background="true" />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {edges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            return <DiagramEdgeView key={edge.id} from={from} to={to} />;
          })}
          {nodes.map((node) => {
            return (
              <DiagramNodeView
                key={node.id}
                node={node}
                selected={selectedNodeId === node.id}
                connectSource={node.id === connectSourceId}
              />
            );
          })}
        </g>
      </svg>
      <div className="canvas-zoom" aria-label="Sterowanie powiększeniem">
        <button type="button" aria-label="Pomniejsz" onClick={() => updateZoom(camera.zoom - 0.1)}>
          −
        </button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <button type="button" aria-label="Powiększ" onClick={() => updateZoom(camera.zoom + 0.1)}>
          +
        </button>
      </div>
    </div>
  );
}
