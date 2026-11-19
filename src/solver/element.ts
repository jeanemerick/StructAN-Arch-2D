/**
 * Elemento de pórtico plano (Euler–Bernoulli), GDL locais [u1, v1, θ1, u2, v2, θ2].
 * Convenção dos esforços de extremidade: f = k·u − feq (forças que os nós exercem
 * sobre o elemento, nos eixos locais).
 */

/** Cargas distribuídas lineares nos eixos locais, por metro de elemento (kN/m). */
export interface ElemLoad {
  px1: number;
  px2: number;
  wy1: number;
  wy2: number;
}

export type Mat = number[][];

export function zeros(n: number, m = n): Mat {
  return Array.from({ length: n }, () => new Array<number>(m).fill(0));
}

export function localStiffness(EA: number, EI: number, L: number): Mat {
  const a = EA / L;
  const b = (12 * EI) / L ** 3;
  const c = (6 * EI) / L ** 2;
  const d = (4 * EI) / L;
  const e = (2 * EI) / L;
  return [
    [a, 0, 0, -a, 0, 0],
    [0, b, c, 0, -b, c],
    [0, c, d, 0, -c, e],
    [-a, 0, 0, a, 0, 0],
    [0, -b, -c, 0, b, -c],
    [0, c, e, 0, -c, d],
  ];
}

/** Cargas nodais equivalentes (sentido dos GDL positivos) para carga linear. */
export function equivLoads(L: number, q: ElemLoad): number[] {
  const { px1, px2, wy1, wy2 } = q;
  return [
    (L * (2 * px1 + px2)) / 6,
    (L * (7 * wy1 + 3 * wy2)) / 20,
    (L * L * (3 * wy1 + 2 * wy2)) / 60,
    (L * (px1 + 2 * px2)) / 6,
    (L * (3 * wy1 + 7 * wy2)) / 20,
    (-L * L * (2 * wy1 + 3 * wy2)) / 60,
  ];
}

function inv(m: Mat): Mat {
  if (m.length === 1) return [[1 / m[0][0]]];
  const [[a, b], [c, d]] = m;
  const det = a * d - b * c;
  return [
    [d / det, -b / det],
    [-c / det, a / det],
  ];
}

/**
 * Condensação estática dos GDL liberados (rótulas: índices 2 e/ou 5).
 * Devolve matriz e vetor 6×6/6 com zeros nas posições liberadas e uma função que
 * recupera as rotações liberadas a partir dos deslocamentos locais dos demais GDL.
 */
export function condense(
  k: Mat,
  feq: number[],
  released: number[],
): { k: Mat; feq: number[]; recover(u: number[]): number[] } {
  if (released.length === 0) {
    return { k, feq, recover: (u) => u.slice() };
  }
  const r = released;
  const c = [0, 1, 2, 3, 4, 5].filter((i) => !r.includes(i));
  const krrInv = inv(r.map((i) => r.map((j) => k[i][j])));
  // A = k_cr · k_rr⁻¹  (|c| × |r|)
  const A = c.map((i) => r.map((_, q) => r.reduce((acc, j, p) => acc + k[i][j] * krrInv[p][q], 0)));
  const kc = zeros(6);
  const fc = new Array<number>(6).fill(0);
  c.forEach((i, ii) => {
    c.forEach((j) => {
      kc[i][j] = k[i][j] - r.reduce((acc, rj, q) => acc + A[ii][q] * k[rj][j], 0);
    });
    fc[i] = feq[i] - r.reduce((acc, rj, q) => acc + A[ii][q] * feq[rj], 0);
  });
  return {
    k: kc,
    feq: fc,
    recover(u: number[]): number[] {
      const out = u.slice();
      const rhs = r.map((ri) => feq[ri] - c.reduce((acc, j) => acc + k[ri][j] * u[j], 0));
      r.forEach((ri, p) => {
        out[ri] = r.reduce((acc, _, q) => acc + krrInv[p][q] * rhs[q], 0);
      });
      return out;
    },
  };
}

/** Kglobal = Tᵀ k T, com T = diag(R, R) e R = [[c, s, 0], [−s, c, 0], [0, 0, 1]]. */
export function toGlobal(k: Mat, c: number, s: number): Mat {
  const T = rotation(c, s);
  const kt = zeros(6);
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) {
      let acc = 0;
      for (let p = 0; p < 6; p++) acc += k[i][p] * T[p][j];
      kt[i][j] = acc;
    }
  const g = zeros(6);
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) {
      let acc = 0;
      for (let p = 0; p < 6; p++) acc += T[p][i] * kt[p][j];
      g[i][j] = acc;
    }
  return g;
}

function rotation(c: number, s: number): Mat {
  const T = zeros(6);
  for (const o of [0, 3]) {
    T[o][o] = c;
    T[o][o + 1] = s;
    T[o + 1][o] = -s;
    T[o + 1][o + 1] = c;
    T[o + 2][o + 2] = 1;
  }
  return T;
}

export function vecToGlobal(v: number[], c: number, s: number): number[] {
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2], v[3] * c - v[4] * s, v[3] * s + v[4] * c, v[5]];
}

export function vecToLocal(v: number[], c: number, s: number): number[] {
  return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2], v[3] * c + v[4] * s, -v[3] * s + v[4] * c, v[5]];
}
