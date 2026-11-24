import { describe, it, expect } from 'vitest';
import { analyze } from '../src/solver/analyze';
import { memberExtremes, memberStations } from '../src/solver/diagrams';
import { addArc, setNodalLoad, setSupport, splitMember, updateSection } from '../src/model/ops';
import { beam, expectClose, ok, PIN, refModel, ROLLER, withLoad } from './helpers';

describe('D4 — extremos exatos', () => {
  it('biapoiada com carga triangular: M máx = qL²/(9√3) em x = L/√3 (não por amostragem)', () => {
    const L = 6;
    const q = 12;
    const { m: m0, nodes, bars } = beam([0, L]);
    let m = withLoad(m0, bars[0], { dir: 'globalY', ref: 'length', qi: 0, qj: -q });
    m = setSupport(setSupport(m, nodes[0], PIN), nodes[1], ROLLER);
    const r = ok(analyze(m));
    const ex = memberExtremes(m, r, bars[0]);
    expectClose(ex.M.max.value, (q * L * L) / (9 * Math.sqrt(3)), 1e-12);
    expectClose(ex.M.max.x, L / Math.sqrt(3), 1e-12);
    // a estação do extremo entra no desenho
    const st = memberStations(m, r, bars[0], 40);
    expect(st.some((p) => Math.abs(p.s - L / Math.sqrt(3)) < 1e-12)).toBe(true);
    // cortante: extremos nas pontas, R_A = qL/6 e R_B = −qL/3
    expectClose(ex.Q.max.value, (q * L) / 6, 1e-12);
    expectClose(ex.Q.min.value, (-q * L) / 3, 1e-12);
  });

  it('carga axial linear: N extremo onde a carga axial zera', () => {
    const { m: m0, nodes, bars } = beam([0, 4]);
    let m = withLoad(m0, bars[0], { dir: 'globalX', ref: 'length', qi: 6, qj: -6 });
    m = setSupport(setSupport(m, nodes[0], PIN), nodes[1], { rx: true, ry: true, rz: false });
    const r = ok(analyze(m));
    const ex = memberExtremes(m, r, bars[0]);
    const st = memberStations(m, r, bars[0], 7);
    // o extremo de N está em x = 2 (onde px = 0), que não é estação da divisão em 7
    expect(Math.abs(ex.N.min.x - 2) < 1e-9 || Math.abs(ex.N.max.x - 2) < 1e-9).toBe(true);
    expect(st.some((p) => Math.abs(p.s - 2) < 1e-12)).toBe(true);
  });

  it('arco: extremos pelas estações dos nós da poligonal (o momento dentro do trecho reto é discretização)', () => {
    let m = updateSection(refModel(), 's1', { shape: { kind: 'generic', A: 100, I: 0.01 } });
    const a = addArc(m, { expr: 'x*(6-x)/6', xi: 0, xj: 6, nSeg: 10, sectionId: 's1' });
    if ('error' in a) throw new Error(a.error);
    m = a.model;
    const ni = m.members[0].ni;
    const nj = m.members[0].nj;
    const s = splitMember(m, a.id, 2);
    m = setNodalLoad(s.model, s.nodeId, { fx: 0, fy: -100, mz: 0 });
    m = setSupport(setSupport(m, ni, PIN), nj, PIN);
    const r = ok(analyze(m));
    for (const k of m.members) {
      const ex = memberExtremes(m, r, k.id);
      const st = memberStations(m, r, k.id);
      expect(ex.M.max.value).toBe(Math.max(...st.map((p) => p.M)));
      expect(ex.M.min.value).toBe(Math.min(...st.map((p) => p.M)));
      expect(ex.N.min.value).toBe(Math.min(...st.map((p) => p.N)));
    }
  });
});
