import { describe, it, expect } from 'vitest';
import { localStiffness, equivLoads, condense, toGlobal, vecToGlobal, vecToLocal } from '../src/solver/element';

const EA = 2.5e6;
const EI = 52083.333;
const L = 4;
const close = (a: number, b: number, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe('localStiffness', () => {
  const k = localStiffness(EA, EI, L);
  it('tem os termos clássicos nas posições certas', () => {
    close(k[0][0], EA / L);
    close(k[0][3], -EA / L);
    close(k[1][1], (12 * EI) / L ** 3);
    close(k[1][2], (6 * EI) / L ** 2);
    close(k[2][2], (4 * EI) / L);
    close(k[2][5], (2 * EI) / L);
    close(k[4][5], (-6 * EI) / L ** 2);
    close(k[0][1], 0);
  });
  it('é simétrica', () => {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) close(k[i][j], k[j][i]);
  });
});

describe('equivLoads', () => {
  it('carga uniforme transversal: wL/2 e ±wL²/12', () => {
    const w = -10;
    const f = equivLoads(L, { px1: 0, px2: 0, wy1: w, wy2: w });
    close(f[1], (w * L) / 2);
    close(f[2], (w * L * L) / 12);
    close(f[4], (w * L) / 2);
    close(f[5], (-w * L * L) / 12);
    close(f[0], 0);
  });
  it('carga triangular 0→w: 3wL/20 e 7wL/20', () => {
    const w = 12;
    const f = equivLoads(L, { px1: 0, px2: 0, wy1: 0, wy2: w });
    close(f[1], (3 * w * L) / 20);
    close(f[4], (7 * w * L) / 20);
  });
  it('carga axial linear', () => {
    const f = equivLoads(L, { px1: 3, px2: 6, wy1: 0, wy2: 0 });
    close(f[0], (L * (2 * 3 + 6)) / 6);
    close(f[3], (L * (3 + 2 * 6)) / 6);
  });
});

describe('condense', () => {
  it('rótula no fim: rigidez à rotação no início vale 3EI/L', () => {
    const k = localStiffness(EA, EI, L);
    const c = condense(k, equivLoads(L, { px1: 0, px2: 0, wy1: -10, wy2: -10 }), [5]);
    close(c.k[2][2], (3 * EI) / L);
    close(c.k[1][1], (3 * EI) / L ** 3);
    for (let i = 0; i < 6; i++) close(c.k[5][i], 0);
    // momento de engaste perfeito da viga engastada-rotulada: wL²/8
    close(c.feq[2], (-10 * L * L) / 8);
    close(c.feq[5], 0);
  });
  it('rótula nas duas extremidades: só termos axiais e momentos equivalentes nulos', () => {
    const k = localStiffness(EA, EI, L);
    const c = condense(k, equivLoads(L, { px1: 0, px2: 0, wy1: -10, wy2: -10 }), [2, 5]);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const axial = (i === 0 || i === 3) && (j === 0 || j === 3);
        if (!axial) close(c.k[i][j], 0, 1e-9);
      }
    }
    close(c.k[0][0], EA / L);
    close(c.feq[2], 0);
    close(c.feq[5], 0);
    close(c.feq[1], (-10 * L) / 2);
  });
  it('recover devolve a rotação liberada coerente com momento nulo', () => {
    const k = localStiffness(EA, EI, L);
    const fe = equivLoads(L, { px1: 0, px2: 0, wy1: -10, wy2: -10 });
    const c = condense(k, fe, [5]);
    const u = c.recover([0, 0, 0, 0, 0, 0]);
    // viga engastada-rotulada com carga uniforme: rotação na rótula = -wL³/(48EI)
    close(u[5], (10 * L ** 3) / (48 * EI), 1e-9);
    const m2 = k[5].reduce((acc, kij, j) => acc + kij * u[j], 0) - fe[5];
    close(m2, 0, 1e-9);
  });
});

describe('transformação de coordenadas', () => {
  it('a 90° troca os papéis de u e v', () => {
    const k = localStiffness(EA, EI, L);
    const g = toGlobal(k, 0, 1);
    close(g[0][0], (12 * EI) / L ** 3);
    close(g[1][1], EA / L);
    close(g[2][2], (4 * EI) / L);
  });
  it('vecToLocal desfaz vecToGlobal', () => {
    const c = Math.cos(0.7);
    const s = Math.sin(0.7);
    const v = [1, 2, 3, 4, 5, 6];
    const back = vecToLocal(vecToGlobal(v, c, s), c, s);
    v.forEach((x, i) => close(back[i], x));
  });
});
