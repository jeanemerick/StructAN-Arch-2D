import { describe, it, expect } from 'vitest';
import {
  emptyModel,
  sectionProps,
  addNode,
  addBar,
  addArc,
  updateArc,
  splitMember,
  updateNode,
  updateMember,
  setSupport,
  setNodalLoad,
  deleteNode,
  deleteMember,
  addSection,
  updateSection,
  deleteSection,
} from '../src/model/ops';
import type { Arc, Model } from '../src/model/types';

function node(m: Model, id: string) {
  const n = m.nodes.find((k) => k.id === id);
  if (!n) throw new Error(`nó ${id} não existe`);
  return n;
}

function okArc(m: Model, expr: string, xi: number, xj: number, nSeg = 40) {
  const r = addArc(m, { expr, xi, xj, nSeg, sectionId: m.sections[0].id });
  if ('error' in r) throw new Error(r.error);
  return r;
}

describe('modelo vazio e seções', () => {
  it('emptyModel tem versão 2 e uma seção padrão de 25 GPa, 20×40 cm, α = 1,0×10⁻⁵', () => {
    const m = emptyModel();
    expect(m.version).toBe(2);
    expect(m.sections[0].alpha).toBe(1e-5);
    expect(m.nodes).toEqual([]);
    expect(m.members).toEqual([]);
    expect(m.sections).toHaveLength(1);
    expect(m.sections[0].E).toBe(25e6);
    expect(m.sections[0].shape).toEqual({ kind: 'rect', b: 0.2, h: 0.4 });
  });
  it('sectionProps calcula EA e EI de retângulo, círculo e seção genérica', () => {
    const E = 25e6;
    expect(sectionProps({ id: 's', name: 'r', E, alpha: 1e-5, shape: { kind: 'rect', b: 0.2, h: 0.5 } })).toEqual({
      EA: E * 0.1,
      EI: E * (0.2 * 0.5 ** 3) / 12,
    });
    const c = sectionProps({ id: 's', name: 'c', E, alpha: 1e-5, shape: { kind: 'circ', d: 0.4 } });
    expect(c.EA).toBeCloseTo((E * Math.PI * 0.4 ** 2) / 4, 6);
    expect(c.EI).toBeCloseTo((E * Math.PI * 0.4 ** 4) / 64, 6);
    expect(sectionProps({ id: 's', name: 'g', E, alpha: 1e-5, shape: { kind: 'generic', A: 10, I: 0.001 } })).toEqual({
      EA: E * 10,
      EI: E * 0.001,
    });
  });
  it('addSection, updateSection e deleteSection; seção atribuída a barras não pode ser apagada', () => {
    let m = emptyModel();
    const a = addSection(m);
    m = a.model;
    expect(m.sections).toHaveLength(2);
    m = updateSection(m, a.id, { name: 'Pilar', E: 30e6 });
    expect(m.sections.find((s) => s.id === a.id)!.name).toBe('Pilar');
    const n1 = addNode(m, 0, 0);
    const n2 = addNode(n1.model, 4, 0);
    const b = addBar(n2.model, n1.id, n2.id);
    const used = updateMember(b.model, b.id, { sectionId: a.id });
    expect('error' in deleteSection(used, a.id)).toBe(true);
    const free = deleteSection(b.model, a.id);
    expect('error' in free).toBe(false);
    if (!('error' in free)) expect(free.sections).toHaveLength(1);
  });
});

describe('nós e barras', () => {
  it('addNode duas vezes no mesmo ponto devolve o mesmo id e um nó só', () => {
    const a = addNode(emptyModel(), 1, 2);
    const b = addNode(a.model, 1 + 1e-9, 2);
    expect(b.id).toBe(a.id);
    expect(b.model.nodes).toHaveLength(1);
  });
  it('operações não alteram o modelo original', () => {
    const m0 = emptyModel();
    const a = addNode(m0, 0, 0);
    expect(m0.nodes).toHaveLength(0);
    expect(a.model.nodes).toHaveLength(1);
  });
  it('addBar cria barra sem rótulas, sem cargas e com a primeira seção', () => {
    const a = addNode(emptyModel(), 0, 0);
    const b = addNode(a.model, 5, 0);
    const r = addBar(b.model, a.id, b.id);
    const bar = r.model.members.find((k) => k.id === r.id)!;
    expect(bar).toMatchObject({ kind: 'bar', ni: a.id, nj: b.id, hingeI: false, hingeJ: false, loads: [] });
    expect(bar.sectionId).toBe(r.model.sections[0].id);
  });
  it('updateNode, setSupport e setNodalLoad', () => {
    const a = addNode(emptyModel(), 0, 0);
    let m = updateNode(a.model, a.id, { x: 3 });
    m = setSupport(m, a.id, { rx: true, ry: true, rz: false });
    m = setNodalLoad(m, a.id, { fx: 0, fy: -10, mz: 0 });
    expect(node(m, a.id)).toMatchObject({ x: 3, y: 0, support: { rx: true, ry: true, rz: false }, load: { fy: -10 } });
    m = setSupport(m, a.id, undefined);
    expect(node(m, a.id).support).toBeUndefined();
  });
  it('deleteNode remove o nó e as barras ligadas a ele; deleteMember remove só a barra', () => {
    const a = addNode(emptyModel(), 0, 0);
    const b = addNode(a.model, 4, 0);
    const c = addNode(b.model, 8, 0);
    const ab = addBar(c.model, a.id, b.id);
    const bc = addBar(ab.model, b.id, c.id);
    const m1 = deleteNode(bc.model, b.id);
    expect(m1.nodes.map((n) => n.id)).toEqual([a.id, c.id]);
    expect(m1.members).toHaveLength(0);
    const m2 = deleteMember(bc.model, ab.id);
    expect(m2.members.map((k) => k.id)).toEqual([bc.id]);
    expect(m2.nodes).toHaveLength(3);
  });
});

