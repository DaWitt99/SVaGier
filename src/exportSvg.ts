import type { DiagramDocument, DiagramNode } from "./model";
import { bezierPath, connectorGeometry, nodeBounds, nodeCenter } from "./geometry";
import { getVisibleMindMapNodes } from "./mindmapLayout";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderText(lines: string[], x: number, y: number, options: { fill: string; size: number; weight: string; style: string; anchor: string }): string {
  if (lines.length === 0) return "";
  const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : options.size * 1.25}">${escapeXml(line)}</tspan>`).join("");
  return `<text x="${x}" y="${y}" fill="${escapeXml(options.fill)}" font-size="${options.size}" font-weight="${options.weight}" font-style="${options.style}" text-anchor="${options.anchor}">${tspans}</text>`;
}

function renderShape(node: DiagramNode, fill: string, stroke: string, strokeWidth: number): string {
  const x = node.x;
  const y = node.y;
  const w = node.width;
  const h = node.height;
  const right = x + w;
  const bottom = y + h;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rect = (rx = 14) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  const polygon = (points: string) => `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

  if (node.kind === "decision" || node.kind === "preparation") {
    const inset = node.kind === "decision" ? 0 : w * 0.18;
    return polygon(`${cx},${y} ${right - inset},${cy} ${cx},${bottom} ${x + inset},${cy}`);
  }
  if (node.kind === "ellipse" || node.kind === "useCase" || node.kind === "connector") return `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "pill") return rect(h / 2);
  if (node.kind === "hexagon") return polygon(`${x + w * 0.22},${y} ${x + w * 0.78},${y} ${right},${cy} ${x + w * 0.78},${bottom} ${x + w * 0.22},${bottom} ${x},${cy}`);
  if (node.kind === "parallelogram" || node.kind === "inputOutput") return polygon(`${x + w * 0.2},${y} ${right},${y} ${right - w * 0.2},${bottom} ${x},${bottom}`);
  if (node.kind === "manualInput") return polygon(`${x},${y + h * 0.2} ${right},${y} ${right},${bottom} ${x},${bottom}`);
  if (node.kind === "line") return `<line x1="${x}" y1="${cy}" x2="${right}" y2="${cy}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "text") return "";
  if (node.kind === "freehand") return `<path d="${bezierPath(node.pathPoints ?? [])}" transform="translate(${x} ${y})" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (node.kind === "image") {
    const href = escapeXml(node.imageData ?? node.imageSrc ?? "");
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#fff" stroke="${stroke}" stroke-width="${strokeWidth}"/><image x="${x}" y="${y}" width="${w}" height="${h}" href="${href}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  if (node.kind === "cloud") return `<path d="M ${x + w * 0.2} ${y + h * 0.8} C ${x - w * 0.02} ${y + h * 0.78}, ${x - w * 0.02} ${y + h * 0.48}, ${x + w * 0.15} ${y + h * 0.4} C ${x + w * 0.12} ${y + h * 0.08}, ${x + w * 0.44} ${y - h * 0.02}, ${x + w * 0.54} ${y + h * 0.25} C ${x + w * 0.75} ${y + h * 0.08}, ${x + w * 0.98} ${y + h * 0.28}, ${x + w * 0.87} ${y + h * 0.48} C ${x + w * 1.08} ${y + h * 0.62}, ${x + w * 0.94} ${y + h * 0.88}, ${x + w * 0.75} ${y + h * 0.82} C ${x + w * 0.59} ${y + h * 1.05}, ${x + w * 0.36} ${y + h * 0.96}, ${x + w * 0.32} ${y + h * 0.82} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "note") return `<path d="M ${x} ${y} H ${right - 22} L ${right} ${y + 22} V ${bottom} H ${x} Z M ${right - 22} ${y} V ${y + 22} H ${right}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "callout") return `<path d="M ${x} ${y} H ${right} V ${bottom - 24} H ${x + w * 0.36} L ${x + w * 0.24} ${bottom} L ${x + w * 0.22} ${bottom - 24} H ${x} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "subprocess") return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><path d="M ${x + 18} ${y} V ${bottom} M ${right - 18} ${y} V ${bottom}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "offPage") return polygon(`${x},${y} ${right},${y} ${right},${y + h * 0.68} ${cx},${bottom} ${x},${y + h * 0.68}`);
  if (node.kind === "multiDocument") return `<path d="M ${x + 16} ${y + 10} H ${right - 8} V ${bottom - 26} Q ${x + w * 0.65} ${bottom - 7} ${x + w * 0.4} ${bottom - 23} Q ${x + w * 0.18} ${bottom - 8} ${x + 16} ${bottom - 24} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><path d="M ${x + 8} ${y + 5} H ${right - 16} V ${bottom - 30} M ${x} ${y} H ${right - 24} V ${bottom - 35} M ${x + w * 0.4} ${bottom - 23} Q ${x + w * 0.6} ${bottom - 6} ${x + w * 0.82} ${bottom - 25}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "database") return `<path d="M ${x} ${y + 18} V ${bottom - 18} C ${x} ${bottom + 2}, ${right} ${bottom + 2}, ${right} ${bottom - 18} V ${y + 18}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><ellipse cx="${cx}" cy="${y + 18}" rx="${w / 2}" ry="18" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><path d="M ${x} ${y + 18} C ${x} ${y + 42}, ${right} ${y + 42}, ${right} ${y + 18}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "document") return `<path d="M ${x} ${y} H ${right} V ${bottom - 14} Q ${x + w * 0.75} ${bottom + 8} ${cx} ${bottom - 8} Q ${x + w * 0.25} ${bottom - 24} ${x} ${bottom - 10} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "actor") {
    const legEnd = bottom - 38;
    return `<g fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"><circle cx="${cx}" cy="${y + 24}" r="14"/><path d="M ${cx} ${y + 38} V ${y + 72} M ${cx - 26} ${y + 50} H ${cx + 26} M ${cx} ${y + 72} L ${cx - 22} ${legEnd} M ${cx} ${y + 72} L ${cx + 22} ${legEnd}"/></g>`;
  }
  if (node.kind === "package") return `<path d="M ${x} ${y + 26} H ${x + 70} L ${x + 85} ${y + 43} H ${right} V ${bottom} H ${x} Z M ${x} ${y + 43} H ${x + 85}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "component") return `<rect x="${x + 15}" y="${y}" width="${w - 15}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><rect x="${x}" y="${y + h * 0.34}" width="22" height="18" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><rect x="${x}" y="${y + h * 0.54}" width="22" height="18" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "artifact") return `<path d="M ${x} ${y} H ${right - 24} L ${right} ${y + 24} V ${bottom} H ${x} Z M ${right - 24} ${y} V ${y + 24} H ${right}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "deploymentNode") return `<path d="M ${x + 25} ${y + 25} L ${cx} ${y} L ${right - 25} ${y + 25} L ${cx} ${y + 50} Z M ${x + 25} ${y + 25} V ${bottom - 25} L ${cx} ${bottom} V ${y + 50} M ${right - 25} ${y + 25} V ${bottom - 25} L ${cx} ${bottom}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "boundary" || node.kind === "control" || node.kind === "entity") return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><path d="M ${x} ${y + 44} H ${right}" fill="none" stroke="${stroke}"/><circle cx="${x + 20}" cy="${y + 21}" r="12" fill="#fff" stroke="${stroke}"/><text x="${x + 20}" y="${y + 25}" fill="#77748e" font-size="9" font-weight="700" text-anchor="middle">${node.kind === "boundary" ? "B" : node.kind === "control" ? "C" : "E"}</text>`;
  if (node.kind === "initialState") return `<circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) * 0.34}" fill="${escapeXml(node.fill ?? "#38364c")}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "finalState") return `<circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) * 0.38}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) * 0.25}" fill="${escapeXml(node.fill ?? "#38364c")}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "forkJoin") return `<rect x="${x}" y="${cy - Math.max(5, h * 0.14)}" width="${w}" height="${Math.max(10, h * 0.28)}" rx="5" fill="${escapeXml(node.fill ?? node.stroke ?? "#514f66")}" stroke="${stroke}"/>`;
  if (node.kind === "lifeline") return `<rect x="${x}" y="${y}" width="${w}" height="42" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><line x1="${cx}" x2="${cx}" y1="${y + 42}" y2="${bottom}" stroke="${stroke}" stroke-dasharray="5 5"/>`;
  if (node.kind === "activation") return `<rect x="${cx - Math.min(w * 0.25, 17)}" y="${y}" width="${Math.min(w * 0.5, 34)}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "providedInterface") return `<line x1="${x + 15}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${stroke}"/><circle cx="${cx + 16}" cy="${cy}" r="${Math.min(w, h) * 0.32}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  if (node.kind === "requiredInterface") return `<line x1="${x + 15}" y1="${cy}" x2="${cx + 12}" y2="${cy}" stroke="${stroke}"/><path d="M ${cx + 12} ${cy - h * 0.28} A ${h * 0.28} ${h * 0.28} 0 0 0 ${cx + 12} ${cy + h * 0.28}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  const radius = node.kind === "class" || node.kind === "interface" || node.kind === "abstractClass" ? 8 : 16;
  return `${rect(radius)}${node.kind === "class" || node.kind === "interface" || node.kind === "abstractClass" ? `<path d="M ${x} ${y + 48} H ${right}" fill="none" stroke="#e6e5ee" stroke-width="1.5"/>` : ""}`;
}

