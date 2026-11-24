/**
 * Equações prontas de arcos a partir do ponto inicial (x0, y0), do vão L e da
 * altura do arco f. Todas passam por (x0, y0), (x0 + L, y0) e (x0 + L/2, y0 + f).
 * arcBetween gera a equação entre dois pontos quaisquer (nascenças em níveis diferentes),
 * com a altura medida a partir da corda, no meio do vão.
 */
import type { ArcShape } from './types';

function n(v: number): string {
  return String(Number(v.toPrecision(15)));
}

/** "(x-a)" com o sinal tratado; "x" quando a = 0. */
function shifted(a: number): string {
  if (a === 0) return 'x';
  return a > 0 ? `(x-${n(a)})` : `(x+${n(-a)})`;
}

function plus(c: number): string {
  return c === 0 ? '' : `${n(c)}+`;
}

export function parabola(x0: number, y0: number, L: number, f: number): string {
  const u = shifted(x0);
  return `${plus(y0)}4*${n(f)}*${u}*(${n(L)}-${u})/${n(L)}^2`;
}

export function circular(x0: number, y0: number, L: number, f: number): string {
  if (!(f > 0) || !(L > 0)) throw new Error('Vão e altura do arco devem ser positivos');
  if (f > L / 2) throw new Error('No arco circular a altura do arco não pode passar de metade do vão');
  const R = (L * L) / 4 / (2 * f) + f / 2;
  const xc = x0 + L / 2;
  const yc = y0 + f - R;
  return `${plus(yc)}sqrt(${n(R * R)}-${shifted(xc)}^2)`;
}

export function catenary(x0: number, y0: number, L: number, f: number): string {
  if (!(f > 0) || !(L > 0)) throw new Error('Vão e altura do arco devem ser positivos');
  // a·(cosh(L/2a) − 1) = f, decrescente em a
  const g = (a: number) => a * (Math.cosh(L / (2 * a)) - 1) - f;
  let lo = L / 1400;
  let hi = (L * L) / (4 * f) + L;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) lo = mid;
    else hi = mid;
  }
  const a = (lo + hi) / 2;
  const xc = x0 + L / 2;
  return `${n(y0 + f + a)}-${n(a)}*cosh(${shifted(xc)}/${n(a)})`;
}

export interface ArcEnds {
  x: number;
  y: number;
}

const SHAPE_NAME: Record<ArcShape, string> = { parabola: 'parábola', circular: 'arco circular', catenary: 'catenária' };

/**
 * Equação do arco entre os pontos A e B (em qualquer ordem: o da esquerda vira o inicial),
 * com altura `rise` medida a partir da corda AB, na vertical, no meio do vão.
 * Lança Error com mensagem em pt-BR quando a forma não é viável.
 */
