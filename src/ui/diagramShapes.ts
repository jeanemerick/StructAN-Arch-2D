import type { Id, Model } from '../model/types';
import type { Station } from '../solver/diagrams';
import type { Pt } from './geometry';

export type Effort = 'N' | 'Q' | 'M';

/** Ponto de um diagrama: posição no eixo, valor e direção (unitária, no mundo) em que o valor positivo é desenhado. */
export interface DPoint {
  x: number;
  y: number;
  v: number;
  dx: number;
  dy: number;
  memberId: Id;
}

/** Sequência de barras e arcos em que o diagrama é contínuo (mesma direção do eixo e mesmo valor nas emendas). */
export interface Chain {
  members: Id[];
  /** Peça percorrida ao contrário do seu sentido (mesma ordem de members). */
  reversed: boolean[];
  pts: DPoint[];
}

/** Desvio angular máximo para considerar que o eixo não muda de direção numa emenda. */
const ANGLE_TOL = Math.cos((1 * Math.PI) / 180);

interface End {
  member: Id;
  atStart: boolean;
}

/**
 * Direção do desenho: M sempre do lado tracionado (−y local), independentemente do sentido
 * da barra; N e Q do lado +y local, com o sentido da cadeia (barra percorrida ao contrário
 * desenha do lado oposto, para o diagrama não trocar de lado numa emenda alinhada).
 */
export function drawDir(effort: Effort, p: { tx: number; ty: number }, reversed: boolean): [number, number] {
  const nx = -p.ty;
  const ny = p.tx;
  if (effort === 'M') return [-nx, -ny];
  return reversed ? [-nx, -ny] : [nx, ny];
}

/**
 * Agrupa as barras e arcos em cadeias onde o diagrama do esforço é contínuo: duas peças se
 * emendam num nó em que só elas chegam, com o eixo na mesma direção e o mesmo valor dos
 * dois lados (tolerância relativa `relTol` do maior valor da estrutura).
 */
export function buildChains(model: Model, stations: Map<Id, Station[]>, effort: Effort, relTol = 1e-4): Chain[] {
  let maxAbs = 0;
  for (const st of stations.values()) for (const p of st) maxAbs = Math.max(maxAbs, Math.abs(p[effort]));
  const tol = relTol * maxAbs + 1e-9;

  const members = model.members.filter((k) => (stations.get(k.id)?.length ?? 0) >= 2);
  const byNode = new Map<Id, End[]>();
  const degree = new Map<Id, number>();
  for (const k of model.members) {
    degree.set(k.ni, (degree.get(k.ni) ?? 0) + 1);
    degree.set(k.nj, (degree.get(k.nj) ?? 0) + 1);
  }
  for (const k of members) {
    for (const [node, atStart] of [
      [k.ni, true],
      [k.nj, false],
    ] as const) {
      const list = byNode.get(node) ?? [];
      list.push({ member: k.id, atStart });
      byNode.set(node, list);
    }
  }

  const endStation = (e: End): Station => {
    const st = stations.get(e.member)!;
    return e.atStart ? st[0] : st[st.length - 1];
  };
  /** Tangente saindo do nó para dentro da peça. */
  const outward = (e: End): [number, number] => {
    const p = endStation(e);
    return e.atStart ? [p.tx, p.ty] : [-p.tx, -p.ty];
  };

  /** Peça que continua a cadeia a partir da extremidade `e`, se houver emenda contínua. */
  const next = (node: Id, e: End): End | null => {
    if (degree.get(node) !== 2) return null;
    const other = (byNode.get(node) ?? []).find((o) => o.member !== e.member);
    if (!other) return null;
    const [ax, ay] = outward(e);
    const [bx, by] = outward(other);
    if (ax * bx + ay * by > -ANGLE_TOL) return null;
    const pa = endStation(e);
    const pb = endStation(other);
    if (effort === 'M') {
      // compara o desenho (lado tracionado), que não depende do sentido das peças
      const [dax, day] = drawDir('M', pa, false);
      const [dbx, dby] = drawDir('M', pb, false);
      if (Math.hypot(pa.M * dax - pb.M * dbx, pa.M * day - pb.M * dby) > tol) return null;
    } else if (Math.abs(pa[effort] - pb[effort]) > tol) return null;
    return other;
  };

  const nodeOf = (e: End) => {
    const k = model.members.find((q) => q.id === e.member)!;
    return e.atStart ? k.ni : k.nj;
  };
  const farEnd = (e: End): End => ({ member: e.member, atStart: !e.atStart });

  const visited = new Set<Id>();
  const chains: Chain[] = [];
  for (const k of members) {
    if (visited.has(k.id)) continue;
    visited.add(k.id);
    // sequência de (peça, percorrida ao contrário?)
    const seq: { id: Id; reversed: boolean }[] = [{ id: k.id, reversed: false }];
    // para frente, a partir do nó final
    let cur: End = { member: k.id, atStart: false };
    for (;;) {
      const o = next(nodeOf(cur), cur);
      if (!o || visited.has(o.member)) break;
      visited.add(o.member);
      // entrando pela extremidade inicial, a peça é percorrida no sentido dela
      seq.push({ id: o.member, reversed: !o.atStart });
      cur = farEnd(o);
    }
    // para trás, a partir do nó inicial
    cur = { member: k.id, atStart: true };
    for (;;) {
      const o = next(nodeOf(cur), cur);
      if (!o || visited.has(o.member)) break;
      visited.add(o.member);
      // entrando pela extremidade final, a peça é percorrida no sentido dela
      seq.unshift({ id: o.member, reversed: o.atStart });
      cur = farEnd(o);
    }
    const pts: DPoint[] = [];
    for (const { id, reversed } of seq) {
      const st = stations.get(id)!;
      const list = reversed ? [...st].reverse() : st;
      list.forEach((p, i) => {
        if (i === 0 && pts.length > 0) return; // ponto da emenda já incluído
        const [dx, dy] = drawDir(effort, p, reversed);
        pts.push({ x: p.x, y: p.y, v: p[effort], dx, dy, memberId: id });
      });
    }
    chains.push({ members: seq.map((s) => s.id), reversed: seq.map((s) => s.reversed), pts });
  }
  return chains;
}

