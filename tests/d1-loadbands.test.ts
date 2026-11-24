import { describe, it, expect } from 'vitest';
import { examples } from '../src/model/examples';
import { addArc, addBar, addNode, updateMember } from '../src/model/ops';
import type { Model } from '../src/model/types';
import { computeLoadBands } from '../src/ui/loadBands';
import { memberPolyline, toScreen, type Pt } from '../src/ui/geometry';
import { refModel } from './helpers';

const V = { scale: 50, ox: 100, oy: 600 };

function maps(m: Model) {
  const world = new Map(m.members.map((k) => [k.id, memberPolyline(m, k)]));
  const screen = new Map([...world].map(([id, pts]) => [id, pts.map((p) => toScreen(V, p.x, p.y))]));
  return { world, screen };
}

const ex = (slug: string) => examples.find((e) => e.slug === slug)!.build();
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('D1 — cargas em faixa reta', () => {
  it('arco da imagem 1: uma faixa reta horizontal acima do fecho, de A a B, setas iguais e de mesmo espaçamento', () => {
    const m = ex('arco-triarticulado-faixa');
    const { world, screen } = maps(m);
    const { bands, onAxis } = computeLoadBands(m, screen, world);
    expect(onAxis).toHaveLength(0);
    expect(bands).toHaveLength(1);
    const b = bands[0];
    expect(b.orientation).toBe('vertical');
    expect(b.memberIds.sort()).toEqual(m.members.map((k) => k.id).sort());
    const A = toScreen(V, 0, 0);
    const B = toScreen(V, 6, 0);
    const crown = toScreen(V, 3, 1.5);
    const xs = b.arrows.map((a) => a.head.x);
    near(Math.min(...xs), A.x);
    near(Math.max(...xs), B.x);
    // pontas numa reta acima do fecho; setas verticais, iguais e igualmente espaçadas
    const heads = new Set(b.arrows.map((a) => a.head.y.toFixed(6)));
    expect(heads.size).toBe(1);
    expect(b.arrows[0].head.y).toBeLessThan(crown.y);
    for (const a of b.arrows) {
      near(a.tail.x, a.head.x);
      expect(a.tail.y).toBeLessThan(a.head.y);
    }
    const lens = b.arrows.map((a) => a.head.y - a.tail.y);
    near(Math.min(...lens), Math.max(...lens));
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    near(Math.min(...gaps), Math.max(...gaps), 1e-6);
    expect(b.label.text).toBe('10,00 kN/m (proj.)');
  });

  it('carga por comprimento no arco vira intensidade por projeção (setas maiores perto das nascenças)', () => {
    const r = addArc(refModel(), { expr: 'x*(6-x)/6', xi: 0, xj: 6, nSeg: 20, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    const m = updateMember(r.model, r.id, { loads: [{ dir: 'globalY', ref: 'length', qi: -10, qj: -10 }] });
    const { world, screen } = maps(m);
    const [b] = computeLoadBands(m, screen, world).bands;
    const lens = b.arrows.map((a) => a.head.y - a.tail.y);
    const mid = lens[Math.floor(lens.length / 2)];
    // tan α = 1 na nascença: fator √2 sobre o fecho
    expect(lens[0] / mid).toBeGreaterThan(1.25);
    near(lens[0], lens[lens.length - 1], 1e-6);
  });

  it('pórtico da imagem 2: faixa horizontal acima da água esquerda e faixa vertical à direita do pilar direito, sem se cobrirem', () => {
    const m = ex('portico-duas-aguas-tirantes');
    const { world, screen } = maps(m);
    const { bands, onAxis } = computeLoadBands(m, screen, world);
    expect(onAxis).toHaveLength(0);
    expect(bands).toHaveLength(2);
    const v = bands.find((b) => b.orientation === 'vertical')!;
    const h = bands.find((b) => b.orientation === 'horizontal')!;
    const ridge = toScreen(V, 4, 7);
    // acima da cumeeira (a faixa cobre x de 0 a 4, onde está o pilar central)
    expect(Math.max(...v.arrows.map((a) => a.head.y))).toBeLessThan(ridge.y);
    // setas da carga lateral apontam para a estrutura (−X) e ficam à direita do pilar (x = 8)
    const pillar = toScreen(V, 8, 0);
    for (const a of h.arrows) {
      expect(a.head.x).toBeGreaterThan(pillar.x);
      expect(a.tail.x).toBeGreaterThan(a.head.x);
      near(a.tail.y, a.head.y);
    }
    const o = (p: { minX: number; maxX: number; minY: number; maxY: number }, q: typeof p) => p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;
    expect(o(v.box, h.box)).toBe(false);
  });

  it('barra vertical com carga vertical (projeção nula) fica sobre o elemento; cargas locais também', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 0, 3);
    const c = addNode(b.model, 4, 3);
    const b1 = addBar(c.model, a.id, b.id);
    const b2 = addBar(b1.model, b.id, c.id);
    m = updateMember(b2.model, b1.id, { loads: [{ dir: 'globalY', ref: 'length', qi: -2, qj: -2 }] });
    m = updateMember(m, b2.id, { loads: [{ dir: 'localY', ref: 'length', qi: -2, qj: -2 }] });
    const { world, screen } = maps(m);
    const r = computeLoadBands(m, screen, world);
    expect(r.bands).toHaveLength(0);
    expect(r.onAxis.map((x) => x.memberId).sort()).toEqual([b1.id, b2.id].sort());
  });

  it('a faixa sobe para não cobrir uma barra que passa por cima do elemento carregado', () => {
    let m = refModel();
    const ids: string[] = [];
    for (const [x, y] of [
      [0, 0],
      [6, 0],
      [0, 0.4],
      [6, 0.4],
    ]) {
      const r = addNode(m, x, y);
      m = r.model;
      ids.push(r.id);
    }
    const low = addBar(m, ids[0], ids[1]);
    const high = addBar(low.model, ids[2], ids[3]);
    m = updateMember(high.model, low.id, { loads: [{ dir: 'globalY', ref: 'length', qi: -5, qj: -5 }] });
    const { world, screen } = maps(m);
    const [band] = computeLoadBands(m, screen, world).bands;
    const top = toScreen(V, 0, 0.4).y;
    expect(Math.max(...band.arrows.map((a) => a.head.y))).toBeLessThan(top);
  });

  it('trechos vizinhos com cargas diferentes não se fundem', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 3, 0);
    const c = addNode(b.model, 6, 0);
    const b1 = addBar(c.model, a.id, b.id);
    const b2 = addBar(b1.model, b.id, c.id);
    m = updateMember(b2.model, b1.id, { loads: [{ dir: 'globalY', ref: 'length', qi: -5, qj: -5 }] });
    m = updateMember(m, b2.id, { loads: [{ dir: 'globalY', ref: 'length', qi: -8, qj: -8 }] });
    const { world, screen } = maps(m);
    const bands = computeLoadBands(m, screen, world).bands;
    expect(bands).toHaveLength(2);
    const pts: Pt[] = bands.flatMap((x) => x.arrows.map((q) => q.head));
    expect(pts.length).toBeGreaterThan(4);
  });
});

describe('D1 — faixas empilhadas', () => {
  it('duas cargas verticais na mesma barra viram duas faixas, uma acima da outra, com o rótulo junto da sua faixa', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 6, 0);
    const bar = addBar(b.model, a.id, b.id);
    m = updateMember(bar.model, bar.id, {
      loads: [
        { dir: 'globalY', ref: 'length', qi: -5, qj: -5 },
        { dir: 'globalY', ref: 'length', qi: -2, qj: -8 },
      ],
    });
    const { world, screen } = maps(m);
    const { bands } = computeLoadBands(m, screen, world);
    expect(bands).toHaveLength(2);
    const [p, q] = bands;
    const ov = (x: typeof p.box, y: typeof p.box) => x.minX < y.maxX && y.minX < x.maxX && x.minY < y.maxY && y.minY < x.maxY;
    expect(ov(p.box, q.box)).toBe(false);
    for (const band of bands) {
      expect(band.label.y).toBeGreaterThanOrEqual(band.box.minY - 1e-9);
      expect(band.label.y).toBeLessThanOrEqual(band.box.maxY + 1e-9);
    }
  });
});