export function arcBetween(shape: ArcShape, A: ArcEnds, B: ArcEnds, rise: number): { expr: string; xi: number; xj: number } {
  const [P, Q] = A.x <= B.x ? [A, B] : [B, A];
  const L = Q.x - P.x;
  if (!(Math.abs(L) > 1e-9)) throw new Error('Os nós do arco precisam ter abscissas diferentes (o arco é y = f(x))');
  if (!(rise > 0)) throw new Error('A altura do arco deve ser positiva');
  const dy = Q.y - P.y;
  const xi = P.x;
  const xj = Q.x;
  if (shape === 'parabola') {
    if (dy === 0) return { expr: parabola(P.x, P.y, L, rise), xi, xj };
    const u = shifted(P.x);
    return { expr: `${plus(P.y)}${n(dy / L)}*${u}+4*${n(rise)}*${u}*(${n(L)}-${u})/${n(L)}^2`, xi, xj };
  }
  if (shape === 'circular') {
    if (dy === 0) {
      if (rise > L / 2) throw new Error('No arco circular a altura do arco não pode passar de metade do vão');
      return { expr: circular(P.x, P.y, L, rise), xi, xj };
    }
    // circunferência pelos três pontos: nascenças e ponto a `rise` da corda no meio do vão
    const M = { x: P.x + L / 2, y: (P.y + Q.y) / 2 + rise };
    const c = circumcenter(P, Q, M);
    if (!c) throw new Error('Não foi possível ajustar o arco circular');
    const R = Math.hypot(P.x - c.x, P.y - c.y);
    // o arco precisa ser a metade de cima da circunferência para ser y = f(x)
    if (P.y < c.y - 1e-9 || Q.y < c.y - 1e-9) {
      throw new Error('Com essa altura do arco e esses níveis o arco circular passaria da vertical: diminua a altura do arco ou escolha a parábola');
    }
    return { expr: `${plus(c.y)}sqrt(${n(R * R)}-${shifted(c.x)}^2)`, xi, xj };
  }
  // catenária y = c − a·cosh((x − x0)/a)
  if (dy === 0) return { expr: catenary(P.x, P.y, L, rise), xi, xj };
  const fit = fitCatenary(P, Q, rise);
  if (!fit) throw new Error(`Não foi possível ajustar a ${SHAPE_NAME.catenary} com essa altura do arco e esses níveis: experimente a parábola`);
  return { expr: `${n(fit.c)}-${n(fit.a)}*cosh(${shifted(fit.x0)}/${n(fit.a)})`, xi, xj };
}

function circumcenter(a: ArcEnds, b: ArcEnds, c: ArcEnds): ArcEnds | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return { x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d };
}

/** Catenária pelos pontos P e Q com altura `rise` sobre a corda no meio do vão (bisseções aninhadas). */
function fitCatenary(P: ArcEnds, Q: ArcEnds, rise: number): { a: number; x0: number; c: number } | null {
  const L = Q.x - P.x;
  const xm = P.x + L / 2;
  const chordMid = (P.y + Q.y) / 2;
  // para um a dado, x0 tal que a curva passe por P e Q: g(x0) = a[cosh(uP) − cosh(uQ)] − (Q.y − P.y), crescente em x0
  const solveX0 = (a: number): number | null => {
    const g = (x0: number) => a * (Math.cosh((P.x - x0) / a) - Math.cosh((Q.x - x0) / a)) - (Q.y - P.y);
    // intervalo em que cosh não estoura (|u| ≤ 700)
    let lo = Q.x - 700 * a;
    let hi = P.x + 700 * a;
    if (!(lo < hi)) return null;
    let glo = g(lo);
    let ghi = g(hi);
    if (!Number.isFinite(glo) || !Number.isFinite(ghi) || glo * ghi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const gm = g(mid);
      if (!Number.isFinite(gm)) return null;
      if (gm * glo > 0) {
        lo = mid;
        glo = gm;
      } else {
        hi = mid;
        ghi = gm;
      }
    }
    return (lo + hi) / 2;
  };
  const riseOf = (a: number): number | null => {
    const x0 = solveX0(a);
    if (x0 === null) return null;
    const c = P.y + a * Math.cosh((P.x - x0) / a);
    return c - a * Math.cosh((xm - x0) / a) - chordMid;
  };
  // a altura cai quando a cresce; procura o intervalo e faz bisseção
  let lo = L / 400;
  let hi = L;
  let rhi = riseOf(hi);
  let guard = 0;
  while ((rhi === null || rhi > rise) && guard++ < 60) {
    hi *= 2;
    rhi = riseOf(hi);
  }
  let rlo = riseOf(lo);
  guard = 0;
  while ((rlo === null || rlo < rise) && guard++ < 60) {
    lo /= 1.5;
    rlo = riseOf(lo);
  }
  if (rhi === null || rlo === null || rlo < rise || rhi > rise) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const r = riseOf(mid);
    if (r === null) return null;
    if (r > rise) lo = mid;
    else hi = mid;
  }
  const a = (lo + hi) / 2;
  const x0 = solveX0(a);
  if (x0 === null) return null;
  return { a, x0, c: P.y + a * Math.cosh((P.x - x0) / a) };
}