function renderNode(node: DiagramNode): string {
  const center = nodeCenter(node);
  const fill = escapeXml(node.fill ?? (node.id === "idea" ? "#f0edff" : "#ffffff"));
  const stroke = escapeXml(node.stroke ?? (node.id === "idea" ? "#8069ea" : "#d8d8e7"));
  const strokeWidth = node.strokeWidth ?? 1.5;
  const umlClassifier = ["class", "interface", "abstractClass", "boundary", "control", "entity"].includes(node.kind);
  const labelBelowSymbol = ["connector", "initialState", "finalState", "providedInterface", "requiredInterface"].includes(node.kind);
  const anchor = node.kind === "boundary" || node.kind === "control" || node.kind === "entity" ? "start" : node.textAlign === "left" ? "start" : node.textAlign === "right" ? "end" : "middle";
  const textX = node.kind === "boundary" || node.kind === "control" || node.kind === "entity" ? node.x + 40 : node.textAlign === "left" ? node.x + 12 : node.textAlign === "right" ? node.x + node.width - 12 : center.x;
  const titleY = umlClassifier ? node.y + 30 : node.kind === "actor" ? node.y + node.height - 18 : node.kind === "lifeline" ? node.y + 26 : labelBelowSymbol ? node.y + node.height + 17 : center.y - 8;
  const detailY = umlClassifier ? node.y + 70 : node.kind === "actor" ? node.y + node.height - 2 : labelBelowSymbol ? node.y + node.height + 34 : center.y + 18;
  const titleSize = node.fontSize ?? (node.kind === "text" ? 20 : 15);
  const titleLines = node.title.split("\n");
  const detailLines = node.detail ? node.detail.split("\n") : [];
  const hideCaption = node.kind === "line" || node.kind === "forkJoin" || node.kind === "activation";
  const title = hideCaption ? "" : renderText(node.kind === "text" ? [...titleLines, ...detailLines] : titleLines, textX, node.kind === "text" ? node.y + titleSize : titleY, {
    fill: node.textColor ?? "#302f43",
    size: titleSize,
    weight: node.fontWeight ?? (node.kind === "text" ? "normal" : "650"),
    style: node.fontStyle ?? (node.kind === "abstractClass" ? "italic" : "normal"),
    anchor,
  });
  const detail = node.kind === "text" || node.kind === "image" || node.kind === "freehand" || hideCaption ? "" : renderText(detailLines, textX, detailY, {
    fill: node.textColor ?? "#858398",
    size: node.fontSize ? Math.max(9, node.fontSize - 4) : 11,
    weight: "normal",
    style: "normal",
    anchor,
  });

  const shape = renderShape(node, fill, stroke, strokeWidth);

  const rotation = node.rotation ? ` transform="rotate(${node.rotation} ${center.x} ${center.y})"` : "";
  const priorityColor = node.priority === "high" ? "#df6a72" : node.priority === "medium" ? "#e2a843" : node.priority === "low" ? "#6fa8d8" : null;
  const badges = `${priorityColor ? `<circle cx="${node.x + node.width - 12}" cy="${node.y + 12}" r="5" fill="${priorityColor}" stroke="#fff" stroke-width="2"/>` : ""}${node.labels?.length ? `<text x="${center.x}" y="${node.y + node.height - 7}" fill="#88859a" font-size="9" text-anchor="middle">${escapeXml(node.labels.slice(0, 2).join(" · "))}</text>` : ""}`;
  const group = `<g font-family="Inter, Arial, sans-serif"${rotation}>${shape}${node.kind === "image" || node.kind === "freehand" ? "" : `${title}${detail}`}${badges}</g>`;
  return node.linkUrl ? `<a href="${escapeXml(node.linkUrl)}" target="_blank">${group}</a>` : group;
}

