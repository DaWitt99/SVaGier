import type { CurvePoint, DiagramNode } from "./model";
import type { Point } from "./geometry";

export interface StrokeBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type RecognizedStrokeKind = "line" | "rectangle" | "ellipse" | "diamond";

export interface RecognizedStroke {
  kind: RecognizedStrokeKind;
  bounds: StrokeBounds;
  points: CurvePoint[];
  closed: boolean;
}

function getBounds(points: Point[]): StrokeBounds {
  if (points.length === 0) return { left: 0, top: 0, width: 1, height: 1 };
  let left = points[0].x;
  let top = points[0].y;
  let right = points[0].x;
  let bottom = points[0].y;
  for (let index = 1; index < points.length; index++) {
    left = Math.min(left, points[index].x);
    top = Math.min(top, points[index].y);
    right = Math.max(right, points[index].x);
    bottom = Math.max(bottom, points[index].y);
  }
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polyline(points: Point[], closed = false): CurvePoint[] {
  const result = points.map((point) => ({ ...point }));
  if (closed && result.length > 0) result.push({ ...result[0] });
  return result;
}

function ellipsePath(bounds: StrokeBounds): CurvePoint[] {
  const left = bounds.left;
  const top = bounds.top;
  const right = left + bounds.width;
  const bottom = top + bounds.height;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  const k = 0.5522847498;
  return [
    { x: right, y: centerY, controlIn: { x: right, y: centerY - k * ry }, controlOut: { x: right, y: centerY + k * ry } },
    { x: centerX, y: bottom, controlIn: { x: centerX + k * rx, y: bottom }, controlOut: { x: centerX - k * rx, y: bottom } },
    { x: left, y: centerY, controlIn: { x: left, y: centerY + k * ry }, controlOut: { x: left, y: centerY - k * ry } },
    { x: centerX, y: top, controlIn: { x: centerX - k * rx, y: top }, controlOut: { x: centerX + k * rx, y: top } },
    { x: right, y: centerY, controlIn: { x: right, y: centerY - k * ry }, controlOut: { x: right, y: centerY + k * ry } },
  ];
}

function canonicalStroke(kind: Exclude<RecognizedStrokeKind, "line">, bounds: StrokeBounds): CurvePoint[] {
  const { left, top, width, height } = bounds;
  if (kind === "rectangle") return polyline([
    { x: left, y: top }, { x: left + width, y: top },
    { x: left + width, y: top + height }, { x: left, y: top + height },
  ], true);
  if (kind === "diamond") return polyline([
    { x: left + width / 2, y: top }, { x: left + width, y: top + height / 2 },
    { x: left + width / 2, y: top + height }, { x: left, y: top + height / 2 },
  ], true);
  return ellipsePath(bounds);
}

export function lineStroke(start: Point, end: Point): RecognizedStroke {
  const bounds = getBounds([start, end]);
  return { kind: "line", bounds, points: polyline([start, end]), closed: false };
}

export function snapRecognizedStroke(stroke: RecognizedStroke, spacing: number): RecognizedStroke {
  const snap = (value: number) => Math.round(value / spacing) * spacing;
  if (stroke.kind === "line") {
    const start = { x: snap(stroke.points[0].x), y: snap(stroke.points[0].y) };
    const end = { x: snap(stroke.points[1].x), y: snap(stroke.points[1].y) };
    return lineStroke(start, end);
  }
  const left = snap(stroke.bounds.left);
  const top = snap(stroke.bounds.top);
  const right = snap(stroke.bounds.left + stroke.bounds.width);
  const bottom = snap(stroke.bounds.top + stroke.bounds.height);
  const bounds = { left, top, width: Math.max(spacing, right - left), height: Math.max(spacing, bottom - top) };
  return { kind: stroke.kind, bounds, points: canonicalStroke(stroke.kind, bounds), closed: true };
}

export function stabilizeStroke(points: Point[], amount: number): Point[] {
  if (points.length < 4 || amount <= 0) return points.map((point) => ({ ...point }));
  const radius = Math.min(5, Math.round(amount / 18));
  if (radius === 0) return points.map((point) => ({ ...point }));
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return { ...point };
    let x = 0;
    let y = 0;
    let weightSum = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const sample = points[Math.max(0, Math.min(points.length - 1, index + offset))];
      const weight = radius + 1 - Math.abs(offset);
      x += sample.x * weight;
      y += sample.y * weight;
      weightSum += weight;
    }
    return { x: x / weightSum, y: y / weightSum };
  });
}

