import { describe, it, expect } from 'vitest';
import { analyze } from '../src/solver/analyze';
import { memberStations, type Station } from '../src/solver/diagrams';
import { addArc, addBar, addNode, duplicate, moveNode, setNodalLoad, setSupport, splitMember, updateMember } from '../src/model/ops';
import { validateModel } from '../src/model/validate';
import { examples } from '../src/model/examples';
import type { Id, Model } from '../src/model/types';
import { buildChains, chainShape } from '../src/ui/diagramShapes';
import { computeLoadBands } from '../src/ui/loadBands';
import { memberPolyline, toScreen } from '../src/ui/geometry';
import { beam, expectEquilibrium, FIX, ok, PIN, reaction, refModel, ROLLER, uniformY, withLoad } from './helpers';

const relErr = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

/** Arco parabólico 6 × 1,5 somente flexão, nSeg por trecho, com nós inseridos nas abscissas dadas. */
function bendingArc(nSeg: number, cuts: number[], expr = 'x*(6-x)/6', xi = 0, xj = 6) {
  let m = refModel();
  const r = addArc(m, { expr, xi, xj, nSeg, sectionId: 's1' });
  if ('error' in r) throw new Error(r.error);
  m = updateMember(r.model, r.id, { behavior: 'bending' });
  const a = m.members[0].ni;
  const b = m.members[0].nj;
  const ids: string[] = [];
  for (const x of cuts) {
    const k = m.members.find((q) => {
      const ni = m.nodes.find((n) => n.id === q.ni)!;
      const nj = m.nodes.find((n) => n.id === q.nj)!;
      return x > ni.x && x < nj.x;
    })!;
    const s = splitMember(m, k.id, x);
    m = s.model;
    ids.push(s.nodeId);
  }
  return { m, a, b, ids };
}

describe('revisão — barra somente flexão em arco muito dividido', () => {
  it('nSeg 200 em 6 trechos: reações horizontais se anulam e a vertical soma a carga', () => {
    const c = bendingArc(200, [1, 2, 3, 4, 5]);
    let m = setSupport(setSupport(c.m, c.a, PIN), c.b, PIN);
    m = setNodalLoad(m, c.ids[2], { fx: 0, fy: -100, mz: 0 });
    const r = ok(analyze(m));
    const A = reaction(r, c.a);
    const B = reaction(r, c.b);
    expect(Math.abs(A.fx + B.fx)).toBeLessThan(1e-4);
    expect(Math.abs(A.fy + B.fy - 100)).toBeLessThan(1e-4);
  });

  it('semicírculo inextensível, nSeg 200: H = P/π (0,5%) e simétrico', () => {
    const c = bendingArc(200, [0], 'sqrt(25-x^2)', -5, 5);
    let m = setSupport(setSupport(c.m, c.a, PIN), c.b, PIN);
    m = setNodalLoad(m, c.ids[0], { fx: 0, fy: -100, mz: 0 });
    const r = ok(analyze(m));
    expect(relErr(reaction(r, c.a).fx, 100 / Math.PI)).toBeLessThan(0.005);
    expect(Math.abs(reaction(r, c.a).fx + reaction(r, c.b).fx)).toBeLessThan(1e-4);
  });

  it('arco isostático (2º e 1º gênero) aquecido, nSeg 200: N e M nulos', () => {
    const c = bendingArc(200, [3]);
    let m = setSupport(setSupport(c.m, c.a, PIN), c.b, ROLLER);
    for (const k of m.members) m = updateMember(m, k.id, { thermal: { tExt: 30, tInt: 30 } });
    const r = ok(analyze(m));
    for (const k of m.members) {
      for (const p of memberStations(m, r, k.id)) {
        expect(Math.abs(p.N)).toBeLessThan(1e-3);
        expect(Math.abs(p.M)).toBeLessThan(1e-3);
      }
    }
    // a nascença livre se desloca αΔT·L
    const st = memberStations(m, r, m.members[1].id);
    expect(relErr(st[st.length - 1].dx, 1e-5 * 30 * 6)).toBeLessThan(1e-3);
  });

  it('barra somente flexão impedida de alongar com temperatura gera aviso', () => {
    const { m: m0, nodes, bars } = beam([0, 6]);
    let m = setSupport(setSupport(m0, nodes[0], FIX), nodes[1], FIX);
    m = updateMember(m, bars[0], { behavior: 'bending', thermal: { tExt: 30, tInt: 30 } });
    const r = ok(analyze(m));
    expect(r.warnings.some((w) => /somente flexão/.test(w.message) && /alongar/.test(w.message))).toBe(true);
    // arco biarticulado inextensível aquecido: restrição só pela flexão, sem aviso
    const c = bendingArc(40, [3]);
    let a = setSupport(setSupport(c.m, c.a, PIN), c.b, PIN);
    for (const k of a.members) a = updateMember(a, k.id, { thermal: { tExt: 30, tInt: 30 } });
    expect(ok(analyze(a)).warnings.filter((w) => /alongar/.test(w.message))).toHaveLength(0);
  });
});

