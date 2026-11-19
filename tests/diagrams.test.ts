import { describe, it, expect } from 'vitest';
import { analyze } from '../src/solver/analyze';
import { memberStations, extremes } from '../src/solver/diagrams';
import { beam, ok, expectClose, setSupport, setNodalLoad, withLoad, uniformY, FIX, PIN, ROLLER, EI_REF } from './helpers';

function at(st: { s: number }[], s: number) {
  return st.reduce((best, p) => (Math.abs(p.s - s) < Math.abs(best.s - s) ? p : best), st[0]) as ReturnType<typeof memberStations>[number];
}

describe('diagramas de barras', () => {
  it('biapoiada q=10, L=6: M(L/2)=45, Q nas pontas ±30, flecha no meio 3,24 mm', () => {
    const b = beam([0, 6]);
    let m = setSupport(b.m, b.nodes[0], PIN);
    m = setSupport(m, b.nodes[1], ROLLER);
    m = withLoad(m, b.bars[0], uniformY(-10));
    const r = ok(analyze(m));
    const st = memberStations(m, r, b.bars[0]);
    expect(st).toHaveLength(21);
    expectClose(at(st, 3).M, 45);
    expectClose(st[0].Q, 30);
    expectClose(st[20].Q, -30);
    expectClose(st[0].N, 0);
    expectClose(at(st, 3).dy, -(5 * 10 * 6 ** 4) / (384 * EI_REF));
    expectClose(at(st, 3).dy, -0.00324, 1e-6);
    expectClose(at(st, 3).x, 3);
    expect(st[0].tx).toBe(1);
    const ex = extremes(st);
    expectClose(ex.M[1], 45);
    expectClose(ex.Q[0], -30);
    expectClose(ex.disp, 0.00324, 1e-6);
  });

  it('biengastada q=10, L=6: M no meio +15 e nas pontas −30', () => {
    const b = beam([0, 6]);
    let m = setSupport(b.m, b.nodes[0], FIX);
    m = setSupport(m, b.nodes[1], FIX);
    m = withLoad(m, b.bars[0], uniformY(-10));
    const st = memberStations(m, ok(analyze(m)), b.bars[0]);
    expectClose(at(st, 3).M, 15);
    expectClose(st[0].M, -30);
    expectClose(st[20].M, -30);
    expectClose(at(st, 3).dy, -(10 * 6 ** 4) / (384 * EI_REF));
  });

  it('triangular 0→12: M máx 27,713 em s = 3,464', () => {
    const b = beam([0, 6]);
    let m = setSupport(b.m, b.nodes[0], PIN);
    m = setSupport(m, b.nodes[1], ROLLER);
    m = withLoad(m, b.bars[0], { dir: 'globalY', ref: 'length', qi: 0, qj: -12 });
    const st = memberStations(m, ok(analyze(m)), b.bars[0], 200);
    const best = st.reduce((p, q) => (q.M > p.M ? q : p));
    expectClose(best.M, (12 * 36) / (9 * Math.sqrt(3)), 1e-4);
    expect(Math.abs(best.s - 6 / Math.sqrt(3))).toBeLessThan(0.02);
  });

  it('engastada P=20, L=3: M(0) = −60 e deslocamento na ponta 3,456 mm', () => {
    const b = beam([0, 3]);
    let m = setSupport(b.m, b.nodes[0], FIX);
    m = setNodalLoad(m, b.nodes[1], { fx: 0, fy: -20, mz: 0 });
    const st = memberStations(m, ok(analyze(m)), b.bars[0]);
    expectClose(st[0].M, -60);
    expectClose(st[20].M, 0);
    expectClose(st[20].dy, -0.003456, 1e-6);
    expectClose(at(st, 1.5).dy, -(20 * 1.5 ** 2 * (3 * 3 - 1.5)) / (6 * EI_REF));
  });

  it('barra inclinada: esforço normal de compressão no pilar', () => {
    const b = beam([0, 4]);
    // gira a "viga" para vertical: nó final em (0,4)
    let m = { ...b.m, nodes: b.m.nodes.map((n) => (n.id === b.nodes[1] ? { ...n, x: 0, y: 4 } : n)) };
    m = setSupport(m, b.nodes[0], FIX);
    m = setNodalLoad(m, b.nodes[1], { fx: 0, fy: -50, mz: 0 });
    const st = memberStations(m, ok(analyze(m)), b.bars[0]);
    expectClose(st[0].N, -50);
    expectClose(st[20].N, -50);
    expectClose(st[0].tx, 0, 1e-12);
    expectClose(st[0].ty, 1);
    expectClose(st[20].dy, -(50 * 4) / (25e6 * 0.1));
  });
});
