const SVG_NS = 'http://www.w3.org/2000/svg';

export const PALETTE = ['#4e9bff', '#2cbb4b', '#e0a93b', '#d9534f', '#a479e0', '#3bbac0', '#e06aa0', '#9bc24b'];

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

export interface LineChartOptions {
  width?: number;
  height?: number;
  yMax?: number;
  yLabel?: string;
  yFormat?: (n: number) => string;
}

/** A minimal multi-series line chart rendered as inline SVG (no charting library). */
export function lineChart(title: string, series: LineSeries[], opts: LineChartOptions = {}): HTMLElement {
  const width = opts.width ?? 520;
  const height = opts.height ?? 160;
  const padL = 44;
  const padR = 10;
  const padT = 10;
  const padB = 20;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxLen = Math.max(1, ...series.map((s) => s.values.length));
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values));
  const yMax = niceMax(opts.yMax ?? dataMax);
  const fmt = opts.yFormat ?? ((n) => String(Math.round(n)));

  const wrap = document.createElement('div');
  wrap.className = 'albert-chart';
  wrap.appendChild(chartTitle(title));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'albert-chart-svg');
  svg.setAttribute('preserveAspectRatio', 'none');

  // y gridlines + labels
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (plotH * i) / gridLines;
    svg.appendChild(line(padL, y, width - padR, y, 'albert-chart-grid'));
    const value = yMax * (1 - i / gridLines);
    svg.appendChild(text(padL - 6, y + 3, fmt(value), 'albert-chart-axis', 'end'));
  }

  const xStep = maxLen > 1 ? plotW / (maxLen - 1) : 0;
  for (const s of series) {
    if (s.values.length === 0) continue;
    const points = s.values
      .map((v, i) => `${padL + i * xStep},${padT + plotH * (1 - clamp01(v / yMax))}`)
      .join(' ');
    const poly = document.createElementNS(SVG_NS, 'polyline');
    poly.setAttribute('points', points);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', s.color);
    poly.setAttribute('stroke-width', '1.5');
    if (s.dashed) poly.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(poly);
  }

  wrap.appendChild(svg);
  wrap.appendChild(legend(series));
  return wrap;
}

/** A grouped/labelled horizontal bar chart for summary comparisons. */
export function barChart(title: string, bars: { label: string; value: number; color: string }[], yFormat: (n: number) => string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-chart';
  wrap.appendChild(chartTitle(title));

  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)));
  const list = document.createElement('div');
  list.className = 'albert-bar-list';
  for (const b of bars) {
    const row = document.createElement('div');
    row.className = 'albert-bar-row';
    const label = document.createElement('span');
    label.className = 'albert-bar-label';
    label.textContent = b.label;
    const track = document.createElement('div');
    track.className = 'albert-bar-track';
    const fill = document.createElement('div');
    fill.className = 'albert-bar-fill';
    fill.style.width = `${max > 0 ? (b.value / max) * 100 : 0}%`;
    fill.style.background = b.color;
    track.appendChild(fill);
    const val = document.createElement('span');
    val.className = 'albert-bar-value';
    val.textContent = yFormat(b.value);
    row.append(label, track, val);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

export interface SankeyNode {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

/**
 * A minimal left-to-right Sankey diagram rendered as inline SVG. `columns` is an ordered list of
 * node columns; link widths are proportional to value, scaled by the heaviest column so columns are
 * visually comparable. Used to show how a sim's load is distributed across flows and outcomes.
 */
export function sankeyChart(title: string, columns: SankeyNode[][], links: SankeyLink[]): HTMLElement {
  const width = 560;
  const nodeWidth = 14;
  const vGap = 8;
  const padT = 8;
  const padB = 8;

  const wrap = document.createElement('div');
  wrap.className = 'albert-chart';
  wrap.appendChild(chartTitle(title));

  const colCount = columns.length;
  const maxNodes = Math.max(1, ...columns.map((c) => c.length));
  const colTotals = columns.map((col) => col.reduce((sum, n) => sum + Math.max(0, n.value), 0));
  const maxColTotal = Math.max(1, ...colTotals);
  const height = Math.max(120, maxNodes * 26 + padT + padB);
  const plotH = height - padT - padB;
  const scale = (plotH - (maxNodes - 1) * vGap) / maxColTotal;

  // Lay out node geometry.
  const geom = new Map<string, { x: number; y: number; h: number; color: string; label: string }>();
  const colX = (i: number) => (colCount > 1 ? (i * (width - nodeWidth)) / (colCount - 1) : 0);
  columns.forEach((col, ci) => {
    let y = padT;
    for (const node of col) {
      const h = Math.max(2, node.value * scale);
      geom.set(node.id, { x: colX(ci), y, h, color: node.color, label: node.label });
      y += h + vGap;
    }
  });

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'albert-chart-svg');

  // Links first (so nodes draw on top).
  const srcOffset = new Map<string, number>();
  const tgtOffset = new Map<string, number>();
  for (const link of links) {
    const s = geom.get(link.source);
    const t = geom.get(link.target);
    if (!s || !t || link.value <= 0) continue;
    const th = Math.max(1, link.value * scale);
    const so = srcOffset.get(link.source) ?? 0;
    const to = tgtOffset.get(link.target) ?? 0;
    const x0 = s.x + nodeWidth;
    const y0 = s.y + so;
    const x1 = t.x;
    const y1 = t.y + to;
    const mx = (x0 + x1) / 2;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute(
      'd',
      `M ${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1} L ${x1} ${y1 + th} C ${mx} ${y1 + th}, ${mx} ${y0 + th}, ${x0} ${y0 + th} Z`
    );
    path.setAttribute('fill', s.color);
    path.setAttribute('fill-opacity', '0.35');
    svg.appendChild(path);
    srcOffset.set(link.source, so + th);
    tgtOffset.set(link.target, to + th);
  }

  // Nodes + labels.
  columns.forEach((col, ci) => {
    for (const node of col) {
      const g = geom.get(node.id)!;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(g.x));
      rect.setAttribute('y', String(g.y));
      rect.setAttribute('width', String(nodeWidth));
      rect.setAttribute('height', String(g.h));
      rect.setAttribute('fill', node.color);
      rect.setAttribute('rx', '2');
      svg.appendChild(rect);

      const lastCol = ci === colCount - 1;
      const tx = lastCol ? g.x - 6 : g.x + nodeWidth + 6;
      const label = text(tx, g.y + g.h / 2 + 3, `${node.label}`, 'albert-sankey-label', lastCol ? 'end' : 'start');
      svg.appendChild(label);
    }
  });

  wrap.appendChild(svg);
  return wrap;
}

function chartTitle(title: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'albert-chart-title';
  el.textContent = title;
  return el;
}

function legend(series: LineSeries[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'albert-chart-legend';
  for (const s of series) {
    const item = document.createElement('span');
    item.className = 'albert-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'albert-legend-swatch';
    swatch.style.background = s.color;
    if (s.dashed) swatch.style.opacity = '0.6';
    item.append(swatch, document.createTextNode(s.name));
    el.appendChild(item);
  }
  return el;
}

function line(x1: number, y1: number, x2: number, y2: number, cls: string): SVGElement {
  const el = document.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  el.setAttribute('class', cls);
  return el;
}

function text(x: number, y: number, content: string, cls: string, anchor: string): SVGElement {
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('class', cls);
  el.setAttribute('text-anchor', anchor);
  el.textContent = content;
  return el;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function niceMax(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / pow;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * pow;
}
