/**
 * Equações prontas de arcos a partir do ponto inicial (x0, y0), do vão L e da
 * flecha f. Todas passam por (x0, y0), (x0 + L, y0) e (x0 + L/2, y0 + f).
 */

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
  if (!(f > 0) || !(L > 0)) throw new Error('Vão e flecha devem ser positivos');
  if (f > L / 2) throw new Error('No arco circular a flecha não pode passar de metade do vão');
  const R = (L * L) / 4 / (2 * f) + f / 2;
  const xc = x0 + L / 2;
  const yc = y0 + f - R;
  return `${plus(yc)}sqrt(${n(R * R)}-${shifted(xc)}^2)`;
}

export function catenary(x0: number, y0: number, L: number, f: number): string {
  if (!(f > 0) || !(L > 0)) throw new Error('Vão e flecha devem ser positivos');
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
