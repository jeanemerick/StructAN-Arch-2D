import { describe, it, expect } from 'vitest';
import { analyze } from '../src/solver/analyze';
import { memberStations } from '../src/solver/diagrams';
import { addArcBetween, duplicate, moveNode, setSupport, suggestOffset } from '../src/model/ops';
import { examples } from '../src/model/examples';
import { compileArcCurve } from '../src/model/curve';
import { substituteX } from '../src/expr/parser';
import { itemsInWindow, memberPolyline, modelBounds } from '../src/ui/geometry';
import { initialState, reducer, NO_SELECTION, selCount } from '../src/ui/state';
import type { Arc } from '../src/model/types';
import { expectEquilibrium, FIX, ok, refModel } from './helpers';

const all = (m: { nodes: { id: string }[]; members: { id: string }[] }) => ({ nodes: m.nodes.map((n) => n.id), members: m.members.map((k) => k.id) });

describe('C6 — duplicar', () => {
  it('substituteX troca só a variável x (não altera exp, max etc.)', () => {
    expect(substituteX('x*exp(x/2)+X', '(x-3)')).toBe('(x-3)*exp((x-3)/2)+(x-3)');
    const c = compileArcCurve(substituteX('sqrt(25-x^2)', '(x-12)'), 7, 17);
    expect(c.ok && c.fn(12)).toBeCloseTo(5, 12);
  });

  it('viga do exemplo duplicada: cópia ao lado, com apoios e cargas; trocar o apoio da cópia muda só a cópia', () => {
    const m0 = examples.find((e) => e.slug === 'viga-biapoiada')!.build();
    const off = suggestOffset(m0, all(m0), 0.5);
    expect(off.dy).toBe(0);
    const d = duplicate(m0, all(m0), off.dx, off.dy);
    let m = d.model;
    expect(m.nodes).toHaveLength(4);
    expect(m.members).toHaveLength(2);
    expect(d.selection.nodes).toHaveLength(2);
    expect(d.selection.members).toHaveLength(1);
    const copyBar = m.members.find((k) => k.id === d.selection.members[0])!;
    expect(copyBar.loads).toEqual(m0.members[0].loads);
    const copyA = m.nodes.find((n) => n.id === copyBar.ni)!;
    expect(copyA.support).toEqual(m0.nodes[0].support);
    expect(copyA.x).toBeCloseTo(m0.nodes[0].x + off.dx, 12);
    // o solver aceita as duas estruturas separadas
    const r1 = ok(analyze(m));
    expectEquilibrium(m, r1);
    expect(r1.reactions).toHaveLength(4);
    // engasta a primeira ponta da cópia: só a cópia muda
    m = setSupport(m, copyA.id, FIX);
    const r2 = ok(analyze(m));
    expectEquilibrium(m, r2);
    const orig = memberStations(m, r2, m0.members[0].id);
    const copy = memberStations(m, r2, copyBar.id);
    expect(orig[orig.length >> 1].M).toBeCloseTo(memberStations(m0, ok(analyze(m0)), m0.members[0].id)[orig.length >> 1].M, 9);
    expect(Math.abs(copy[0].M)).toBeGreaterThan(1);
  });

  it('folga sugerida evita sobreposição dos diagramas (amplitude de 12% do tamanho do modelo)', () => {
    for (const slug of ['viga-biapoiada', 'portico-plano', 'arco-parabolico-biarticulado', 'portico-duas-aguas-tirantes']) {
      const m0 = examples.find((e) => e.slug === slug)!.build();
      const b0 = modelBounds(m0);
      const off = suggestOffset(m0, all(m0), 0.5);
      const m = duplicate(m0, all(m0), off.dx, off.dy).model;
      const b = modelBounds(m);
      const D = Math.max(b.maxX - b.minX, b.maxY - b.minY);
      const gap = b0.minX + off.dx - b0.maxX;
      expect(gap, slug).toBeGreaterThan(2 * 0.12 * D);
    }
  });

  it('arcos: equação deslocada e parâmetros geradores apontando para as nascenças da cópia', () => {
    const r = addArcBetween(refModel(), { pi: { x: 0, y: 0 }, pj: { x: 6, y: 0 }, shape: 'parabola', rise: 1.5, nSeg: 20, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    const d = duplicate(r.model, all(r.model), 10, 2);
    const copy = d.model.members.find((k) => k.id === d.selection.members[0]) as Arc;
    const a = d.model.nodes.find((n) => n.id === copy.ni)!;
    expect([a.x, a.y]).toEqual([10, 2]);
    expect(copy.gen?.a).toBe(copy.ni);
    expect(copy.gen?.b).toBe(copy.nj);
    const c = compileArcCurve(copy.expr, 10, 16);
    expect(c.ok && c.fn(13)).toBeCloseTo(3.5, 12);
    // mover a nascença da cópia refaz só a cópia
    const mv = moveNode(d.model, copy.nj, { x: 18 });
    if ('error' in mv) throw new Error(mv.error);
    const orig = mv.model.members.find((k) => k.id === r.id) as Arc;
    expect(orig.expr).toBe((r.model.members[0] as Arc).expr);
  });

  it('copia rótulas, tipo de barra, seção e temperatura', () => {
    const m0 = examples.find((e) => e.slug === 'portico-duas-aguas-tirantes')!.build();
    const d = duplicate(m0, all(m0), 20, 0);
    const copies = d.selection.members.map((id) => d.model.members.find((k) => k.id === id)!);
    const kinds = (list: typeof copies) => list.map((k) => [k.behavior, k.sectionId, k.hingeI, k.hingeJ, JSON.stringify(k.loads)].join('|')).sort();
    expect(kinds(copies)).toEqual(kinds(m0.members));
    const r = ok(analyze(d.model));
    expectEquilibrium(d.model, r);
  });

  it('selecionar só barras leva os nós delas; nós soltos selecionados também são copiados', () => {
    const m0 = examples.find((e) => e.slug === 'portico-plano')!.build();
    const d = duplicate(m0, { nodes: [], members: [m0.members[1].id] }, 0, 10);
    expect(d.model.nodes).toHaveLength(m0.nodes.length + 2);
    expect(d.model.members).toHaveLength(m0.members.length + 1);
  });

  it('desfazer remove a cópia num passo só', () => {
    const m0 = examples.find((e) => e.slug === 'viga-biapoiada')!.build();
    let s = initialState(m0);
    s = reducer(s, { type: 'selectAll' });
    const d = duplicate(s.model, s.selection, 10, 0);
    s = reducer(s, { type: 'apply', fn: () => d.model, select: d.selection });
    expect(s.model.members).toHaveLength(2);
    expect(s.selection).toEqual(d.selection);
    s = reducer(s, { type: 'undo' });
    expect(s.model).toBe(m0);
  });
});

describe('C6 — seleção múltipla', () => {
  it('Shift+clique alterna; Ctrl+A seleciona tudo; ferramenta de modelagem volta ao modelo', () => {
    const m0 = examples.find((e) => e.slug === 'portico-plano')!.build();
    let s = initialState(m0);
    s = reducer(s, { type: 'select', selection: { kind: 'node', id: 'n1' } });
    s = reducer(s, { type: 'select', selection: { kind: 'member', id: 'm1' }, how: 'toggle' });
    expect(s.selection).toEqual({ nodes: ['n1'], members: ['m1'] });
    s = reducer(s, { type: 'select', selection: { kind: 'node', id: 'n1' }, how: 'toggle' });
    expect(s.selection).toEqual({ nodes: [], members: ['m1'] });
    s = reducer(s, { type: 'selectAll' });
    expect(selCount(s.selection)).toBe(m0.nodes.length + m0.members.length);
    s = reducer(s, { type: 'setView', view: 'M' });
    s = reducer(s, { type: 'setTool', tool: 'bar' });
    expect(s.view).toBe('model');
    s = reducer(s, { type: 'select', selection: null });
    expect(s.selection).toEqual(NO_SELECTION);
  });

  it('janela da esquerda para a direita pega só o que está inteiro dentro; da direita para a esquerda, o que ela toca', () => {
    const m = examples.find((e) => e.slug === 'portico-plano')!.build();
    const polylines = new Map(m.members.map((k) => [k.id, memberPolyline(m, k)]));
    // janela em volta do pilar esquerdo (x de −1 a 1, y de −1 a 5)
    const rect = { minX: -1, minY: -1, maxX: 1, maxY: 5 };
    const inside = itemsInWindow(m, rect, 'inside', polylines);
    expect(inside.members).toEqual(['m1']);
    expect(inside.nodes.sort()).toEqual(['n1', 'n2']);
    const crossing = itemsInWindow(m, rect, 'crossing', polylines);
    expect(crossing.members.sort()).toEqual(['m1', 'm2']);
  });
});
