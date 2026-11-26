import { describe, it, expect } from 'vitest';
import { analyze } from '../src/solver/analyze';
import { memberStations } from '../src/solver/diagrams';
import { addBar, addNode, duplicate, mergeNodes, setNodalLoad, setNodeHinge, setSupport, updateMember } from '../src/model/ops';
import { parseModel, serialize } from '../src/model/io';
import { examples } from '../src/model/examples';
import type { Model } from '../src/model/types';
import { hingeMarks } from '../src/ui/hinges';
import { expectClose, expectEquilibrium, FIX, ok, PIN, reaction, refModel, uniformY, withLoad } from './helpers';

/** Pórtico 0–4–6 com três barras e carga lateral; devolve os ids. */
function portal(): { m: Model; n: string[]; b: string[] } {
  let m = refModel();
  const n: string[] = [];
  for (const [x, y] of [
    [0, 0],
    [0, 4],
    [6, 4],
    [6, 0],
  ]) {
    const r = addNode(m, x, y);
    m = r.model;
    n.push(r.id);
  }
  const b: string[] = [];
  for (const [i, j] of [
    [0, 1],
    [1, 2],
    [3, 2],
  ]) {
    const r = addBar(m, n[i], n[j]);
    m = r.model;
    b.push(r.id);
  }
  m = setSupport(setSupport(m, n[0], FIX), n[3], FIX);
  m = setNodalLoad(m, n[1], { fx: 10, fy: 0, mz: 0 });
  m = withLoad(m, b[1], uniformY(-12));
  return { m, n, b };
}

describe('rótula atribuída pelo nó', () => {
  it('rótula no nó equivale a rotular as pontas de todas as barras que chegam a ele', () => {
    const { m, n, b } = portal();
    const byNode = setNodeHinge(m, n[2], true);
    const byEnds = updateMember(updateMember(m, b[1], { hingeJ: true }), b[2], { hingeJ: true });
    const r1 = ok(analyze(byNode));
    const r2 = ok(analyze(byEnds));
    expectEquilibrium(byNode, r1);
    for (const id of [n[0], n[3]]) {
      expectClose(reaction(r1, id).fx, reaction(r2, id).fx, 1e-9);
      expectClose(reaction(r1, id).mz, reaction(r2, id).mz, 1e-9);
    }
    // momento nulo no nó rotulado, nas duas barras
    for (const id of [b[1], b[2]]) {
      const st = memberStations(byNode, r1, id);
      expect(Math.abs(st[st.length - 1].M)).toBeLessThan(1e-9);
    }
  });

  it('nó rotulado onde chegam três barras: M nulo em todas as pontas do nó', () => {
    let { m, n } = portal();
    const top = addNode(m, 6, 7);
    m = addBar(top.model, n[2], top.id).model;
    m = setNodalLoad(m, top.id, { fx: 0, fy: -5, mz: 0 });
    m = setSupport(m, top.id, { rx: true, ry: false, rz: false });
    m = setNodeHinge(m, n[2], true);
    const r = ok(analyze(m));
    expectEquilibrium(m, r);
    for (const k of m.members.filter((q) => q.ni === n[2] || q.nj === n[2])) {
      const st = memberStations(m, r, k.id);
      const end = k.ni === n[2] ? st[0] : st[st.length - 1];
      expect(Math.abs(end.M)).toBeLessThan(1e-9);
    }
  });

  it('arco triarticulado da imagem 1 com a rótula do fecho atribuída pelo nó: H = 30 e M ≈ 0', () => {
    const m = examples.find((e) => e.slug === 'arco-triarticulado-faixa')!.build();
    const crown = m.nodes.find((q) => Math.abs(q.x - 3) < 1e-9)!;
    expect(crown.hinge).toBe(true);
    expect(m.members.every((k) => !k.hingeI && !k.hingeJ)).toBe(true);
    const r = ok(analyze(m));
    expect(reaction(r, m.members[0].ni).fx).toBeCloseTo(30, 2);
    for (const k of m.members) for (const p of memberStations(m, r, k.id)) expect(Math.abs(p.M)).toBeLessThan(0.5);
  });

  it('momento aplicado em nó rotulado gera o aviso de sempre', () => {
    let { m, n } = portal();
    m = setNodeHinge(m, n[2], true);
    m = setNodalLoad(m, n[2], { fx: 0, fy: 0, mz: 5 });
    expect(ok(analyze(m)).warnings.some((w) => /momento aplicado/.test(w.message))).toBe(true);
  });

  it('salvar e abrir mantém a rótula do nó (arquivo versão 3); versões 1 e 2 continuam abrindo', () => {
    let { m, n } = portal();
    m = setNodeHinge(m, n[2], true);
    expect(m.version).toBe(3);
    const back = parseModel(serialize(m));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.model).toEqual(m);
    const v2 = JSON.parse(serialize(portal().m));
    v2.version = 2;
    const r2 = parseModel(JSON.stringify(v2));
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.model.version).toBe(3);
      expect(r2.model.nodes.every((q) => !q.hinge)).toBe(true);
    }
    const bad = { ...JSON.parse(serialize(m)), nodes: [{ id: 'n1', x: 0, y: 0, hinge: 'sim' }] };
    expect(parseModel(JSON.stringify(bad)).ok).toBe(false);
  });

  it('fundir nós e duplicar levam a rótula do nó', () => {
    let { m, n } = portal();
    m = setNodeHinge(m, n[2], true);
    const extra = addNode(m, 6, 4.0005);
    const merged = mergeNodes(extra.model, n[2], extra.id);
    expect(merged.nodes.find((q) => q.id === n[2])!.hinge).toBe(true);
    const d = duplicate(m, { nodes: m.nodes.map((q) => q.id), members: m.members.map((k) => k.id) }, 20, 0);
    expect(d.model.nodes.filter((q) => q.hinge)).toHaveLength(2);
  });

  it('setNodeHinge desligado remove o campo', () => {
    let { m, n } = portal();
    m = setNodeHinge(setNodeHinge(m, n[2], true), n[2], false);
    expect('hinge' in m.nodes.find((q) => q.id === n[2])!).toBe(false);
  });
});

