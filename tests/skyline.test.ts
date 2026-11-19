import { describe, it, expect } from 'vitest';
import { Skyline, rcmOrder } from '../src/solver/skyline';

/** Gerador pseudoaleatório determinístico (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function denseSolve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let p = 0; p < n; p++) {
    let best = p;
    for (let i = p + 1; i < n; i++) if (Math.abs(M[i][p]) > Math.abs(M[best][p])) best = i;
    [M[p], M[best]] = [M[best], M[p]];
    for (let i = p + 1; i < n; i++) {
      const f = M[i][p] / M[p][p];
      for (let j = p; j <= n; j++) M[i][j] -= f * M[p][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

describe('Skyline', () => {
  it('resolve um sistema simétrico definido positivo de perfil variável igual à eliminação densa', () => {
    const n = 60;
    const r = rng(42);
    const first = new Int32Array(n);
    for (let j = 0; j < n; j++) first[j] = Math.max(0, j - Math.floor(r() * 7));
    const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let j = 0; j < n; j++)
      for (let i = first[j]; i < j; i++) {
        const v = r() * 2 - 1;
        A[i][j] = v;
        A[j][i] = v;
      }
    for (let i = 0; i < n; i++) A[i][i] = A[i].reduce((s, v) => s + Math.abs(v), 0) + 1 + r();
    const K = new Skyline(n, first);
    for (let j = 0; j < n; j++) for (let i = first[j]; i <= j; i++) K.add(i, j, A[i][j]);
    const b = Array.from({ length: n }, () => r() * 10 - 5);
    expect(K.diag(5)).toBeCloseTo(A[5][5], 12);
    expect(K.factor()).toEqual({ ok: true });
    const x = K.solve(Float64Array.from(b));
    const ref = denseSolve(A, b);
    for (let i = 0; i < n; i++) expect(Math.abs(x[i] - ref[i])).toBeLessThan(1e-9 * Math.max(1, Math.abs(ref[i])));
  });

  it('add acumula e aceita (i, j) em qualquer ordem', () => {
    const K = new Skyline(2, Int32Array.from([0, 0]));
    K.add(0, 0, 2);
    K.add(1, 0, 1);
    K.add(0, 1, 1);
    K.add(1, 1, 3);
    expect(K.factor()).toEqual({ ok: true });
    const x = K.solve(Float64Array.from([4, 7]));
    // [[2,2],[2,3]] x = [4,7] → x = [-1, 3]
    expect(x[0]).toBeCloseTo(-1, 12);
    expect(x[1]).toBeCloseTo(3, 12);
  });

  it('matriz singular falha indicando o pivô nulo', () => {
    const K = new Skyline(3, Int32Array.from([0, 0, 2]));
    K.add(0, 0, 1);
    K.add(0, 1, 1);
    K.add(1, 1, 1);
    K.add(2, 2, 1);
    expect(K.factor()).toEqual({ ok: false, index: 1 });
  });
});

describe('rcmOrder', () => {
  it('cadeia de 30 nós com numeração embaralhada fica com semilargura de banda 1', () => {
    const n = 30;
    const r = rng(7);
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    const edges: [number, number][] = [];
    for (let i = 0; i + 1 < n; i++) edges.push([p[i], p[i + 1]]);
    const perm = rcmOrder(n, edges);
    expect([...perm].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    const pos = new Array<number>(n);
    perm.forEach((old, nw) => (pos[old] = nw));
    const band = Math.max(...edges.map(([a, b]) => Math.abs(pos[a] - pos[b])));
    expect(band).toBe(1);
  });

  it('inclui nós isolados e componentes desconexas', () => {
    const perm = rcmOrder(5, [[0, 1], [3, 4]]);
    expect([...perm].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
