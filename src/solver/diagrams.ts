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
  const out: Station[] = [];
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n;
    const s2 = s * s;
    const s3 = s2 * s;
    const N = -f1x - (px1 * s + (dp * s2) / 2);
    const Q = f1y + wy1 * s + (dw * s2) / 2;
    const M = -m1 + f1y * s + (wy1 * s2) / 2 + (dw * s3) / 6;
    const u = u1 + (-f1x * s - (px1 * s2) / 2 - (dp * s3) / 6) / e.EA;
    const v = v1 + th1 * s + ((-m1 * s2) / 2 + (f1y * s3) / 6 + (wy1 * s2 * s2) / 24 + (dw * s3 * s2) / 120) / e.EI;
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
