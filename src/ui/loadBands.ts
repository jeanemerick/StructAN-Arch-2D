import type { DistLoad, Id, Model } from '../model/types';
import type { Pt } from './geometry';

/**
 * Cargas distribuídas em direção global desenhadas em faixas retas (tela, em pixels):
 * a carga vertical numa faixa horizontal acima (ou sob) o elemento, cobrindo a projeção dele;
 * a horizontal numa faixa vertical ao lado. A altura das setas é a intensidade por metro de
 * projeção (carga por comprimento é convertida). Trechos vizinhos com a mesma carga formam uma
 * faixa só; faixas não cobrem barras nem umas às outras.
 *
 * Coordenadas genéricas: u corre ao longo da faixa e w na direção das setas. Carga vertical:
 * u = x da tela, w = y da tela; horizontal: u = y da tela, w = x da tela. s = +1 quando a seta
 * aponta para w crescente.
 */

export interface BandArrow {
  tail: Pt;
  head: Pt;
}

export interface LoadBand {
  memberIds: Id[];
  orientation: 'vertical' | 'horizontal';
  arrows: BandArrow[];
  /** Contorno da faixa: linha das pontas das setas, envoltória das caudas e fechamentos. */
  outline: Pt[];
  label: { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' };
  /** Retângulo ocupado (tela). */
  box: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface AxisLoad {
  memberId: Id;
  loadIndex: number;
}

interface Piece {
  memberId: Id;
  loadIndex: number;
  load: DistLoad;
  orientation: 'vertical' | 'horizontal';
  s: 1 | -1;
  /** Amostras (u, intensidade por projeção), u crescente. */
  samples: { u: number; q: number }[];
  ua: number;
  ub: number;
}

const CLEAR = 10;
const GAP = 6;
const SPACING = 22;
const MIN_LEN = 6;
const MAX_LEN = 34;

const toUW = (o: 'vertical' | 'horizontal', p: Pt) => (o === 'vertical' ? { u: p.x, w: p.y } : { u: p.y, w: p.x });
const fromUW = (o: 'vertical' | 'horizontal', u: number, w: number): Pt => (o === 'vertical' ? { x: u, y: w } : { x: w, y: u });

/** Intensidade da carga na fração f do elemento (arco: fração em x; barra: do comprimento). */
const qAt = (l: DistLoad, f: number) => l.qi + (l.qj - l.qi) * f;

function unitLabel(l: DistLoad): string {
  return l.ref === 'projection' ? 'kN/m (proj.)' : 'kN/m';
}

/** Monta as peças (um elemento + uma carga) em coordenadas u, w. Devolve também as cargas que ficam sobre o eixo. */
function pieces(model: Model, screen: Map<Id, Pt[]>, world: Map<Id, Pt[]>): { list: Piece[]; onAxis: AxisLoad[] } {
  const list: Piece[] = [];
  const onAxis: AxisLoad[] = [];
  for (const k of model.members) {
    const sp = screen.get(k.id);
    const wp = world.get(k.id);
    if (!sp || !wp || sp.length < 2) continue;
    k.loads.forEach((l, li) => {
      if (l.qi === 0 && l.qj === 0) return;
      // carga local, ou que troca de sinal ao longo da barra (a faixa de um lado só não a representaria): sobre o eixo
      if ((l.dir !== 'globalX' && l.dir !== 'globalY') || l.qi * l.qj < 0) {
        onAxis.push({ memberId: k.id, loadIndex: li });
        return;
      }
      const o = l.dir === 'globalY' ? 'vertical' : 'horizontal';
      const uw = sp.map((p) => toUW(o, p));
      const us = uw.map((p) => p.u);
      const ua = Math.min(...us);
      const ub = Math.max(...us);
      // projeção nula (barra vertical com carga vertical, por exemplo): desenho sobre o elemento
      if (ub - ua < 3) {
        onAxis.push({ memberId: k.id, loadIndex: li });
        return;
      }
      // fração ao longo do elemento em cada ponto do desenho
      const frac: number[] = [];
      if (k.kind === 'arc') {
        const xi = wp[0].x;
        const xj = wp[wp.length - 1].x;
        for (const p of wp) frac.push((p.x - xi) / (xj - xi || 1));
      } else {
        frac.push(0, 1);
      }
      const samples: { u: number; q: number }[] = [];
      for (let i = 0; i < uw.length; i++) {
        let q = qAt(l, frac[i]);
        if (l.ref === 'length') {
          // por comprimento → por projeção: q·ds/du (média dos trechos vizinhos)
          const ratio = (a: number, b: number) => {
            const du = Math.abs(uw[b].u - uw[a].u);
            const ds = Math.hypot(uw[b].u - uw[a].u, uw[b].w - uw[a].w);
            return du > 1e-9 ? ds / du : NaN;
          };
          const r = [i > 0 ? ratio(i - 1, i) : NaN, i + 1 < uw.length ? ratio(i, i + 1) : NaN].filter(Number.isFinite);
          const f = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 1;
          q *= Math.min(f, 50);
        }
        samples.push({ u: uw[i].u, q });
      }
      samples.sort((a, b) => a.u - b.u);
      const dominant = Math.abs(l.qi) >= Math.abs(l.qj) ? l.qi : l.qj;
      const pointsTowardW = o === 'vertical' ? dominant < 0 : dominant > 0;
      list.push({ memberId: k.id, loadIndex: li, load: l, orientation: o, s: pointsTowardW ? 1 : -1, samples, ua, ub });
    });
  }
  return { list, onAxis };
}

function interp(samples: { u: number; q: number }[], u: number): number {
  if (u <= samples[0].u) return samples[0].q;
  for (let i = 1; i < samples.length; i++) {
    if (u <= samples[i].u) {
      const a = samples[i - 1];
      const b = samples[i];
      const t = (u - a.u) / (b.u - a.u || 1);
      return a.q + (b.q - a.q) * t;
    }
  }
  return samples[samples.length - 1].q;
}

/** Peças vizinhas (mesmo nó na emenda) com a mesma carga formam uma faixa só. */
function group(model: Model, list: Piece[]): Piece[][] {
  const groups: Piece[][] = [];
  const shareNode = (a: Id, b: Id) => {
    const ka = model.members.find((k) => k.id === a)!;
    const kb = model.members.find((k) => k.id === b)!;
    return [ka.ni, ka.nj].some((n) => n === kb.ni || n === kb.nj);
  };
  for (const o of ['vertical', 'horizontal'] as const) {
    for (const s of [1, -1] as const) {
      const set = list.filter((p) => p.orientation === o && p.s === s).sort((a, b) => a.ua - b.ua);
      let cur: Piece[] = [];
      for (const p of set) {
        const last = cur[cur.length - 1];
        if (last && Math.abs(last.ub - p.ua) < 1 && shareNode(last.memberId, p.memberId)) {
          const qa = last.samples[last.samples.length - 1].q;
          const qb = p.samples[0].q;
          if (Math.abs(qa - qb) <= 1e-6 * Math.max(Math.abs(qa), Math.abs(qb), 1e-9)) {
            cur.push(p);
            continue;
          }
        }
        if (cur.length) groups.push(cur);
        cur = [p];
      }
      if (cur.length) groups.push(cur);
    }
  }
  return groups;
}

const overlap = (a: LoadBand['box'], b: LoadBand['box']) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

export function computeLoadBands(model: Model, screen: Map<Id, Pt[]>, world: Map<Id, Pt[]>): { bands: LoadBand[]; onAxis: AxisLoad[] } {
  const { list, onAxis } = pieces(model, screen, world);
  let qmax = 0;
  for (const p of list) for (const s of p.samples) qmax = Math.max(qmax, Math.abs(s.q));
  const lenOf = (q: number) => MIN_LEN + ((MAX_LEN - MIN_LEN) * Math.abs(q)) / (qmax || 1);
  const bands: LoadBand[] = [];
  const groups = group(model, list).sort((a, b) => b[0].ub - b[0].ua - (a[0].ub - a[0].ua));

  for (const g of groups) {
    const o = g[0].orientation;
    const s = g[0].s;
    const ua = Math.min(...g.map((p) => p.ua));
    const ub = Math.max(...g.map((p) => p.ub));
    const members = new Set(g.map((p) => p.memberId));
    const qOf = (u: number) => {
      const p = g.find((q) => u >= q.ua - 1e-6 && u <= q.ub + 1e-6) ?? g[g.length - 1];
      return interp(p.samples, u);
    };
    // linha das pontas: além do próprio elemento, do lado de onde vem a carga
    const own = g.flatMap((p) => screen.get(p.memberId)!.map((q) => toUW(o, q).w));
    let base = s > 0 ? Math.min(...own) - CLEAR : Math.max(...own) + CLEAR;
    const depth = Math.max(...g.flatMap((p) => p.samples.map((q) => lenOf(q.q))));
    // obstáculos: outras barras que atravessam a faixa (trechos não perpendiculares a ela)
    const lo = () => (s > 0 ? base - depth - 14 : base);
    const hi = () => (s > 0 ? base : base + depth + 14);
    for (let iter = 0; iter < 12; iter++) {
      let next = base;
      for (const k of model.members) {
        if (members.has(k.id)) continue;
        const pts = (screen.get(k.id) ?? []).map((q) => toUW(o, q));
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          if (Math.abs(b.u - a.u) < 0.2 * Math.abs(b.w - a.w)) continue; // perpendicular à faixa: atravessa qualquer posição
          const u0 = Math.max(Math.min(a.u, b.u), ua + 2);
          const u1 = Math.min(Math.max(a.u, b.u), ub - 2);
          if (u1 <= u0) continue;
          const wAt = (u: number) => a.w + ((b.w - a.w) * (u - a.u)) / (b.u - a.u || 1);
          const w0 = Math.min(wAt(u0), wAt(u1));
          const w1 = Math.max(wAt(u0), wAt(u1));
          if (w1 >= lo() && w0 <= hi()) next = s > 0 ? Math.min(next, w0 - CLEAR) : Math.max(next, w1 + CLEAR);
        }
      }
      if (next === base) break;
      base = next;
    }
    // setas com o mesmo espaçamento ao longo de toda a faixa
    const n = Math.max(2, Math.round((ub - ua) / SPACING));
    const arrows: BandArrow[] = [];
    const tails: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const u = ua + ((ub - ua) * i) / n;
      const q = qOf(u);
      const L = lenOf(q);
      const wt = base - s * L;
      tails.push(fromUW(o, u, wt));
      if (Math.abs(q) > 1e-12) arrows.push({ tail: fromUW(o, u, wt), head: fromUW(o, u, base) });
    }
    const outline = [fromUW(o, ua, base), ...tails, fromUW(o, ub, base), fromUW(o, ua, base)];
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    // espaço do rótulo: acima da faixa horizontal; ao lado da vertical
    let box =
      o === 'vertical'
        ? { minX: Math.min(...xs), minY: Math.min(...ys) - (s > 0 ? 20 : 0), maxX: Math.max(...xs), maxY: Math.max(...ys) + (s > 0 ? 0 : 20) }
        : { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    const box0 = box;
    // não cobrir outras faixas: afasta da estrutura até ficar livre
    let shift = 0;
    for (let iter = 0; iter < 20; iter++) {
      const hit = bands.find((b) => overlap(b.box, box));
      if (!hit) break;
      const d = o === 'vertical' ? (s > 0 ? box.maxY - hit.box.minY + GAP : hit.box.maxY - box.minY + GAP) : s > 0 ? box.maxX - hit.box.minX + GAP : hit.box.maxX - box.minX + GAP;
      shift += d;
      const dv = -s * d;
      box = o === 'vertical' ? { ...box, minY: box.minY + dv, maxY: box.maxY + dv } : { ...box, minX: box.minX + dv, maxX: box.maxX + dv };
    }
    const mv = (p: Pt): Pt => (o === 'vertical' ? { x: p.x, y: p.y - s * shift } : { x: p.x - s * shift, y: p.y });
    const spec = g.every((p) => p.load.qi === g[0].load.qi && p.load.qj === g[0].load.qj && p.load.ref === g[0].load.ref);
    const l0 = g[0].load;
    const fmt = (v: number) => (Math.abs(v) < 1e-9 ? '0' : Math.abs(v).toFixed(2).replace('.', ','));
    const text = spec && l0.qi === l0.qj ? `${fmt(l0.qi)} ${unitLabel(l0)}` : spec ? `${fmt(l0.qi)} → ${fmt(l0.qj)} ${unitLabel(l0)}` : `${fmt(qOf((ua + ub) / 2))} kN/m (proj.)`;
    const mid = tails[Math.floor(tails.length / 2)];
    const label =
      o === 'vertical'
        ? { x: mid.x, y: s > 0 ? box0.minY + 9 : box0.maxY - 9, text, anchor: 'middle' as const }
        : { x: s > 0 ? box0.minX - 4 : box0.maxX + 4, y: mid.y - 6, text, anchor: s > 0 ? ('end' as const) : ('start' as const) };
    bands.push({
      memberIds: [...members],
      orientation: o,
      arrows: arrows.map((a) => ({ tail: mv(a.tail), head: mv(a.head) })),
      outline: outline.map(mv),
      label: { ...mv(label), text, anchor: label.anchor },
      box,
    });
  }
  return { bands, onAxis };
}
