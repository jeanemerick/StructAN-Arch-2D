import { describe, it, expect } from 'vitest';
import { analyze, type AnalysisOk } from '../src/solver/analyze';
import { memberStations, type Station } from '../src/solver/diagrams';
import { addArc, addBar, addNode, setNodalLoad, setSupport, splitMember, updateMember, updateSection } from '../src/model/ops';
import type { DistLoad, Id, Model } from '../src/model/types';
import { buildChains, chainShape } from '../src/ui/diagramShapes';
import { ok, PIN, refModel, ROLLER } from './helpers';

function stationsMap(m: Model, r: AnalysisOk): Map<Id, Station[]> {
  return new Map(m.members.map((k) => [k.id, memberStations(m, r, k.id, 40)]));
}

/** Arco dividido nas abscissas dadas, biarticulado, com a carga distribuída em todos os trechos. */
function dividedArc(expr: string, xi: number, xj: number, cuts: number[], load: DistLoad | null): { m: Model; r: AnalysisOk } {
  let m = updateSection(refModel(), 's1', { shape: { kind: 'generic', A: 10, I: 0.001 } });
  const a = addArc(m, { expr, xi, xj, nSeg: 40, sectionId: 's1' });
  if ('error' in a) throw new Error(a.error);
  m = a.model;
  if (load) m = updateMember(m, a.id, { loads: [load] });
  const left = m.members[0].ni;
  const right = m.members[0].nj;
  for (const x of cuts) m = splitMember(m, m.members[m.members.length - 1].id, x).model;
  m = setSupport(setSupport(m, left, PIN), right, PIN);
  return { m, r: ok(analyze(m)) };
}

describe('A2 — continuidade numérica de N nos nós internos de arcos divididos', () => {
  const cases: [string, string, number, number, number[], DistLoad][] = [
    ['parábola, carga por projeção', 'x*(6-x)/6', 0, 6, [1, 2, 4.5], { dir: 'globalY', ref: 'projection', qi: -10, qj: -10 }],
    ['parábola, carga por comprimento', 'x*(6-x)/6', 0, 6, [1, 2, 4.5], { dir: 'globalY', ref: 'length', qi: -10, qj: -10 }],
    ['semicírculo, peso próprio', 'sqrt(25-x^2)', -5, 5, [-4, -1, 2], { dir: 'globalY', ref: 'length', qi: -10, qj: -10 }],
    ['semicírculo, pressão normal, cortes perto das nascenças', 'sqrt(25-x^2)', -5, 5, [-4.9, 4.9], { dir: 'localY', ref: 'length', qi: -10, qj: -10 }],
  ];
  for (const [name, expr, xi, xj, cuts, load] of cases) {
    it(name, () => {
      const { m, r } = dividedArc(expr, xi, xj, cuts, load);
      const st = m.members.map((k) => memberStations(m, r, k.id));
      const maxN = Math.max(...st.flat().map((p) => Math.abs(p.N)));
      for (let i = 0; i + 1 < st.length; i++) {
        const a = st[i][st[i].length - 1];
        const b = st[i + 1][0];
        expect(Math.abs(a.x - b.x)).toBeLessThan(1e-12);
        expect(Math.abs(a.N - b.N) / maxN, `salto de N em x = ${a.x}`).toBeLessThan(1e-6);
        expect(Math.abs(a.M - b.M)).toBeLessThan(1e-6 * maxN);
      }
    });
  }
});