export function recognizeStroke(points: Point[]): RecognizedStroke | null {
  if (points.length < 6) return null;
  const bounds = getBounds(points);
  const { left, top, width, height } = bounds;
  const maxDimension = Math.max(width, height);
  const minDimension = Math.min(width, height);
  if (maxDimension < 24 || minDimension < 16) return null;

  const isClosed = pointDistance(points[0], points[points.length - 1]) <= Math.max(14, maxDimension * 0.14);
  if (isClosed) {
    const body = points.slice(0, -1);
    const normalized = body.map((point) => ({ x: (point.x - left) / width, y: (point.y - top) / height }));
    const rectangleError = normalized.reduce((sum, point) => sum + Math.min(point.x, 1 - point.x, point.y, 1 - point.y), 0) / normalized.length;
    const sideCounts = [0, 0, 0, 0];
    for (const point of normalized) {
      if (point.y < 0.18) sideCounts[0]++;
      if (point.x > 0.82) sideCounts[1]++;
      if (point.y > 0.82) sideCounts[2]++;
      if (point.x < 0.18) sideCounts[3]++;
    }
    if (rectangleError < 0.105 && sideCounts.every((count) => count >= 2)) {
      return { kind: "rectangle", bounds, points: canonicalStroke("rectangle", bounds), closed: true };
    }

    const diamondError = normalized.reduce((sum, point) => sum + Math.abs(Math.abs(point.x - 0.5) + Math.abs(point.y - 0.5) - 0.5), 0) / normalized.length;
    const diamondExtents = [
      normalized.some((point) => point.y < 0.15 && Math.abs(point.x - 0.5) < 0.22),
      normalized.some((point) => point.x > 0.85 && Math.abs(point.y - 0.5) < 0.22),
      normalized.some((point) => point.y > 0.85 && Math.abs(point.x - 0.5) < 0.22),
      normalized.some((point) => point.x < 0.15 && Math.abs(point.y - 0.5) < 0.22),
    ];
    if (diamondError < 0.105 && diamondExtents.every(Boolean)) {
      return { kind: "diamond", bounds, points: canonicalStroke("diamond", bounds), closed: true };
    }

    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const ellipseError = body.reduce((sum, point) => {
      const radial = Math.sqrt(((point.x - centerX) / (width / 2)) ** 2 + ((point.y - centerY) / (height / 2)) ** 2);
      return sum + Math.abs(radial - 1);
    }, 0) / body.length;
    if (ellipseError < 0.16 && width / height > 0.45 && width / height < 2.2) {
      return { kind: "ellipse", bounds, points: canonicalStroke("ellipse", bounds), closed: true };
    }
    return null;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const length = pointDistance(start, end);
  if (length < 24 || minDimension / maxDimension > 0.14) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const squaredLength = dx * dx + dy * dy;
  const maxDeviation = points.reduce((maximum, point) => {
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squaredLength));
    const projection = { x: start.x + t * dx, y: start.y + t * dy };
    return Math.max(maximum, pointDistance(point, projection));
  }, 0);
  return maxDeviation / length < 0.055 ? lineStroke(start, end) : null;
}

function rotate(point: Point, center: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
}

function nodeWorldPoint(node: DiagramNode, point: Point): Point {
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  return rotate({ x: node.x + point.x, y: node.y + point.y }, center, node.rotation ?? 0);
}