export interface ChainShape {
  /** Um polígono por trecho de mesmo sinal: eixo de ida e diagrama de volta. */
  fills: { sign: 1 | -1; pts: Pt[] }[];
  /** Contorno do diagrama: fecha até o eixo só nas pontas da cadeia. */
  outline: Pt[];
  /** Pontos do diagrama (mesma ordem de chain.pts). */
  offsets: Pt[];
}

/** Geometria (no mundo) do diagrama de uma cadeia, com fator de escala k (m por unidade do esforço). */
export function chainShape(chain: Chain, k: number): ChainShape {
  const base = chain.pts.map((p) => ({ x: p.x, y: p.y }));
  const offsets = chain.pts.map((p) => ({ x: p.x + p.dx * p.v * k, y: p.y + p.dy * p.v * k }));
  const fills: ChainShape['fills'] = [];
  let run: { b: Pt[]; o: Pt[]; sign: 1 | -1 } | null = null;
  const close = () => {
    if (run && run.b.length >= 2) fills.push({ sign: run.sign, pts: [...run.b, ...[...run.o].reverse()] });
    run = null;
  };
  const sgn = (v: number): 1 | -1 | 0 => (v > 0 ? 1 : v < 0 ? -1 : 0);
  for (let i = 0; i < chain.pts.length; i++) {
    const v = chain.pts[i].v;
    const s = sgn(v);
    if (i > 0) {
      const v0 = chain.pts[i - 1].v;
      const s0 = sgn(v0);
      if (s0 !== 0 && s !== 0 && s0 !== s) {
        // troca de sinal no meio do trecho: fecha no zero
        const t = v0 / (v0 - v);
        const z = { x: base[i - 1].x + (base[i].x - base[i - 1].x) * t, y: base[i - 1].y + (base[i].y - base[i - 1].y) * t };
        if (run) {
          (run as { b: Pt[]; o: Pt[] }).b.push(z);
          (run as { b: Pt[]; o: Pt[] }).o.push(z);
        }
        close();
        run = { b: [z], o: [z], sign: s };
      }
    }
    if (s === 0) {
      if (run) {
        (run as { b: Pt[]; o: Pt[] }).b.push(base[i]);
        (run as { b: Pt[]; o: Pt[] }).o.push(offsets[i]);
      }
      close();
      run = null;
      // o zero também abre o próximo trecho
      const nv = chain.pts[i + 1]?.v ?? 0;
      if (sgn(nv) !== 0) run = { b: [base[i]], o: [offsets[i]], sign: sgn(nv) as 1 | -1 };
      continue;
    }
    if (!run) run = { b: [], o: [], sign: s };
    (run as { b: Pt[]; o: Pt[] }).b.push(base[i]);
    (run as { b: Pt[]; o: Pt[] }).o.push(offsets[i]);
  }
  close();
  const outline = [base[0], ...offsets, base[base.length - 1]];
  return { fills, outline, offsets };
}
