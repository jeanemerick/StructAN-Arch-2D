/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import presetsSrc from '../src/model/presets.ts?raw';
import arcFormSrc from '../src/ui/panels/ArcForm.tsx?raw';
import appSrc from '../src/ui/App.tsx?raw';
import memberPanelSrc from '../src/ui/panels/MemberPanel.tsx?raw';
import { analyze } from '../src/solver/analyze';
import { addArcBetween, addBar, addNode, moveNode, placeNode, setSupport, splitMember, updateMember } from '../src/model/ops';
import { arcBetween, catenary, circular, parabola } from '../src/model/presets';
import { compileArcCurve } from '../src/model/curve';
import { parseModel, serialize } from '../src/model/io';
import { resolveClickNode, snapPoint, snapToGrid } from '../src/ui/picking';
import type { Arc, Model } from '../src/model/types';
import { expectEquilibrium, ok, PIN, reaction, refModel } from './helpers';

const fnOf = (expr: string, xi: number, xj: number) => {
  const c = compileArcCurve(expr, xi, xj);
  if (!c.ok) throw new Error(c.error);
  return c.fn;
};

describe('C1 — coordenadas livres', () => {
  it('passo de grade qualquer: 0,01 leva (0,0137; 0,3712) a (0,01; 0,37) sem ruído de ponto flutuante', () => {
    const m = refModel();
    const p = snapPoint(m, { x: 0.0137, y: 0.3712 }, { tol: 0.001, snap: true, grid: 0.01 });
    expect(p).toEqual({ x: 0.01, y: 0.37 });
    expect(snapToGrid(2.3449, 0.005)).toBe(2.345);
    expect(snapToGrid(7.4, 2.5)).toBe(7.5);
  });

  it('snap desligado arredonda o clique ao milímetro', () => {
    const p = snapPoint(refModel(), { x: 7.560027533, y: -1.23449 }, { tol: 0.001, snap: false, grid: 0.5 });
    expect(p).toEqual({ x: 7.56, y: -1.234 });
  });

  it('cria nós em (0,01; 0,37) e (2,345; 1,2) pelo mouse com passo 0,01 e pelo teclado', () => {
    // mouse: passo 0,01 com snap; o segundo ponto com snap desligado (milímetro)
    let m = refModel();
    const a = resolveClickNode(m, { x: 0.0104, y: 0.3698 }, { tol: 0.002, snap: true, grid: 0.01 })!;
    m = a.model;
    const b = resolveClickNode(m, { x: 2.34504, y: 1.19996 }, { tol: 0.002, snap: false, grid: 0.01 })!;
    m = b.model;
    expect(m.nodes.map((n) => [n.x, n.y])).toEqual([
      [0.01, 0.37],
      [2.345, 1.2],
    ]);
    // teclado: coordenadas ficam como foram digitadas
    let k = refModel();
    k = placeNode(k, 0.01, 0.37).model;
    k = placeNode(k, 2.345, 1.2).model;
    expect(k.nodes.map((n) => [n.x, n.y])).toEqual([
      [0.01, 0.37],
      [2.345, 1.2],
    ]);
  });
});