export function createSvgMarkup(document: DiagramDocument): string {
  const visibleNodes = getVisibleMindMapNodes(document.nodes);
  const nodeMap = new Map(visibleNodes.map((node) => [node.id, node]));
  const margin = 80;
  const bounds = visibleNodes.map(nodeBounds);
  const left = bounds.length ? Math.min(...bounds.map((box) => box.left)) - margin : -margin;
  const top = bounds.length ? Math.min(...bounds.map((box) => box.top)) - margin : -margin;
  const right = bounds.length ? Math.max(...bounds.map((box) => box.left + box.width)) + margin : margin;
  const bottom = bounds.length ? Math.max(...bounds.map((box) => box.top + box.height)) + margin : margin;
  const width = Math.max(right - left, 640);
  const height = Math.max(bottom - top, 420);
  const treeEdges = visibleNodes.flatMap((node) => {
    const parent = node.parentId ? nodeMap.get(node.parentId) : null;
    if (!parent) return [];
    const geometry = connectorGeometry({ id: `tree-${node.id}`, from: parent.id, to: node.id, connectorKind: "curve", autoRoute: false, arrowEnd: false }, parent, node, visibleNodes);
    const stroke = escapeXml(node.stroke ?? "#bdb6da");
    return [`<path d="${geometry.d}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>`];
  }).join("");
  const edges = document.edges.map((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return "";
    const geometry = connectorGeometry(edge, from, to, visibleNodes);
    const start = edge.arrowStart ? " marker-start=\"url(#arrowhead)\"" : "";
    const end = edge.arrowEnd === false ? "" : " marker-end=\"url(#arrowhead)\"";
    const label = edge.label ? `<text x="${geometry.labelPoint.x}" y="${geometry.labelPoint.y - 8}" fill="#625d7f" font-size="12" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="5">${escapeXml(edge.label)}</text>` : "";
    return `<g><path d="${geometry.d}" fill="none" stroke="#c6c3d9" stroke-width="2"${start}${end}/>${label}</g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}" role="img" aria-label="${escapeXml(document.title)}"><defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill="#aaa6c4"/></marker></defs><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#fbfbfe"/>${treeEdges}${edges}${visibleNodes.map(renderNode).join("")}</svg>`;
}

export function downloadSvg(document: DiagramDocument): void {
  const blob = new Blob([createSvgMarkup(document)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  const filename = document.title.trim().replaceAll(/[^\p{L}\p{N}-]+/gu, "-").replaceAll(/^-|-$/g, "");
  anchor.href = url;
  anchor.download = `${filename || "diagram"}.svg`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