describe('desenho das rótulas', () => {
  it('exemplo 1 (arco, rótula pelo nó C): uma rótula única no nó e nenhuma de extremidade', () => {
    const m = examples.find((e) => e.slug === 'arco-triarticulado-faixa')!.build();
    const h = hingeMarks(m);
    expect(h.nodes).toHaveLength(1);
    expect(h.ends).toHaveLength(0);
  });

  it('exemplo 2 (pórtico com tirantes): pilar central contínuo e uma rótula na ponta de cada tirante', () => {
    const m = examples.find((e) => e.slug === 'portico-duas-aguas-tirantes')!.build();
    const h = hingeMarks(m);
    expect(h.nodes).toHaveLength(0);
    const ties = m.members.filter((k) => k.behavior === 'axial').map((k) => k.id);
    expect(h.ends).toHaveLength(4);
    expect(new Set(h.ends.map((e) => e.memberId))).toEqual(new Set(ties));
    // no nó do pilar central chegam duas rótulas, uma de cada tirante
    const central = m.nodes.find((q) => q.x === 4 && q.y === 4)!;
    const atCentral = h.ends.filter((e) => {
      const k = m.members.find((q) => q.id === e.memberId)!;
      return (e.end === 'i' ? k.ni : k.nj) === central.id;
    });
    expect(atCentral).toHaveLength(2);
  });

  it('com o nó rotulado, as pontas rotuladas das barras ali não se repetem no desenho', () => {
    let { m, n, b } = portal();
    m = updateMember(m, b[1], { hingeJ: true });
    m = setNodeHinge(m, n[2], true);
    const h = hingeMarks(m);
    expect(h.nodes).toEqual([n[2]]);
    expect(h.ends).toHaveLength(0);
  });

  it('pino de apoio não vira rótula de nó (o apoio de 2º gênero já tem desenho próprio)', () => {
    const { m } = portal();
    const h = hingeMarks(setSupport(m, m.nodes[0].id, PIN));
    expect(h.nodes).toHaveLength(0);
  });
});