describe('C4 — arco entre dois nós', () => {
  it('equações prontas de mesmo nível passam pelas nascenças e têm altura f no meio do vão', () => {
    for (const gen of [parabola, circular, catenary]) {
      const fn = fnOf(gen(1, 2, 6, 1.5), 1, 7);
      expect(fn(1)).toBeCloseTo(2, 9);
      expect(fn(7)).toBeCloseTo(2, 9);
      expect(fn(4)).toBeCloseTo(3.5, 7);
    }
  });

  it('parábola com nascenças em níveis diferentes: altura medida da corda, no meio do vão', () => {
    const r = arcBetween('parabola', { x: 0, y: 0 }, { x: 8, y: 2 }, 2);
    expect(r.xi).toBe(0);
    expect(r.xj).toBe(8);
    const fn = fnOf(r.expr, 0, 8);
    expect(fn(0)).toBeCloseTo(0, 12);
    expect(fn(8)).toBeCloseTo(2, 12);
    expect(fn(4)).toBeCloseTo(1 + 2, 12);
  });

  it('circular e catenária com níveis diferentes também passam pelos três pontos', () => {
    for (const shape of ['circular', 'catenary'] as const) {
      const r = arcBetween(shape, { x: 0, y: 0 }, { x: 8, y: 1 }, 1.5);
      const fn = fnOf(r.expr, 0, 8);
      expect(fn(0), shape).toBeCloseTo(0, 6);
      expect(fn(8), shape).toBeCloseTo(1, 6);
      expect(fn(4), shape).toBeCloseTo(0.5 + 1.5, 6);
    }
  });

  it('nós escolhidos da direita para a esquerda são invertidos', () => {
    const r = arcBetween('parabola', { x: 6, y: 0 }, { x: 0, y: 0 }, 1.5);
    expect([r.xi, r.xj]).toEqual([0, 6]);
  });

  it('casos inviáveis dão mensagem clara com "altura do arco"', () => {
    expect(() => arcBetween('circular', { x: 0, y: 0 }, { x: 6, y: 0 }, 4)).toThrow(/altura do arco/);
    expect(() => arcBetween('parabola', { x: 0, y: 0 }, { x: 0, y: 3 }, 1)).toThrow(/abscissas/);
    expect(() => arcBetween('parabola', { x: 0, y: 0 }, { x: 6, y: 0 }, 0)).toThrow(/altura do arco/);
    expect(() => arcBetween('circular', { x: 0, y: 0 }, { x: 6, y: 5 }, 3)).toThrow(/circular/);
  });

  it('arco da imagem 1 em poucos passos: nós (0; 0) e (6; 0), altura 1,5, parábola, preso aos nós existentes', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 6, 0);
    m = b.model;
    const r = addArcBetween(m, { pi: { x: 0, y: 0 }, pj: { x: 6, y: 0 }, shape: 'parabola', rise: 1.5, nSeg: 40, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    m = r.model;
    expect(m.nodes).toHaveLength(2);
    const arc = m.members[0] as Arc;
    expect([arc.ni, arc.nj]).toEqual([a.id, b.id]);
    expect(arc.gen).toEqual({ shape: 'parabola', rise: 1.5, a: a.id, b: b.id });
    expect(fnOf(arc.expr, 0, 6)(3)).toBeCloseTo(1.5, 12);
    // triarticulado com q = 10 kN/m por projeção: H = qL²/8f = 30
    const s = splitMember(m, arc.id, 3);
    m = s.model;
    const q = { dir: 'globalY' as const, ref: 'projection' as const, qi: -10, qj: -10 };
    m = updateMember(m, m.members[0].id, { hingeJ: true, loads: [q] });
    m = updateMember(m, m.members[1].id, { loads: [q] });
    m = setSupport(setSupport(m, a.id, PIN), b.id, PIN);
    const res = ok(analyze(m));
    expectEquilibrium(m, res);
    expect(reaction(res, a.id).fx).toBeCloseTo(30, 1);
  });

  it('nós na ordem inversa: o arco fica da esquerda para a direita', () => {
    const r = addArcBetween(refModel(), { pi: { x: 6, y: 0 }, pj: { x: 0, y: 0 }, shape: 'parabola', rise: 1.5, nSeg: 20, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    const arc = r.model.members[0] as Arc;
    const ni = r.model.nodes.find((n) => n.id === arc.ni)!;
    expect(ni.x).toBe(0);
  });

  it('mover um nó de extremidade refaz o arco (também com o arco dividido)', () => {
    const r = addArcBetween(refModel(), { pi: { x: 0, y: 0 }, pj: { x: 6, y: 0 }, shape: 'parabola', rise: 1.5, nSeg: 20, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    let m = r.model;
    const arc = m.members[0] as Arc;
    const s = splitMember(m, arc.id, 2);
    m = s.model;
    const mv = moveNode(m, arc.nj, { x: 8, y: 1 });
    if ('error' in mv) throw new Error(mv.error);
    m = mv.model;
    const arcs = m.members as Arc[];
    expect(arcs).toHaveLength(2);
    const fn = fnOf(arcs[1].expr, 2, 8);
    expect(fn(8)).toBeCloseTo(1, 9);
    expect(fn(4)).toBeCloseTo(0.5 + 1.5, 9);
    expect(arcs[0].expr).toBe(arcs[1].expr);
    // o nó interno continua sobre a curva nova
    const mid = m.nodes.find((n) => n.id === s.nodeId)!;
    expect(mid.y).toBeCloseTo(fn(2), 12);
    m = setSupport(setSupport(m, arc.ni, PIN), arc.nj, PIN);
    expect(analyze(m).ok).toBe(true);
  });

  it('extremidade de arco por equação livre continua sem se mover; nó interno também', () => {
    const r = addArcBetween(refModel(), { pi: { x: 0, y: 0 }, pj: { x: 6, y: 0 }, shape: 'parabola', rise: 1.5, nSeg: 20, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    const s = splitMember(r.model, r.model.members[0].id, 3);
    expect('error' in moveNode(s.model, s.nodeId, { x: 3.5 })).toBe(true);
    const free: Model = { ...r.model, members: r.model.members.map((k) => ({ ...k, gen: undefined }) as Arc) };
    expect('error' in moveNode(free, free.members[0].nj, { x: 7 })).toBe(true);
  });

  it('parâmetros geradores do arco sobrevivem a salvar e abrir', () => {
    const r = addArcBetween(refModel(), { pi: { x: 0, y: 0 }, pj: { x: 6, y: 0 }, shape: 'catenary', rise: 2, nSeg: 20, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    const back = parseModel(serialize(r.model));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.model).toEqual(r.model);
  });

  it('extremidade do arco sobre uma barra existente divide a barra', () => {
    let m = refModel();
    const a = addNode(m, -2, 0);
    const b = addNode(a.model, 8, 0);
    m = addBar(b.model, a.id, b.id).model;
    const r = addArcBetween(m, { pi: { x: 0, y: 0 }, pj: { x: 6, y: 0 }, shape: 'parabola', rise: 1.5, nSeg: 20, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    expect(r.model.members.filter((k) => k.kind === 'bar')).toHaveLength(3);
  });
});

describe('C5 — "altura do arco" no lugar de "flecha"', () => {
  it('mensagens das equações prontas falam em altura do arco', () => {
    expect(() => circular(0, 0, 10, 6)).toThrow(/altura do arco/);
    expect(() => parabola(0, 0, 10, 2)).not.toThrow();
  });
  it('textos do arco na interface e no modelo não falam em "flecha"', () => {
    const files: Record<string, string> = { presetsSrc, arcFormSrc, appSrc, memberPanelSrc };
    for (const [name, src] of Object.entries(files)) expect(src, name).not.toMatch(/flecha/i);
  });
});