describe('revisão — duplicar e fundir nós', () => {
  it('viga duplicada com ΔX = vão vira viga contínua de dois vãos (nó do meio fundido)', () => {
    const L = 4;
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, L, 0);
    const bar = addBar(b.model, a.id, b.id);
    m = withLoad(bar.model, bar.id, uniformY(-10));
    m = setSupport(setSupport(m, a.id, PIN), b.id, ROLLER);
    const d = duplicate(m, { nodes: m.nodes.map((n) => n.id), members: [bar.id] }, L, 0);
    expect(d.model.nodes).toHaveLength(3);
    expect(d.model.members).toHaveLength(2);
    expect(d.selection.nodes).toContain(b.id);
    const r = ok(analyze(d.model));
    expectEquilibrium(d.model, r);
    // viga contínua de dois vãos iguais: reação central 1,25·qL
    expect(relErr(reaction(r, b.id).fy, 1.25 * 10 * L)).toBeLessThan(1e-9);
  });

  it('nós distintos no mesmo ponto (arquivo editado) são erro com orientação', () => {
    const { m: m0, nodes } = beam([0, 4]);
    const base = m0.members[0];
    let m: Model = {
      ...m0,
      nodes: [...m0.nodes, { id: 'n9', x: 4, y: 0 }, { id: 'n8', x: 8, y: 0 }],
      members: [...m0.members, { ...base, id: 'm9', ni: 'n9', nj: 'n8' }],
    };
    m = setSupport(setSupport(setSupport(m, nodes[0], PIN), nodes[1], ROLLER), 'n8', ROLLER);
    const e = validateModel(m).filter((i) => i.severity === 'error');
    expect(e.some((i) => /mesmo ponto/.test(i.message) && /n9/.test(i.message))).toBe(true);
  });

  it('fundir nós não deixa barras duplicadas (cargas somadas numa barra só)', () => {
    let m = refModel();
    const n1 = addNode(m, 0, 0);
    const n2 = addNode(n1.model, 0, 3);
    const n3 = addNode(n2.model, 4, 0);
    const n4 = addNode(n3.model, 4, 1);
    m = n4.model;
    const m1 = addBar(m, n1.id, n3.id);
    const m2 = addBar(m1.model, n2.id, n3.id);
    const m3 = addBar(m2.model, n1.id, n4.id);
    m = withLoad(withLoad(m3.model, m1.id, uniformY(-2)), m3.id, uniformY(-3));
    const mv = moveNode(m, n4.id, { y: 0 });
    if ('error' in mv) throw new Error(mv.error);
    const between = mv.model.members.filter((k) => [k.ni, k.nj].sort().join() === [n1.id, n3.id].sort().join());
    expect(between).toHaveLength(1);
    expect(between[0].loads.map((q) => q.qi).sort((x, y) => x - y)).toEqual([-3, -2]);
  });

  it('barras duplicadas vindas de arquivo são erro', () => {
    const { m: m0 } = beam([0, 4]);
    const m = { ...m0, members: [...m0.members, { ...m0.members[0], id: 'm7' }] };
    expect(validateModel(m).some((i) => i.severity === 'error' && /mesmos nós/.test(i.message))).toBe(true);
  });
});

describe('revisão — desenho', () => {
  it('M numa cadeia com barra desenhada ao contrário: um só sinal na viga toda fletida para baixo', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 3, 0);
    const c = addNode(b.model, 6, 0);
    const b1 = addBar(c.model, a.id, b.id);
    const b2 = addBar(b1.model, c.id, b.id);
    m = withLoad(withLoad(b2.model, b1.id, uniformY(-10)), b2.id, uniformY(-10));
    m = setSupport(setSupport(m, a.id, PIN), c.id, ROLLER);
    const r = ok(analyze(m));
    const st = new Map<Id, Station[]>(m.members.map((k) => [k.id, memberStations(m, r, k.id, 20)]));
    const [chain] = buildChains(m, st, 'M');
    const shape = chainShape(chain, 0.01);
    expect(shape.fills).toHaveLength(1);
    expect(shape.fills[0].sign).toBe(1);
    expect(Math.max(...chain.pts.map((p) => p.v))).toBeCloseTo(45, 9);
  });

  it('carga distribuída que troca de sinal fica sobre o eixo (a faixa não a representaria)', () => {
    const ex = examples.find((e) => e.slug === 'viga-biapoiada')!.build();
    const m = updateMember(ex, ex.members[0].id, { loads: [{ dir: 'globalY', ref: 'length', qi: -10, qj: 5 }] });
    const V = { scale: 50, ox: 100, oy: 400 };
    const world = new Map(m.members.map((k) => [k.id, memberPolyline(m, k)]));
    const screen = new Map([...world].map(([id, p]) => [id, p.map((q) => toScreen(V, q.x, q.y))]));
    const r = computeLoadBands(m, screen, world);
    expect(r.bands).toHaveLength(0);
    expect(r.onAxis).toHaveLength(1);
  });
});

