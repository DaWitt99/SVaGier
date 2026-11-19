import type { DiagramDocument, DiagramNode } from "./model";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function center(node: DiagramNode) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function renderNode(node: DiagramNode): string {
  const titleY = node.kind === "class" ? node.y + 30 : node.y + node.height / 2 - 8;
  const detailY = node.kind === "class" ? node.y + 67 : node.y + node.height / 2 + 20;
  const title = escapeXml(node.title);
  const detailLines = node.detail.split("\n").map(escapeXml);
  let shape: string;

  if (node.kind === "decision") {
    const points = [
      `${node.x + node.width / 2},${node.y}`,
      `${node.x + node.width},${node.y + node.height / 2}`,
      `${node.x + node.width / 2},${node.y + node.height}`,
      `${node.x},${node.y + node.height / 2}`,
    ].join(" ");
    shape = `<polygon points="${points}" fill="#fff" stroke="#9b8afb" stroke-width="2"/>`;
  } else {
    shape = `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.kind === "class" ? 12 : 16}" fill="${node.id === "idea" ? "#f0edff" : "#fff"}" stroke="${node.id === "idea" ? "#8069ea" : "#d8d8e7"}" stroke-width="2"/>`;
    if (node.kind === "class") {
      shape += `<path d="M ${node.x} ${node.y + 48} H ${node.x + node.width}" stroke="#e6e5ee" stroke-width="1.5"/>`;
    }
  }

  const detail = detailLines
    .map((line, index) => `<tspan x="${node.x + node.width / 2}" dy="${index === 0 ? 0 : 18}">${line}</tspan>`)
    .join("");

  return `<g font-family="Inter, Arial, sans-serif" text-anchor="middle">${shape}<text x="${node.x + node.width / 2}" y="${titleY}" fill="#25243a" font-size="16" font-weight="650">${title}</text><text x="${node.x + node.width / 2}" y="${detailY}" fill="#74738a" font-size="12">${detail}</text></g>`;
}

export function createSvgMarkup(document: DiagramDocument): string {
  const nodeMap = new Map(document.nodes.map((node) => [node.id, node]));
  const margin = 80;
  const left = document.nodes.length ? Math.min(...document.nodes.map((node) => node.x)) - margin : -margin;
  const top = document.nodes.length ? Math.min(...document.nodes.map((node) => node.y)) - margin : -margin;
  const right = document.nodes.length ? Math.max(...document.nodes.map((node) => node.x + node.width)) + margin : margin;
  const bottom = document.nodes.length ? Math.max(...document.nodes.map((node) => node.y + node.height)) + margin : margin;
  const width = Math.max(right - left, 640);
  const height = Math.max(bottom - top, 420);
  const edges = document.edges
    .map((edge) => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) return "";
      const start = center(from);
      const end = center(to);
      return `<path d="M ${start.x} ${start.y} L ${end.x} ${end.y}" fill="none" stroke="#c6c3d9" stroke-width="2" marker-end="url(#arrowhead)"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}" role="img" aria-label="${escapeXml(document.title)}"><defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill="#aaa6c4"/></marker></defs><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#fbfbfe"/>${edges}${document.nodes.map(renderNode).join("")}</svg>`;
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
