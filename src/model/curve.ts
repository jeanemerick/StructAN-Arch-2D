import { compileExpr } from '../expr/parser';

/** Número de intervalos na amostragem da curva de um arco. */
export const CURVE_SAMPLES = 4096;

export const NSEG_MIN = 4;
export const NSEG_MAX = 200;

/**
 * Compila a equação do arco e verifica se ela é definida e contínua em [xi, xj].
 * Devolve a função ou uma mensagem de erro em pt-BR.
 */
export function compileArcCurve(
  expr: string,
  xi: number,
  xj: number,
): { ok: true; fn: (x: number) => number } | { ok: false; error: string } {
  const c = compileExpr(expr);
  if (!c.ok) return { ok: false, error: `Equação inválida: ${c.error}` };
  if (!Number.isFinite(xi) || !Number.isFinite(xj)) return { ok: false, error: 'Limites do arco inválidos' };
  if (!(xj > xi)) return { ok: false, error: 'O x inicial do arco deve ser menor que o x final' };
  const fn = c.fn;
  const span = xj - xi;
  let len = 0;
  const xs = new Float64Array(CURVE_SAMPLES + 1);
  const ys = new Float64Array(CURVE_SAMPLES + 1);
  xs[0] = xi;
  ys[0] = fn(xi);
  if (!Number.isFinite(ys[0])) return { ok: false, error: `A equação não é definida em x = ${fmt(xi)}` };
  for (let k = 1; k <= CURVE_SAMPLES; k++) {
    const x = k === CURVE_SAMPLES ? xj : xi + (span * k) / CURVE_SAMPLES;
    const y = fn(x);
    if (!Number.isFinite(y)) return { ok: false, error: `A equação não é definida em x = ${fmt(x)}` };
    xs[k] = x;
    ys[k] = y;
    len += Math.hypot(x - xs[k - 1], y - ys[k - 1]);
  }
  if (len > 1000 * span) {
    return { ok: false, error: 'A curva varia de forma brusca demais no intervalo (possível descontinuidade)' };
  }
  const jump = findJump(fn, xs, ys);
  if (jump !== null) return { ok: false, error: `A equação tem um salto (descontinuidade) perto de x = ${fmt(jump)}` };
  return { ok: true, fn };
}

/**
 * Procura saltos em degrau (como x/abs(x)): um intervalo da amostragem com variação muito maior
 * que a dos vizinhos é dividido ao meio repetidas vezes; numa curva contínua a variação some,
 * num salto ela não diminui. Devolve a abscissa do salto ou null.
 */
function findJump(fn: (x: number) => number, xs: Float64Array, ys: Float64Array): number | null {
  const n = xs.length - 1;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const y of ys) {
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  const scale = Math.max(yMax - yMin, xs[n] - xs[0], 1e-9);
  for (let k = 1; k <= n; k++) {
    const d = Math.abs(ys[k] - ys[k - 1]);
    const prev = k > 1 ? Math.abs(ys[k - 1] - ys[k - 2]) : 0;
    const next = k < n ? Math.abs(ys[k + 1] - ys[k]) : 0;
    if (d < 1e-7 * scale || d < 20 * Math.max(prev, next)) continue;
    let a = xs[k - 1];
    let b = xs[k];
    let ya = ys[k - 1];
    let yb = ys[k];
    for (let i = 0; i < 60; i++) {
      const m = (a + b) / 2;
      const ym = fn(m);
      if (!Number.isFinite(ym)) return m;
      if (Math.abs(ym - ya) >= Math.abs(yb - ym)) {
        b = m;
        yb = ym;
      } else {
        a = m;
        ya = ym;
      }
    }
    if (Math.abs(yb - ya) > 1e-6 * scale) return (a + b) / 2;
  }
  return null;
}

function fmt(v: number): string {
  return String(Math.round(v * 1e4) / 1e4).replace('.', ',');
}
