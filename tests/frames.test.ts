import { describe, it, expect } from 'vitest';
import { analyze } from '../src/solver/analyze';
import { ok, reaction, expectClose, expectEquilibrium, refModel, addNode, addBar, setSupport, setNodalLoad, updateMember, FIX, PIN, ROLLER, elemsOf } from './helpers';
import type { Model } from '../src/model/types';

function node(m: Model, x: number, y: number) {
  return addNode(m, x, y);
}

describe('treliça', () => {
  it('A(0,0) fixo, B(4,0) móvel, C(2,3), P=30 em C: reações 15/15, N(AC) = -18,028, N(AB) = +10', () => {
    let m = refModel();
    const A = node(m, 0, 0);
    m = A.model;
    const B = node(m, 4, 0);
    m = B.model;
    const C = node(m, 2, 3);
    m = C.model;
    const bars: string[] = [];
    for (const [i, j] of [
      [A.id, B.id],
      [A.id, C.id],
      [C.id, B.id],
    ]) {
      const r = addBar(m, i, j);
      m = updateMember(r.model, r.id, { hingeI: true, hingeJ: true });
      bars.push(r.id);
    }
    m = setSupport(m, A.id, PIN);
    m = setSupport(m, B.id, ROLLER);
    m = setNodalLoad(m, C.id, { fx: 0, fy: -30, mz: 0 });
    const r = ok(analyze(m));
    expectClose(reaction(r, A.id).fy, 15);
    expectClose(reaction(r, B.id).fy, 15);
    expectClose(reaction(r, A.id).fx, 0);
    // esforço normal = força na extremidade final, no eixo local x (tração positiva)
    const N = (bar: string) => r.endForces[elemsOf(r, bar)[0]][3];
    expectClose(N(bars[1]), (-15 * Math.sqrt(13)) / 3);
    expectClose(N(bars[1]), -18.028, 1e-4);
    expectClose(N(bars[0]), 10);
    // momentos nas extremidades nulos
    for (const b of bars) {
      const f = r.endForces[elemsOf(r, b)[0]];
      expect(Math.abs(f[2])).toBeLessThan(1e-9);
      expect(Math.abs(f[5])).toBeLessThan(1e-9);
    }
    expectEquilibrium(m, r);
  });
});

describe('pórtico', () => {
  it('pilares de 4 m engastados e viga de 6 m, 10 kN horizontais em cada nó superior: cortante de 10 kN em cada base', () => {
    let m = refModel();
    const a = node(m, 0, 0);
    m = a.model;
    const b = node(m, 0, 4);
    m = b.model;
    const c = node(m, 6, 4);
    m = c.model;
    const d = node(m, 6, 0);
    m = d.model;
    for (const [i, j] of [
      [a.id, b.id],
      [b.id, c.id],
      [d.id, c.id],
    ]) {
      m = addBar(m, i, j).model;
    }
    m = setSupport(m, a.id, FIX);
    m = setSupport(m, d.id, FIX);
    m = setNodalLoad(m, b.id, { fx: 10, fy: 0, mz: 0 });
    m = setNodalLoad(m, c.id, { fx: 10, fy: 0, mz: 0 });
    const r = ok(analyze(m));
    expectClose(reaction(r, a.id).fx, -10);
    expectClose(reaction(r, d.id).fx, -10);
    expectEquilibrium(m, r);
  });

  it('a reordenação não altera o resultado: mesma estrutura criada em outra ordem', () => {
    const build = (order: number[]) => {
      let m = refModel();
      const pts: [number, number][] = [
        [0, 0],
        [0, 4],
        [6, 4],
        [6, 0],
      ];
      const ids: string[] = [];
      for (const k of order) {
        const r = node(m, ...pts[k]);
        m = r.model;
        ids[k] = r.id;
      }
      m = addBar(m, ids[0], ids[1]).model;
      m = addBar(m, ids[1], ids[2]).model;
      m = addBar(m, ids[3], ids[2]).model;
      m = setSupport(m, ids[0], FIX);
      m = setSupport(m, ids[3], PIN);
      m = setNodalLoad(m, ids[1], { fx: 7, fy: -20, mz: 3 });
      const r = ok(analyze(m));
      return reaction(r, ids[0]);
    };
    const r1 = build([0, 1, 2, 3]);
    const r2 = build([2, 0, 3, 1]);
    expectClose(r1.fx, r2.fx);
    expectClose(r1.fy, r2.fy);
    expectClose(r1.mz, r2.mz);
  });
});
