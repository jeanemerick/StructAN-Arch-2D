/** Números em pt-BR e conversões de unidade da interface (o núcleo trabalha em kN, m, rad). */

const NUM_RE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (!NUM_RE.test(t)) return null;
  const v = Number(t.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

export function formatNumber(v: number, digits: number): string {
  let s = v.toFixed(digits);
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  return s.replace('.', ',');
}

/** Formata com casas decimais de acordo com a ordem de grandeza. */
export function formatValue(v: number): string {
  if (Math.abs(v) < 1e-9) return '0';
  const a = Math.abs(Number(v.toPrecision(4)));
  if (a >= 1e4) return formatNumber(v, 0);
  if (a >= 100) return formatNumber(v, 1);
  if (a >= 1) return formatNumber(v, 2);
  return formatNumber(v, 3);
}

/** Fatores: valor_interno = valor_exibido × fator. */
export const UNIT = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  cm2: 1e-4,
  cm4: 1e-8,
  GPa: 1e6, // kN/m²
  kN: 1,
  rad: 1,
} as const;
