import type { CurvePoint, DiagramEdge, DiagramNode } from "./model";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function nodeCenter(node: DiagramNode): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function nodeBounds(node: DiagramNode): Bounds {
  const radians = ((node.rotation ?? 0) * Math.PI) / 180;
  const width = Math.abs(node.width * Math.cos(radians)) + Math.abs(node.height * Math.sin(radians));
  const height = Math.abs(node.width * Math.sin(radians)) + Math.abs(node.height * Math.cos(radians));
  const center = nodeCenter(node);
  return { left: center.x - width / 2, top: center.y - height / 2, width, height };
}

function attachPoint(node: DiagramNode, toward: Point): Point {
  const center = nodeCenter(node);
  const rotation = ((node.rotation ?? 0) * Math.PI) / 180;
  const targetX = toward.x - center.x;
  const targetY = toward.y - center.y;
  let dx = targetX * Math.cos(rotation) + targetY * Math.sin(rotation);
  let dy = -targetX * Math.sin(rotation) + targetY * Math.cos(rotation);
  if (Math.abs(dx) + Math.abs(dy) < 0.001) dx = 1;
  const halfW = Math.max(1, node.width / 2);
  const halfH = Math.max(1, node.height / 2);
  let scale: number;
  if (node.kind === "ellipse") {
    scale = 1 / Math.sqrt((dx / halfW) ** 2 + (dy / halfH) ** 2 || 1);
  } else if (node.kind === "decision") {
    scale = 1 / (Math.abs(dx) / halfW + Math.abs(dy) / halfH || 1);
  } else {
    const xScale = dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx);
    const yScale = dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy);
    scale = Math.min(xScale, yScale);
  }
  const localX = dx * scale;
  const localY = dy * scale;
  return { x: center.x + localX * Math.cos(rotation) - localY * Math.sin(rotation), y: center.y + localX * Math.sin(rotation) + localY * Math.cos(rotation) };
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function simplifyPoints(points: Point[]): Point[] {
  return points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
}

function pathLength(points: Point[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

function segmentHitsBounds(a: Point, b: Point, bounds: Bounds): boolean {
  const left = bounds.left + 1;
  const right = bounds.left + bounds.width - 1;
  const top = bounds.top + 1;
  const bottom = bounds.top + bounds.height - 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let minimum = 0;
  let maximum = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - left, right - a.x, a.y - top, bottom - a.y];
  for (let index = 0; index < 4; index++) {
    if (Math.abs(p[index]) < 1e-9) {
      if (q[index] < 0) return false;
      continue;
    }
    const ratio = q[index] / p[index];
    if (p[index] < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return false;
  }
  return maximum > 0 && minimum < 1 && minimum <= maximum;
}

function elbowRoute(start: Point, end: Point, obstacles: DiagramNode[]): Point[] {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const relevant = obstacles
    .map((node) => ({ node, bounds: nodeBounds(node) }))
    .filter(({ node, bounds }) => node.kind !== "line" && bounds.left < right + 160 && bounds.left + bounds.width > left - 160 && bounds.top < bottom + 160 && bounds.top + bounds.height > top - 160);
  const nearestObstacles = relevant
    .map((obstacle) => {
      const centerX = obstacle.bounds.left + obstacle.bounds.width / 2;
      const centerY = obstacle.bounds.top + obstacle.bounds.height / 2;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((centerX - start.x) * dx + (centerY - start.y) * dy) / lengthSquared));
      return { ...obstacle, distance: Math.hypot(centerX - (start.x + t * dx), centerY - (start.y + t * dy)) };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 24);
  const clearance = 18;
  const xs = new Set<number>([(start.x + end.x) / 2]);
  const ys = new Set<number>([(start.y + end.y) / 2]);
  for (const { bounds } of nearestObstacles) {
    xs.add(bounds.left - clearance);
    xs.add(bounds.left + bounds.width + clearance);
    ys.add(bounds.top - clearance);
    ys.add(bounds.top + bounds.height + clearance);
  }

  const candidates: Point[][] = [];
  for (const x of xs) candidates.push([start, { x, y: start.y }, { x, y: end.y }, end]);
  for (const y of ys) candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
  candidates.push([start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end]);
  candidates.push([start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end]);

  let best = [start, end];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const raw of candidates) {
    const path = simplifyPoints(raw);
    let collisions = 0;
    for (let index = 1; index < path.length; index++) {
      for (const obstacle of nearestObstacles) if (segmentHitsBounds(path[index - 1], path[index], obstacle.bounds)) collisions++;
    }
    const bends = Math.max(0, path.length - 2);
    const score = pathLength(path) + bends * 5 + collisions * 100_000;
    if (score < bestScore) {
      best = path;
      bestScore = score;
    }
  }
  return best;
}