function flattenStroke(node: DiagramNode): Point[] {
  const points = node.pathPoints ?? [];
  if (points.length < 2) return points.map((point) => nodeWorldPoint(node, point));
  const result = [nodeWorldPoint(node, points[0])];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const controlOut = previous.controlOut ?? previous;
    const controlIn = current.controlIn ?? current;
    const chord = Math.hypot(current.x - previous.x, current.y - previous.y);
    const controlLength = Math.hypot(controlOut.x - previous.x, controlOut.y - previous.y) + Math.hypot(current.x - controlIn.x, current.y - controlIn.y);
    const steps = Math.max(8, Math.min(80, Math.ceil(Math.max(chord, controlLength) / 4)));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const inverse = 1 - t;
      const point = {
        x: inverse ** 3 * previous.x + 3 * inverse ** 2 * t * controlOut.x + 3 * inverse * t ** 2 * controlIn.x + t ** 3 * current.x,
        y: inverse ** 3 * previous.y + 3 * inverse ** 2 * t * controlOut.y + 3 * inverse * t ** 2 * controlIn.y + t ** 3 * current.y,
      };
      result.push(nodeWorldPoint(node, point));
    }
  }
  return result;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return pointDistance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return pointDistance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

function pointIsErased(point: Point, eraser: Point[], radius: number): boolean {
  if (eraser.length === 1) return pointDistance(point, eraser[0]) <= radius;
  for (let index = 1; index < eraser.length; index++) {
    if (distanceToSegment(point, eraser[index - 1], eraser[index]) <= radius) return true;
  }
  return false;
}

function buildStrokeNode(node: DiagramNode, worldPoints: Point[], id: string, keepRelations: boolean): DiagramNode {
  const bounds = getBounds(worldPoints);
  const local = worldPoints.map((point) => ({ x: point.x - bounds.left, y: point.y - bounds.top }));
  return {
    ...node,
    id,
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    pathPoints: local.map((point) => ({ ...point, controlIn: { ...point }, controlOut: { ...point } })),
    closedPath: false,
    lineArrow: keepRelations ? node.lineArrow : false,
    ...(keepRelations ? {} : {
      parentId: undefined,
      parentConnection: undefined,
      siblingOrder: undefined,
      collapsed: undefined,
      notes: undefined,
      comments: undefined,
      labels: undefined,
      priority: undefined,
      flashcards: undefined,
      linkUrl: undefined,
    }),
  };
}

export function eraseStrokeAt(node: DiagramNode, eraser: Point[], radius: number, createId: () => string): DiagramNode[] | null {
  if (node.kind !== "freehand" || !node.pathPoints || eraser.length === 0) return null;
  const effectiveRadius = Math.max(1, radius + (node.strokeWidth ?? 3) / 2);
  const eraserBounds = getBounds(eraser);
  const radians = (node.rotation ?? 0) * Math.PI / 180;
  const halfWidth = node.width / 2;
  const halfHeight = node.height / 2;
  const rotatedHalfWidth = Math.abs(Math.cos(radians)) * halfWidth + Math.abs(Math.sin(radians)) * halfHeight;
  const rotatedHalfHeight = Math.abs(Math.sin(radians)) * halfWidth + Math.abs(Math.cos(radians)) * halfHeight;
  const centerX = node.x + halfWidth;
  const centerY = node.y + halfHeight;
  const strokeBounds = {
    left: centerX - rotatedHalfWidth,
    top: centerY - rotatedHalfHeight,
    right: centerX + rotatedHalfWidth,
    bottom: centerY + rotatedHalfHeight,
  };
  if (strokeBounds.right < eraserBounds.left - effectiveRadius
    || strokeBounds.left > eraserBounds.left + eraserBounds.width + effectiveRadius
    || strokeBounds.bottom < eraserBounds.top - effectiveRadius
    || strokeBounds.top > eraserBounds.top + eraserBounds.height + effectiveRadius) return null;

  const sampled = flattenStroke(node);
  let removedAny = false;
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (const point of sampled) {
    if (pointIsErased(point, eraser, effectiveRadius)) {
      removedAny = true;
      if (run.length >= 2) runs.push(run);
      run = [];
    } else run.push(point);
  }
  if (!removedAny) return null;
  if (run.length >= 2) runs.push(run);
  if (runs.length === 0) return [];
  return runs.map((points, index) => {
    const segment = buildStrokeNode(node, points, index === 0 ? node.id : createId(), index === 0);
    const keepsArrowEnd = pointDistance(points[points.length - 1], sampled[sampled.length - 1]) < 0.01;
    return { ...segment, lineArrow: Boolean(node.lineArrow && keepsArrowEnd) };
  });
}
