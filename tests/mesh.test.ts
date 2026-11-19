import { describe, it, expect } from 'vitest';
import { arcPoints, buildMesh } from '../src/solver/mesh';
import { emptyModel, addNode, addBar, addArc, updateMember } from '../src/model/ops';
import type { Model } from '../src/model/types';

describe('arcPoints', () => {
  it('divide o semicírculo em cordas iguais com extremos exatos', () => {
    const fn = (x: number) => Math.sqrt(25 - x * x);
    const pts = arcPoints(fn, -5, 5, 10);
    expect(pts).toHaveLength(11);
    expect(pts[0]).toEqual({ x: -5, y: 0 });
    expect(pts[10]).toEqual({ x: 5, y: 0 });
    for (const p of pts) expect(Math.abs(Math.hypot(p.x, p.y) - 5)).toBeLessThan(1e-9);
    const chords = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const mean = chords.reduce((a, b) => a + b, 0) / chords.length;
    for (const c of chords) expect(Math.abs(c / mean - 1)).toBeLessThan(0.01);
    const total = chords.reduce((a, b) => a + b, 0);
    expect(Math.abs(total / 15.643 - 1)).toBeLessThan(0.005);
  });
});

function barModel(x2: number, y2: number): { m: Model; bar: string } {
  const a = addNode(emptyModel(), 0, 0);
  const b = addNode(a.model, x2, y2);
  const r = addBar(b.model, a.id, b.id);
  return { m: r.model, bar: r.id };
}

describe('buildMesh', () => {
  it('barra gera um elemento com comprimento, cossenos e propriedades da seção', () => {
    const { m, bar } = barModel(3, 4);
    const mesh = buildMesh(m);
    expect(mesh.nodes).toHaveLength(2);
    expect(mesh.elems).toHaveLength(1);
    const e = mesh.elems[0];
    expect(e.L).toBeCloseTo(5, 12);
    expect(e.c).toBeCloseTo(0.6, 12);
    expect(e.s).toBeCloseTo(0.8, 12);
    expect(e.EA).toBeCloseTo(25e6 * 0.08, 6);
    expect(e.memberId).toBe(bar);
    expect(mesh.memberElems.get(bar)).toEqual([0]);
  });

  it('barra a 30° com carga vertical por projeção é convertida para eixos locais', () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const { m, bar } = barModel(4 * c, 4 * s);
    const lm = updateMember(m, bar, { loads: [{ dir: 'globalY', ref: 'projection', qi: -10, qj: -10 }] });
    const e = buildMesh(lm).elems[0];
    expect(e.load.wy1).toBeCloseTo(-10 * c * c, 12);
    expect(e.load.px1).toBeCloseTo(-10 * c * s, 12);
    expect(e.load.wy2).toBeCloseTo(-10 * c * c, 12);
  });

  it('cargas em direção local e global X por comprimento', () => {
    const { m, bar } = barModel(0, 4); // barra vertical, eixo local x para cima
    const lm = updateMember(m, bar, {
      loads: [
        { dir: 'globalX', ref: 'length', qi: 5, qj: 5 },
        { dir: 'localY', ref: 'length', qi: 1, qj: 2 },
      ],
    });
    const e = buildMesh(lm).elems[0];
    // globalX = 5 em barra vertical: px = 0, wy = -5 ; somado ao localY 1→2
    expect(e.load.px1).toBeCloseTo(0, 12);
    expect(e.load.wy1).toBeCloseTo(-5 + 1, 12);
    expect(e.load.wy2).toBeCloseTo(-5 + 2, 12);
  });

  it('arco de 40 segmentos gera 41 nós e só os extremos pertencem ao modelo', () => {
    const r = addArc(emptyModel(), { expr: 'x*(20-x)/20', xi: 0, xj: 20, nSeg: 40, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    const m = updateMember(r.model, r.id, { hingeI: true, hingeJ: true });
    const mesh = buildMesh(m);
    expect(mesh.nodes).toHaveLength(41);
    expect(mesh.elems).toHaveLength(40);
    expect(mesh.nodes.filter((n) => n.modelNodeId !== undefined)).toHaveLength(2);
    const ids = mesh.memberElems.get(r.id)!;
    expect(ids).toHaveLength(40);
    const first = mesh.elems[ids[0]];
    const last = mesh.elems[ids[39]];
    expect(first.relA).toBe(true);
    expect(first.relB).toBe(false);
    expect(last.relB).toBe(true);
    expect(mesh.elems[ids[20]].relA).toBe(false);
    // elementos consecutivos partilham nós
    for (let k = 1; k < 40; k++) expect(mesh.elems[ids[k]].a).toBe(mesh.elems[ids[k - 1]].b);
  });

  it('carga linear em x no arco é interpolada nos nós da malha', () => {
    const r = addArc(emptyModel(), { expr: '0*x', xi: 0, xj: 10, nSeg: 10, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    const m = updateMember(r.model, r.id, { loads: [{ dir: 'globalY', ref: 'projection', qi: 0, qj: -10 }] });
    const mesh = buildMesh(m);
    const e3 = mesh.elems[mesh.memberElems.get(r.id)![3]];
    expect(e3.load.wy1).toBeCloseTo(-3, 9);
    expect(e3.load.wy2).toBeCloseTo(-4, 9);
  });

  it('barras que partilham um nó do modelo partilham o nó da malha', () => {
    const a = addNode(emptyModel(), 0, 0);
    const b = addNode(a.model, 4, 0);
    const c = addNode(b.model, 4, 3);
    const ab = addBar(c.model, a.id, b.id);
    const bc = addBar(ab.model, b.id, c.id);
    const mesh = buildMesh(bc.model);
    expect(mesh.elems[0].b).toBe(mesh.elems[1].a);
    expect(mesh.nodeIndex.get(b.id)).toBe(mesh.elems[0].b);
  });

  it('nós isolados ficam fora da malha', () => {
    const { m } = barModel(4, 0);
    const extra = addNode(m, 9, 9);
    const mesh = buildMesh(extra.model);
    expect(mesh.nodes).toHaveLength(2);
    expect(mesh.nodeIndex.has(extra.id)).toBe(false);
  });
});
