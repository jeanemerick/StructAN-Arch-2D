import type { Behavior, DistLoad, Id, Model } from '../model/types';
import { sectionHeight, sectionProps } from '../model/ops';
import { compileArcCurve, CURVE_SAMPLES } from '../model/curve';
import type { ElemLoad } from './element';

export interface MeshNode {
  x: number;
  y: number;
  modelNodeId?: Id;
}

export interface MeshElem {
  a: number;
  b: number;
  L: number;
  c: number;
  s: number;
  /** Na barra somente flexão, EA é a rigidez de penalidade (ver INEXTENSIBLE_PENALTY). */
  EA: number;
  EI: number;
  relA: boolean;
  relB: boolean;
  load: ElemLoad;
  memberId: Id;
  behavior: Behavior;
  alpha: number;
  /** Parte uniforme da variação de temperatura (°C). */
  dT: number;
  /** Curvatura térmica α(T_int − T_ext)/h (1/m). */
  kappa: number;
}

/**
 * Barra somente flexão (inextensível): rigidez axial de penalidade EA = P·12EI/Lm², com Lm o
 * comprimento da barra ou do arco inteiro (não do trecho da poligonal). Assim a flexibilidade
 * axial da peça fica P vezes menor que a de flexão dela, qualquer que seja o número de
 * segmentos, e a rigidez de um trecho curto não estoura o condicionamento da matriz
 * (P·Lm/ℓ ≈ 2·10⁸ com 200 segmentos). O erro de inextensibilidade é da ordem de 1/P.
 */
export const INEXTENSIBLE_PENALTY = 1e6;

export interface Mesh {
  nodes: MeshNode[];
  elems: MeshElem[];
  /** Elementos de cada barra/arco do modelo, na ordem do nó inicial ao final. */
  memberElems: Map<Id, number[]>;
  /** Índice na malha de cada nó do modelo ligado a alguma barra. */
  nodeIndex: Map<Id, number>;
}

/**
 * Pontos da curva y = f(x) entre xi e xj divididos em nSeg trechos de mesmo
 * comprimento de arco. Primeiro e último pontos são exatos.
 */
