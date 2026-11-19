import type { Id, Member, Model } from '../model/types';
import { compileArcCurve } from '../model/curve';

/** Transformação mundo (m, Y para cima) → tela (px, Y invertido). */
export interface ViewT {
  scale: number;
  ox: number;
  oy: number;
}

export interface Pt {
  x: number;
  y: number;
}

export function toScreen(v: ViewT, x: number, y: number): Pt {
  return { x: v.ox + x * v.scale, y: v.oy - y * v.scale };
}

export function toWorld(v: ViewT, sx: number, sy: number): Pt {
  return { x: (sx - v.ox) / v.scale, y: (v.oy - sy) / v.scale };
}

export function zoomAt(v: ViewT, sx: number, sy: number, factor: number): ViewT {
  const w = toWorld(v, sx, sy);
  const scale = Math.min(5000, Math.max(0.5, v.scale * factor));
  return { scale, ox: sx - w.x * scale, oy: sy + w.y * scale };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const ARC_DRAW_POINTS = 200;

/** Pontos para desenhar a barra (2) ou o arco (201, uniformes em x). */
export function memberPolyline(m: Model, k: Member): Pt[] {
  const ni = m.nodes.find((n) => n.id === k.ni);
  const nj = m.nodes.find((n) => n.id === k.nj);
  if (!ni || !nj) return [];
  if (k.kind === 'bar') return [ni, nj].map((n) => ({ x: n.x, y: n.y }));
  return curvePolyline(k.expr, ni.x, nj.x) ?? [ni, nj].map((n) => ({ x: n.x, y: n.y }));
}

export function curvePolyline(expr: string, xi: number, xj: number, n = ARC_DRAW_POINTS): Pt[] | null {
  const c = compileArcCurve(expr, xi, xj);
  if (!c.ok) return null;
  const pts: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const x = k === n ? xj : xi + ((xj - xi) * k) / n;
    pts.push({ x, y: c.fn(x) });
  }
  return pts;
}

export function boundsOf(points: Pt[]): Bounds | null {
  if (points.length === 0) return null;
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return b;
}

export function modelBounds(m: Model): Bounds {
  const pts: Pt[] = m.nodes.map((n) => ({ x: n.x, y: n.y }));
  for (const k of m.members) if (k.kind === 'arc') pts.push(...memberPolyline(m, k));
  return boundsOf(pts) ?? { minX: -1, minY: -1, maxX: 10, maxY: 6 };
}

export function fitView(b: Bounds, width: number, height: number, margin = 0.15): ViewT {
  const bw = Math.max(b.maxX - b.minX, 1e-6);
  const bh = Math.max(b.maxY - b.minY, 1e-6);
  let scale = Math.min((width * (1 - 2 * margin)) / bw, (height * (1 - 2 * margin)) / bh);
  if (b.maxX - b.minX < 1e-6 && b.maxY - b.minY < 1e-6) scale = 50;
  scale = Math.min(5000, Math.max(0.5, scale));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { scale, ox: width / 2 - cx * scale, oy: height / 2 + cy * scale };
}

/** Distância de p ao segmento ab e parâmetro t ∈ [0, 1] do ponto mais próximo. */
export function segDistance(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return { d: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), t };
}

export type Hit = { kind: 'node'; id: Id } | { kind: 'member'; id: Id; at: number } | null;

/**
 * Item sob o ponto (x, y) em coordenadas do mundo, com tolerância em metros.
 * Nós têm prioridade. Para barras, `at` é a fração do comprimento; para arcos, a abscissa x.
 */
export function hitTest(m: Model, x: number, y: number, tol: number, polylines?: Map<Id, Pt[]>): Hit {
  const p = { x, y };
  let bestNode: { id: Id; d: number } | null = null;
  for (const n of m.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= tol && (!bestNode || d < bestNode.d)) bestNode = { id: n.id, d };
  }
  if (bestNode) return { kind: 'node', id: bestNode.id };
  let best: { id: Id; d: number; at: number } | null = null;
  for (const k of m.members) {
    const pts = polylines?.get(k.id) ?? memberPolyline(m, k);
    for (let i = 0; i + 1 < pts.length; i++) {
      const r = segDistance(p, pts[i], pts[i + 1]);
      if (r.d <= tol && (!best || r.d < best.d)) {
        const at = k.kind === 'bar' ? r.t : pts[i].x + (pts[i + 1].x - pts[i].x) * r.t;
        best = { id: k.id, d: r.d, at };
      }
    }
  }
  return best ? { kind: 'member', id: best.id, at: best.at } : null;
}

/**
 * Leva a posição de um clique sobre a barra/arco para a grade: no arco, a abscissa x;
 * na barra, a coordenada dominante (x se a barra for mais horizontal, y se mais vertical).
 * `at` é a fração (barra) ou a abscissa (arco); se a grade cair fora do interior, devolve `at`.
 */
export function snapAlongMember(m: Model, k: Member, at: number, grid: number): number {
  const ni = m.nodes.find((n) => n.id === k.ni);
  const nj = m.nodes.find((n) => n.id === k.nj);
  if (!ni || !nj || !(grid > 0)) return at;
  const snap = (v: number) => Math.round(v / grid) * grid;
  if (k.kind === 'arc') {
    const x = snap(at);
    const eps = 1e-3 * (nj.x - ni.x);
    return x > ni.x + eps && x < nj.x - eps ? x : at;
  }
  const dx = nj.x - ni.x;
  const dy = nj.y - ni.y;
  const t = Math.abs(dx) >= Math.abs(dy) ? (snap(ni.x + dx * at) - ni.x) / dx : (snap(ni.y + dy * at) - ni.y) / dy;
  return t > 1e-3 && t < 1 - 1e-3 ? t : at;
}