describe('arcos', () => {
  it('addArc posiciona os nós das extremidades sobre a curva', () => {
    const r = okArc(emptyModel(), 'x*(20-x)/20', 0, 20);
    const arc = r.model.members.find((k) => k.id === r.id) as Arc;
    expect(arc.kind).toBe('arc');
    expect(arc.expr).toBe('x*(20-x)/20');
    expect(arc.nSeg).toBe(40);
    expect(node(r.model, arc.ni)).toMatchObject({ x: 0, y: 0 });
    expect(node(r.model, arc.nj)).toMatchObject({ x: 20, y: 0 });
  });
  it('addArc recusa x inicial maior que x final, equação inválida e nSeg fora de 4–200', () => {
    const m = emptyModel();
    const sid = m.sections[0].id;
    expect('error' in addArc(m, { expr: 'x*(20-x)/20', xi: 20, xj: 0, nSeg: 40, sectionId: sid })).toBe(true);
    expect('error' in addArc(m, { expr: '2x', xi: 0, xj: 10, nSeg: 40, sectionId: sid })).toBe(true);
    expect('error' in addArc(m, { expr: 'x', xi: 0, xj: 10, nSeg: 2, sectionId: sid })).toBe(true);
    expect('error' in addArc(m, { expr: 'sqrt(x)', xi: -1, xj: 10, nSeg: 40, sectionId: sid })).toBe(true);
  });
  it('updateArc troca a equação e reposiciona os nós das extremidades', () => {
    const r = okArc(emptyModel(), 'x*(20-x)/20', 0, 20);
    const arc = r.model.members[0] as Arc;
    const m = updateArc(r.model, r.id, { expr: '1+x*(20-x)/20', xj: 16 });
    if ('error' in m) throw new Error(m.error);
    expect(node(m, arc.ni)).toMatchObject({ x: 0, y: 1 });
    expect(node(m, arc.nj).x).toBe(16);
    expect(node(m, arc.nj).y).toBeCloseTo(1 + (16 * 4) / 20, 12);
    expect((m.members[0] as Arc).expr).toBe('1+x*(20-x)/20');
    expect('error' in updateArc(r.model, r.id, { expr: '2*(x' })).toBe(true);
  });
  it('splitMember em arco no x=10 cria nó em (10,5), dois arcos com a mesma equação e reparte a carga', () => {
    const r = okArc(emptyModel(), 'x*(20-x)/20', 0, 20);
    let m = updateMember(r.model, r.id, {
      hingeI: true,
      hingeJ: true,
      loads: [{ dir: 'globalY', ref: 'projection', qi: -10, qj: -20 }],
    });
    const s = splitMember(m, r.id, 10);
    m = s.model;
    expect(node(m, s.nodeId)).toMatchObject({ x: 10, y: 5 });
    expect(m.members).toHaveLength(2);
    const [a1, a2] = m.members as Arc[];
    expect(a1.expr).toBe('x*(20-x)/20');
    expect(a2.expr).toBe('x*(20-x)/20');
    expect(a1.nj).toBe(s.nodeId);
    expect(a2.ni).toBe(s.nodeId);
    expect(a1.loads[0]).toMatchObject({ qi: -10, qj: -15 });
    expect(a2.loads[0]).toMatchObject({ qi: -15, qj: -20 });
    expect([a1.hingeI, a1.hingeJ, a2.hingeI, a2.hingeJ]).toEqual([true, false, false, true]);
  });
  it('splitMember em barra na fração 0,25 cria nó a um quarto do comprimento', () => {
    const a = addNode(emptyModel(), 0, 0);
    const b = addNode(a.model, 8, 4);
    const bar = addBar(b.model, a.id, b.id);
    const s = splitMember(bar.model, bar.id, 0.25);
    expect(node(s.model, s.nodeId)).toMatchObject({ x: 2, y: 1 });
    expect(s.model.members).toHaveLength(2);
  });
});
