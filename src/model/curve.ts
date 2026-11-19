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
  let px = xi;
  let py = fn(xi);
  if (!Number.isFinite(py)) return { ok: false, error: `A equação não é definida em x = ${fmt(xi)}` };
  for (let k = 1; k <= CURVE_SAMPLES; k++) {
    const x = k === CURVE_SAMPLES ? xj : xi + (span * k) / CURVE_SAMPLES;
    const y = fn(x);
    if (!Number.isFinite(y)) return { ok: false, error: `A equação não é definida em x = ${fmt(x)}` };
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  if (len > 1000 * span) {
    return { ok: false, error: 'A curva varia de forma brusca demais no intervalo (possível descontinuidade)' };
  }
  return { ok: true, fn };
}

function fmt(v: number): string {
  return String(Math.round(v * 1e4) / 1e4).replace('.', ',');
}