function pointAlongPath(points: Point[], targetRatio = 0.5): Point {
  const total = pathLength(points);
  let remaining = total * targetRatio;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (remaining <= length || index === points.length - 1) {
      const ratio = length === 0 ? 0 : remaining / length;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    remaining -= length;
  }
  return points[0] ?? { x: 0, y: 0 };
}

export function connectorGeometry(edge: DiagramEdge, from: DiagramNode, to: DiagramNode, nodes: DiagramNode[]): { d: string; labelPoint: Point } {
  const fromCenter = nodeCenter(from);
  const toCenter = nodeCenter(to);
  const start = attachPoint(from, toCenter);
  const end = attachPoint(to, fromCenter);
  const kind = edge.connectorKind ?? "straight";
  const obstacles = edge.autoRoute === false ? [] : nodes.filter((node) => node.id !== from.id && node.id !== to.id);
  const directIsBlocked = obstacles.some((node) => segmentHitsBounds(start, end, nodeBounds(node)));

  if (kind === "curve") {
    if (directIsBlocked) {
      const route = elbowRoute(start, end, obstacles);
      return { d: bezierPath(smoothCurve(route)), labelPoint: pointAlongPath(route) };
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const control1 = { x: start.x + dx * 0.42, y: start.y + dy * 0.08 };
    const control2 = { x: end.x - dx * 0.42, y: end.y - dy * 0.08 };
    const midpoint = {
      x: 0.125 * start.x + 0.375 * control1.x + 0.375 * control2.x + 0.125 * end.x,
      y: 0.125 * start.y + 0.375 * control1.y + 0.375 * control2.y + 0.125 * end.y,
    };
    return { d: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`, labelPoint: midpoint };
  }

  const points = kind === "elbow" || (kind === "straight" && directIsBlocked) ? elbowRoute(start, end, obstacles) : [start, end];
  return { d: `M ${points.map((point, index) => `${index === 0 ? "" : "L "}${point.x} ${point.y}`).join(" ")}`, labelPoint: pointAlongPath(points) };
}

export function bezierPath(points: CurvePoint[]): string {
  if (points.length === 0) return "";
  const first = points[0];
  const commands = [`M ${first.x} ${first.y}`];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const point = points[index];
    const controlOut = previous.controlOut ?? previous;
    const controlIn = point.controlIn ?? point;
    commands.push(`C ${controlOut.x} ${controlOut.y}, ${controlIn.x} ${controlIn.y}, ${point.x} ${point.y}`);
  }
  return commands.join(" ");
}

export function smoothCurve(points: Point[]): CurvePoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ ...points[0], controlIn: { ...points[0] }, controlOut: { ...points[0] } }];
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangentX = (next.x - previous.x) / 6;
    const tangentY = (next.y - previous.y) / 6;
    return {
      x: point.x,
      y: point.y,
      controlIn: { x: point.x - tangentX, y: point.y - tangentY },
      controlOut: { x: point.x + tangentX, y: point.y + tangentY },
    };
  });
}
