import type { Id } from '../model/types';
import type { Pt } from './geometry';
import type { Chain } from './diagramShapes';
import { formatValue } from './format';

/** Rótulo de valor nas pontas das cadeias (apoios, cantos e descontinuidades). */
export interface EndLabel {
  key: string;
  value: number;
  text: string;
  memberId: Id;
  /** Ponto do eixo (tela), no nó. */
  base: Pt;
  /** Ponto do diagrama (tela) a que o valor se refere. */
  at: Pt;
  /** Candidatos ao centro do texto, em ordem de preferência. */
  candidates: Pt[];
  /** Traço de chamada do ponto do diagrama até o texto. */
  leader: boolean;
}

const unit = (x: number, y: number): Pt => {
  const L = Math.hypot(x, y) || 1;
  return { x: x / L, y: y / L };
};

/**
 * Rótulos das pontas das cadeias. Pontas que se encontram no mesmo nó com o mesmo valor
 * viram um rótulo só; com valores diferentes (salto), cada valor vai para o lado da sua
 * barra, afastado do nó ao longo dela, com traço de chamada.
 */
export function endLabels(chains: Chain[], k: number, scr: (p: Pt) => Pt, maxAbs: number): EndLabel[] {
  interface End {
    v: number;
    base: Pt;
    at: Pt;
    inward: Pt;
    out: Pt;
    memberId: Id;
    key: string;
  }
  const groups = new Map<string, End[]>();
  chains.forEach((ch, ci) => {
    const n = ch.pts.length;
    if (n < 2) return;
    for (const [i, j] of [
      [0, 1],
      [n - 1, n - 2],
    ]) {
      const p = ch.pts[i];
      const q = ch.pts[j];
      const base = scr(p);
      const at = scr({ x: p.x + p.dx * p.v * k, y: p.y + p.dy * p.v * k });
      const nb = scr(q);
      const inward = unit(nb.x - base.x, nb.y - base.y);
      const off = Math.hypot(at.x - base.x, at.y - base.y);
      // lado de fora do diagrama; com valor pequeno, o lado do desenho do positivo
      const dirScreen = scr({ x: p.x + p.dx, y: p.y + p.dy });
      const sgn = p.v >= 0 ? 1 : -1;
      const out = off > 1 ? unit(at.x - base.x, at.y - base.y) : unit(sgn * (dirScreen.x - base.x), sgn * (dirScreen.y - base.y));
      const gk = `${Math.round(p.x * 1e6)}:${Math.round(p.y * 1e6)}`;
      const list = groups.get(gk) ?? [];
      list.push({ v: p.v, base, at, inward, out, memberId: p.memberId, key: `e-${ci}-${i}` });
      groups.set(gk, list);
    }
  });
  const tol = 1e-6 * maxAbs + 1e-12;
  const add = (p: Pt, a: Pt, s: number): Pt => ({ x: p.x + a.x * s, y: p.y + a.y * s });
  const out: EndLabel[] = [];
  for (const list of groups.values()) {
    const ends = list.filter((e) => Math.abs(e.v) > tol);
    if (ends.length === 0) continue;
    const texts = new Set(ends.map((e) => formatValue(e.v)));
    if (ends.length >= 2 && texts.size === 1) {
      // mesmo valor dos dois lados: um rótulo só
      const e = ends[0];
      out.push({ key: e.key, value: e.v, text: formatValue(e.v), memberId: e.memberId, base: e.base, at: e.at, leader: false, candidates: [add(e.at, e.out, 14), add(e.at, e.out, 26), add(add(e.at, e.inward, 22), e.out, 12)] });
      continue;
    }
    const jump = ends.length >= 2;
    for (const e of ends) {
      if (jump) {
        // salto: cada valor do lado da sua barra, longe do nó ao longo dela
        const a = add(e.at, e.inward, 30);
        out.push({
          key: e.key,
          value: e.v,
          text: formatValue(e.v),
          memberId: e.memberId,
          base: e.base,
          at: e.at,
          leader: true,
          candidates: [add(a, e.out, 12), add(a, e.out, 24), add(add(a, e.inward, 18), e.out, 12), add(add(a, e.inward, 36), e.out, 18), add(a, e.out, 38)],
        });
      } else {
        out.push({
          key: e.key,
          value: e.v,
          text: formatValue(e.v),
          memberId: e.memberId,
          base: e.base,
          at: e.at,
          leader: false,
          candidates: [add(e.at, e.out, 14), add(e.at, e.out, 26), add(add(e.at, e.inward, 24), e.out, 12), add(add(e.at, e.inward, 40), e.out, 16)],
        });
      }
    }
  }
  return out;
}
