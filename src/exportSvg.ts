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

function renderNode(node: DiagramNode): string {
  const center = nodeCenter(node);
  const fill = escapeXml(node.fill ?? (node.id === "idea" ? "#f0edff" : "#ffffff"));
  const stroke = escapeXml(node.stroke ?? (node.id === "idea" ? "#8069ea" : "#d8d8e7"));
  const strokeWidth = node.strokeWidth ?? 1.5;
  const anchor = node.textAlign === "left" ? "start" : node.textAlign === "right" ? "end" : "middle";
  const textX = node.textAlign === "left" ? node.x + 12 : node.textAlign === "right" ? node.x + node.width - 12 : center.x;
  const titleY = node.kind === "class" ? node.y + 30 : node.kind === "actor" ? node.y + node.height - 18 : center.y - 8;
  const detailY = node.kind === "class" ? node.y + 70 : node.kind === "actor" ? node.y + node.height - 2 : center.y + 18;
  const titleSize = node.fontSize ?? (node.kind === "text" ? 20 : 15);
  const titleLines = node.title.split("\n");
  const detailLines = node.detail ? node.detail.split("\n") : [];
  const title = renderText(node.kind === "text" ? [...titleLines, ...detailLines] : titleLines, node.kind === "text" ? textX : textX, node.kind === "text" ? node.y + titleSize : titleY, {
    fill: node.textColor ?? "#302f43",
    size: titleSize,
    weight: node.fontWeight ?? (node.kind === "text" ? "normal" : "650"),
    style: node.fontStyle ?? "normal",
    anchor,
  });
  const detail = node.kind === "text" || node.kind === "image" || node.kind === "freehand" || node.kind === "line" ? "" : renderText(detailLines, textX, detailY, {
    fill: node.textColor ?? "#858398",
    size: node.fontSize ? Math.max(9, node.fontSize - 4) : 11,
    weight: "normal",
    style: "normal",
    anchor,
  });

  let shape = "";
  if (node.kind === "decision") {
    const points = [
      `${center.x},${node.y}`,
      `${node.x + node.width},${center.y}`,
      `${center.x},${node.y + node.height}`,
      `${node.x},${center.y}`,
    ].join(" ");
    shape = `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  } else if (node.kind === "ellipse") {
    shape = `<ellipse cx="${center.x}" cy="${center.y}" rx="${node.width / 2}" ry="${node.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  } else if (node.kind === "line") {
    shape = `<line x1="${node.x}" y1="${center.y}" x2="${node.x + node.width}" y2="${center.y}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  } else if (node.kind === "text") {
    shape = "";
  } else if (node.kind === "freehand") {
    shape = `<path d="${bezierPath(node.pathPoints ?? [])}" transform="translate(${node.x} ${node.y})" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (node.kind === "image") {
    const href = escapeXml(node.imageData ?? node.imageSrc ?? "");
    shape = `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="6" fill="#fff" stroke="${stroke}" stroke-width="${strokeWidth}"/><image x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" href="${href}" preserveAspectRatio="xMidYMid meet"/>`;
  } else if (node.kind === "database") {
    shape = `<path d="M ${node.x} ${node.y + 18} V ${node.y + node.height - 18} C ${node.x} ${node.y + node.height + 2}, ${node.x + node.width} ${node.y + node.height + 2}, ${node.x + node.width} ${node.y + node.height - 18} V ${node.y + 18}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><ellipse cx="${center.x}" cy="${node.y + 18}" rx="${node.width / 2}" ry="18" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><path d="M ${node.x} ${node.y + 18} C ${node.x} ${node.y + 42}, ${node.x + node.width} ${node.y + 42}, ${node.x + node.width} ${node.y + 18}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  } else if (node.kind === "document") {
    shape = `<path d="M ${node.x} ${node.y} H ${node.x + node.width} V ${node.y + node.height - 14} Q ${node.x + node.width * 0.75} ${node.y + node.height + 8} ${center.x} ${node.y + node.height - 8} Q ${node.x + node.width * 0.25} ${node.y + node.height - 24} ${node.x} ${node.y + node.height - 10} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  } else if (node.kind === "actor") {
    const legEnd = node.y + node.height - 38;
    shape = `<g fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"><circle cx="${center.x}" cy="${node.y + 24}" r="14"/><path d="M ${center.x} ${node.y + 38} V ${node.y + 72} M ${center.x - 26} ${node.y + 50} H ${center.x + 26} M ${center.x} ${node.y + 72} L ${center.x - 22} ${legEnd} M ${center.x} ${node.y + 72} L ${center.x + 22} ${legEnd}"/></g>`;
  } else {
    shape = `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.kind === "class" ? 12 : 16}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    if (node.kind === "class") shape += `<path d="M ${node.x} ${node.y + 48} H ${node.x + node.width}" fill="none" stroke="#e6e5ee" stroke-width="1.5"/>`;
  }

  const rotation = node.rotation ? ` transform="rotate(${node.rotation} ${center.x} ${center.y})"` : "";
  const priorityColor = node.priority === "high" ? "#df6a72" : node.priority === "medium" ? "#e2a843" : node.priority === "low" ? "#6fa8d8" : null;
  const badges = `${priorityColor ? `<circle cx="${node.x + node.width - 12}" cy="${node.y + 12}" r="5" fill="${priorityColor}" stroke="#fff" stroke-width="2"/>` : ""}${node.labels?.length ? `<text x="${center.x}" y="${node.y + node.height - 7}" fill="#88859a" font-size="9" text-anchor="middle">${escapeXml(node.labels.slice(0, 2).join(" · "))}</text>` : ""}`;
  const group = `<g font-family="Inter, Arial, sans-serif"${rotation}>${shape}${node.kind === "image" || node.kind === "freehand" || node.kind === "line" ? "" : `${title}${detail}`}${badges}</g>`;
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
