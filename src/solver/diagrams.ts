import type { Id, Model } from '../model/types';
import { compileArcCurve } from '../model/curve';
import type { AnalysisOk } from './analyze';
import { vecToGlobal } from './element';

/**
 * Ponto de cálculo ao longo de uma barra ou arco.
 * Convenções: N > 0 tração; Q > 0 gira o trecho no sentido horário;
 * M > 0 traciona a fibra do lado −y local (para barra da esquerda para a direita,
 * a fibra inferior). dx, dy: deslocamento global (m).
 */
export interface Station {
  s: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  N: number;
  Q: number;
  M: number;
  dx: number;
  dy: number;
}

export function memberStations(model: Model, res: AnalysisOk, memberId: Id, nPerBar = 20): Station[] {
  const mem = model.members.find((k) => k.id === memberId);
  const elems = res.mesh.memberElems.get(memberId);
  if (!mem || !elems) return [];
  return mem.kind === 'bar' ? barStations(res, elems[0], nPerBar) : arcStations(model, res, memberId, elems);
}

function barStations(res: AnalysisOk, k: number, n: number): Station[] {
  const e = res.mesh.elems[k];
  const A = res.mesh.nodes[e.a];
  const [f1x, f1y, m1] = res.endForces[k];
  const [u1, v1, th1] = res.endDisp[k];
  const { px1, px2, wy1, wy2 } = e.load;
  const L = e.L;
  const dp = (px2 - px1) / L;
  const dw = (wy2 - wy1) / L;
  const axial = e.behavior === 'axial';
  const v2 = res.endDisp[k][4];
  const eps0 = e.alpha * e.dT;
  const out: Station[] = [];
  // estações uniformes mais os pontos onde N, Q ou M têm extremo dentro da barra
  const ss = new Set<number>();
  for (let i = 0; i <= n; i++) ss.add((L * i) / n);
  for (const c of criticalPoints(res, k)) ss.add(c);
  const list = [...ss].sort((a, b) => a - b).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-12 * L);
  for (const s of list) {
    const s2 = s * s;
    const s3 = s2 * s;
    const N = -f1x - (px1 * s + (dp * s2) / 2);
    // u′ = N/EA + αΔT;  v″ = M/EI + κ (κ = curvatura térmica)
    const u = u1 + (-f1x * s - (px1 * s2) / 2 - (dp * s3) / 6) / e.EA + eps0 * s;
    if (axial) {
      // barra somente axial: sem cortante nem momento; transversalmente, desloca-se como corpo rígido
      const v = v1 + ((v2 - v1) * s) / L;
      out.push({ s, x: A.x + e.c * s, y: A.y + e.s * s, tx: e.c, ty: e.s, N, Q: 0, M: 0, dx: u * e.c - v * e.s, dy: u * e.s + v * e.c });
      continue;
    }
    const Q = f1y + wy1 * s + (dw * s2) / 2;
    const M = -m1 + f1y * s + (wy1 * s2) / 2 + (dw * s3) / 6;
    const v = v1 + th1 * s + ((-m1 * s2) / 2 + (f1y * s3) / 6 + (wy1 * s2 * s2) / 24 + (dw * s3 * s2) / 120) / e.EI + (e.kappa * s2) / 2;
    out.push({
      s,
      x: A.x + e.c * s,
      y: A.y + e.s * s,
      tx: e.c,
      ty: e.s,
      N,
      Q,
      M,
      dx: u * e.c - v * e.s,
      dy: u * e.s + v * e.c,
    });
  }
  return out;
}

/** Raízes reais de a·s² + b·s + c em (0, L). */
function rootsIn(a: number, b: number, c: number, L: number): number[] {
  const tol = 1e-12 * Math.max(1, Math.abs(b), Math.abs(c));
  const out: number[] = [];
  if (Math.abs(a) <= tol) {
    if (Math.abs(b) > tol) out.push(-c / b);
  } else {
    const d = b * b - 4 * a * c;
    if (d >= 0) {
      const r = Math.sqrt(d);
      out.push((-b - r) / (2 * a), (-b + r) / (2 * a));
    }
  }
  return out.filter((s) => s > 1e-9 * L && s < L * (1 - 1e-9));
}

/**
 * Posições (ao longo do elemento k) onde os esforços têm extremo no interior:
 * N onde a carga axial zera; Q onde a carga transversal zera; M onde Q zera.
 */