describe('A2 — cadeias de desenho', () => {
  it('arco dividido em quatro trechos sem carga nos nós vira uma cadeia só em N, Q e M', () => {
    const { m, r } = dividedArc('x*(6-x)/6', 0, 6, [1, 2, 4.5], { dir: 'globalY', ref: 'length', qi: -10, qj: -10 });
    const st = stationsMap(m, r);
    for (const effort of ['N', 'Q', 'M'] as const) {
      const chains = buildChains(m, st, effort);
      expect(chains, effort).toHaveLength(1);
      expect(chains[0].members).toHaveLength(4);
      // pontos das emendas não se repetem
      const xs = chains[0].pts.map((p) => p.x);
      expect(new Set(xs).size).toBe(xs.length);
    }
  });

  it('contorno sem parede no nó que só divide o arco e um polígono por trecho de mesmo sinal', () => {
    const { m, r } = dividedArc('x*(6-x)/6', 0, 6, [3], { dir: 'globalY', ref: 'projection', qi: -10, qj: -10 });
    const st = stationsMap(m, r);
    const [chain] = buildChains(m, st, 'N');
    const shape = chainShape(chain, 0.01);
    // o contorno passa pelo eixo só nas duas pontas
    expect(shape.outline).toHaveLength(chain.pts.length + 2);
    const crown = { x: 3, y: 1.5 };
    expect(shape.outline.some((p) => Math.hypot(p.x - crown.x, p.y - crown.y) < 1e-9)).toBe(false);
    // N < 0 em todo o arco: um único polígono
    expect(shape.fills).toHaveLength(1);
    expect(shape.fills[0].sign).toBe(-1);
  });

  it('caso 6.1 (P no fecho): N e M contínuos numa cadeia; Q salta e fica em duas', () => {
    let { m } = dividedArc('x*(6-x)/6', 0, 6, [3], null);
    const crown = m.members[0].nj;
    m = setSupport(m, m.members[1].nj, ROLLER);
    m = setNodalLoad(m, crown, { fx: 0, fy: -100, mz: 0 });
    const r = ok(analyze(m));
    const st = stationsMap(m, r);
    expect(buildChains(m, st, 'N')).toHaveLength(1);
    expect(buildChains(m, st, 'M')).toHaveLength(1);
    expect(buildChains(m, st, 'Q')).toHaveLength(2);
  });

  it('M troca de sinal: um polígono por trecho de mesmo sinal, com o zero no eixo', () => {
    // biarticulado com carga só na metade esquerda: M muda de sinal ao longo do arco
    let { m } = dividedArc('x*(6-x)/6', 0, 6, [3], null);
    m = updateMember(m, m.members[0].id, { loads: [{ dir: 'globalY', ref: 'projection', qi: -10, qj: -10 }] });
    const r = ok(analyze(m));
    const [chain] = buildChains(m, stationsMap(m, r), 'M');
    const shape = chainShape(chain, 0.01);
    const signs = shape.fills.map((f) => f.sign);
    expect(signs.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < signs.length; i++) expect(signs[i]).not.toBe(signs[i - 1]);
  });

  it('viga em duas barras de sentidos opostos: cadeia única e N, Q desenhados do mesmo lado', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 3, 0);
    const c = addNode(b.model, 6, 0);
    m = c.model;
    const b1 = addBar(m, a.id, b.id);
    const b2 = addBar(b1.model, c.id, b.id); // desenhada da direita para a esquerda
    m = b2.model;
    const q: DistLoad = { dir: 'globalY', ref: 'length', qi: -10, qj: -10 };
    m = updateMember(updateMember(m, b1.id, { loads: [q] }), b2.id, { loads: [q] });
    m = setSupport(setSupport(m, a.id, PIN), c.id, ROLLER);
    m = setNodalLoad(m, a.id, { fx: 0, fy: 0, mz: 0 });
    const r = ok(analyze(m));
    const st = stationsMap(m, r);
    const qc = buildChains(m, st, 'Q');
    expect(qc).toHaveLength(1);
    expect(new Set(qc[0].pts.map((p) => Math.sign(p.dy))).size).toBe(1);
    // M: o valor troca de sinal com o sentido da barra, mas o desenho fica do mesmo lado
    const mcs = buildChains(m, st, 'M');
    expect(mcs).toHaveLength(1);
    expect(new Set(mcs[0].pts.filter((p) => Math.abs(p.v) > 1e-6).map((p) => Math.sign(p.v * p.dy))).size).toBe(1);
    // M do lado tracionado (embaixo): desenho para −Y com M > 0
    const [mc] = buildChains(m, st, 'M');
    const mid = mc.pts.find((p) => Math.abs(p.x - 3) < 1e-9)!;
    expect(mid.v * mid.dy).toBeLessThan(0);
  });

  it('cantos de pórtico não emendam (o eixo muda de direção)', () => {
    let m = refModel();
    const ids: string[] = [];
    for (const [x, y] of [
      [0, 0],
      [0, 4],
      [6, 4],
      [6, 0],
    ]) {
      const r = addNode(m, x, y);
      m = r.model;
      ids.push(r.id);
    }
    m = addBar(m, ids[0], ids[1]).model;
    m = addBar(m, ids[1], ids[2]).model;
    m = addBar(m, ids[2], ids[3]).model;
    m = setSupport(setSupport(m, ids[0], PIN), ids[3], PIN);
    m = setNodalLoad(m, ids[1], { fx: 10, fy: 0, mz: 0 });
    const r = ok(analyze(m));
    expect(buildChains(m, stationsMap(m, r), 'M')).toHaveLength(3);
  });
});