export function arcPoints(fn: (x: number) => number, xi: number, xj: number, nSeg: number): { x: number; y: number }[] {
  const N = CURVE_SAMPLES;
  const xs = new Float64Array(N + 1);
  const cum = new Float64Array(N + 1);
  let py = fn(xi);
  xs[0] = xi;
  for (let k = 1; k <= N; k++) {
    const x = k === N ? xj : xi + ((xj - xi) * k) / N;
    const y = fn(x);
    xs[k] = x;
    cum[k] = cum[k - 1] + Math.hypot(x - xs[k - 1], y - py);
    py = y;
  }
  const total = cum[N];
  const pts = [{ x: xi, y: fn(xi) }];
  let k = 1;
  for (let m = 1; m < nSeg; m++) {
    const target = (total * m) / nSeg;
    while (k < N && cum[k] < target) k++;
    const t = (target - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    const x = xs[k - 1] + (xs[k] - xs[k - 1]) * t;
    pts.push({ x, y: fn(x) });
  }
  pts.push({ x: xj, y: fn(xj) });
  return pts;
}

/** Converte as cargas de um membro para eixos locais de um elemento reto. */
function localLoad(loads: DistLoad[], c: number, s: number, q1: (l: DistLoad) => number, q2: (l: DistLoad) => number): ElemLoad {
  const out: ElemLoad = { px1: 0, px2: 0, wy1: 0, wy2: 0 };
  for (const l of loads) {
    const v1 = q1(l);
    const v2 = q2(l);
    if (l.dir === 'localX') {
      out.px1 += v1;
      out.px2 += v2;
      continue;
    }
    if (l.dir === 'localY') {
      out.wy1 += v1;
      out.wy2 += v2;
      continue;
    }
    const f = l.ref === 'projection' ? (l.dir === 'globalY' ? Math.abs(c) : Math.abs(s)) : 1;
    const [qx1, qy1] = l.dir === 'globalX' ? [v1 * f, 0] : [0, v1 * f];
    const [qx2, qy2] = l.dir === 'globalX' ? [v2 * f, 0] : [0, v2 * f];
    out.px1 += qx1 * c + qy1 * s;
    out.px2 += qx2 * c + qy2 * s;
    out.wy1 += -qx1 * s + qy1 * c;
    out.wy2 += -qx2 * s + qy2 * c;
  }
  return out;
}

/** Gera a malha de elementos retos. Supõe o modelo já validado. */
export function buildMesh(model: Model): Mesh {
  const nodes: MeshNode[] = [];
  const elems: MeshElem[] = [];
  const memberElems = new Map<Id, number[]>();
  const nodeIndex = new Map<Id, number>();
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const sections = new Map(model.sections.map((s) => [s.id, s]));

  const modelNode = (id: Id): number => {
    let i = nodeIndex.get(id);
    if (i === undefined) {
      const n = byId.get(id)!;
      i = nodes.length;
      nodes.push({ x: n.x, y: n.y, modelNodeId: id });
      nodeIndex.set(id, i);
    }
    return i;
  };

  const pushElem = (a: number, b: number, rest: Omit<MeshElem, 'a' | 'b' | 'L' | 'c' | 's' | 'load'>, load: (c: number, s: number) => ElemLoad) => {
    const dx = nodes[b].x - nodes[a].x;
    const dy = nodes[b].y - nodes[a].y;
    const L = Math.hypot(dx, dy);
    const c = dx / L;
    const s = dy / L;
    elems.push({ a, b, L, c, s, load: load(c, s), ...rest });
    return elems.length - 1;
  };

  const penalty = (EI: number, Lm: number) => (INEXTENSIBLE_PENALTY * 12 * EI) / (Lm * Lm);

  for (const mem of model.members) {
    const sec = sections.get(mem.sectionId)!;
    const props = sectionProps(sec);
    const EI = props.EI;
    let EA = props.EA;
    const behavior = mem.behavior;
    const axial = behavior === 'axial';
    const th = mem.thermal;
    const h = sectionHeight(sec);
    const thermal = {
      alpha: sec.alpha,
      dT: th ? (th.tExt + th.tInt) / 2 : 0,
      kappa: th && !axial && h && h > 0 ? (sec.alpha * (th.tInt - th.tExt)) / h : 0,
    };
    const a = modelNode(mem.ni);
    const b = modelNode(mem.nj);
    if (mem.kind === 'bar') {
      if (behavior === 'bending') EA = penalty(EI, Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y));
      const e = pushElem(
        a,
        b,
        { EA, EI: axial ? 0 : EI, relA: axial || mem.hingeI, relB: axial || mem.hingeJ, memberId: mem.id, behavior, ...thermal },
        (c, s) => localLoad(mem.loads, c, s, (l) => l.qi, (l) => l.qj),
      );
      memberElems.set(mem.id, [e]);
      continue;
    }
    const xi = nodes[a].x;
    const xj = nodes[b].x;
    const curve = compileArcCurve(mem.expr, xi, xj);
    if (!curve.ok) throw new Error(curve.error);
    const pts = arcPoints(curve.fn, xi, xj, mem.nSeg);
    if (behavior === 'bending') {
      let Lm = 0;
      for (let k = 1; k < pts.length; k++) Lm += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      EA = penalty(EI, Lm);
    }
    const idx = [a];
    for (let k = 1; k < pts.length - 1; k++) {
      nodes.push({ x: pts[k].x, y: pts[k].y });
      idx.push(nodes.length - 1);
    }
    idx.push(b);
    const qAt = (l: DistLoad, x: number) => l.qi + ((l.qj - l.qi) * (x - xi)) / (xj - xi);
    const list: number[] = [];
    for (let k = 0; k < mem.nSeg; k++) {
      const n1 = idx[k];
      const n2 = idx[k + 1];
      const e = pushElem(
        n1,
        n2,
        { EA, EI, relA: k === 0 && mem.hingeI, relB: k === mem.nSeg - 1 && mem.hingeJ, memberId: mem.id, behavior, ...thermal },
        (c, s) =>
          localLoad(
            mem.loads,
            c,
            s,
            (l) => qAt(l, nodes[n1].x),
            (l) => qAt(l, nodes[n2].x),
          ),
      );
      list.push(e);
    }
    memberElems.set(mem.id, list);
  }
  return { nodes, elems, memberElems, nodeIndex };
}