function criticalPoints(res: AnalysisOk, k: number): number[] {
  const e = res.mesh.elems[k];
  const [, f1y] = res.endForces[k];
  const { px1, px2, wy1, wy2 } = e.load;
  const L = e.L;
  const dp = (px2 - px1) / L;
  const dw = (wy2 - wy1) / L;
  const out = rootsIn(0, dp, px1, L);
  if (e.behavior === 'axial') return out;
  out.push(...rootsIn(0, dw, wy1, L));
  // Q(s) = f1y + wy1·s + dw·s²/2 = 0
  out.push(...rootsIn(dw / 2, wy1, f1y, L));
  return out;
}

function arcStations(model: Model, res: AnalysisOk, memberId: Id, elems: number[]): Station[] {
  const mem = model.members.find((k) => k.id === memberId)!;
  if (mem.kind !== 'arc') return [];
  const { mesh, u } = res;
  const xi = mesh.nodes[mesh.elems[elems[0]].a].x;
  const xj = mesh.nodes[mesh.elems[elems[elems.length - 1]].b].x;
  const curve = compileArcCurve(mem.expr, xi, xj);
  const fn = curve.ok ? curve.fn : null;
  const h = 1e-6 * (xj - xi);

  const tangent = (x: number, fallback: [number, number]): [number, number] => {
    if (!fn) return fallback;
    let d: number;
    if (x - h < xi) d = (fn(x + h) - fn(x)) / h;
    else if (x + h > xj) d = (fn(x) - fn(x - h)) / h;
    else d = (fn(x + h) - fn(x - h)) / (2 * h);
    if (!Number.isFinite(d)) return fallback;
    const n = Math.hypot(1, d);
    return [1 / n, d / n];
  };

  const out: Station[] = [];
  let s = 0;
  const push = (node: number, G: [number, number], M: number, seg: number) => {
    const p = mesh.nodes[node];
    const e = mesh.elems[seg];
    const [tx, ty] = tangent(p.x, [e.c, e.s]);
    // G: força que a parte à direita exerce sobre a parte à esquerda (global)
    const N = G[0] * tx + G[1] * ty;
    const Q = -(G[0] * -ty + G[1] * tx);
    out.push({ s, x: p.x, y: p.y, tx, ty, N, Q, M, dx: u[3 * node], dy: u[3 * node + 1] });
  };

  elems.forEach((k, i) => {
    const e = mesh.elems[k];
    const fg = vecToGlobal(res.endForces[k], e.c, e.s);
    push(e.a, [-fg[0], -fg[1]], -res.endForces[k][2], k);
    s += e.L;
    if (i === elems.length - 1) push(e.b, [fg[3], fg[4]], res.endForces[k][5], k);
  });
  return out;
}

export function extremes(st: Station[]): {
  N: [number, number];
  Q: [number, number];
  M: [number, number];
  disp: number;
} {
  const r = {
    N: [Infinity, -Infinity] as [number, number],
    Q: [Infinity, -Infinity] as [number, number],
    M: [Infinity, -Infinity] as [number, number],
    disp: 0,
  };
  for (const p of st) {
    r.N = [Math.min(r.N[0], p.N), Math.max(r.N[1], p.N)];
    r.Q = [Math.min(r.Q[0], p.Q), Math.max(r.Q[1], p.Q)];
    r.M = [Math.min(r.M[0], p.M), Math.max(r.M[1], p.M)];
    r.disp = Math.max(r.disp, Math.hypot(p.dx, p.dy));
  }
  return r;
}

export interface Extreme {
  value: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
}

export type MemberExtremes = Record<'N' | 'Q' | 'M', { max: Extreme; min: Extreme }>;

/**
 * Maior e menor valor de N, Q e M no membro. Na barra são exatos: as estações já incluem os
 * pontos onde a derivada zera (M onde Q = 0, por exemplo). No arco, valem as estações dos nós
 * da poligonal, onde N e Q são projetados na tangente real; o momento extra dentro de cada
 * trecho reto é efeito da discretização e some quando o número de segmentos cresce.
 */
export function memberExtremes(model: Model, res: AnalysisOk, memberId: Id): MemberExtremes {
  const cand = memberStations(model, res, memberId, 40);
  const pick = (key: 'N' | 'Q' | 'M') => {
    let max: Extreme | null = null;
    let min: Extreme | null = null;
    for (const p of cand) {
      const v = p[key];
      if (!Number.isFinite(v)) continue;
      if (!max || v > max.value) max = { value: v, x: p.x, y: p.y, tx: p.tx, ty: p.ty };
      if (!min || v < min.value) min = { value: v, x: p.x, y: p.y, tx: p.tx, ty: p.ty };
    }
    const zero = { value: 0, x: 0, y: 0, tx: 1, ty: 0 };
    return { max: max ?? zero, min: min ?? zero };
  };
  return { N: pick('N'), Q: pick('Q'), M: pick('M') };
}
