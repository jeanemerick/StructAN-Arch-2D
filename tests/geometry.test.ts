import { describe, it, expect } from 'vitest';
import { hitTest, memberPolyline, modelBounds, toScreen, toWorld, fitView, zoomAt } from '../src/ui/geometry';
import { addArc, addBar, addNode, emptyModel } from '../src/model/ops';

function frame() {
  const a = addNode(emptyModel(), 0, 0);
  const b = addNode(a.model, 4, 0);
  const bar = addBar(b.model, a.id, b.id);
  const arc = addArc(bar.model, { expr: 'x*(20-x)/20', xi: 10, xj: 20, nSeg: 20, sectionId: 's1' });
  if ('error' in arc) throw new Error(arc.error);
  return { m: arc.model, a: a.id, b: b.id, bar: bar.id, arc: arc.id };
}

describe('transformação de tela', () => {
  it('toWorld desfaz toScreen e o eixo Y fica para cima', () => {
    const v = { scale: 50, ox: 100, oy: 400 };
    const p = toScreen(v, 2, 3);
    expect(p).toEqual({ x: 200, y: 250 });
    expect(toWorld(v, p.x, p.y)).toEqual({ x: 2, y: 3 });
  });
  it('zoomAt mantém fixo o ponto sob o cursor', () => {
    const v = { scale: 50, ox: 100, oy: 400 };
    const z = zoomAt(v, 300, 200, 2);
    expect(z.scale).toBe(100);
    const w0 = toWorld(v, 300, 200);
    const w1 = toWorld(z, 300, 200);
    expect(w1.x).toBeCloseTo(w0.x, 12);
    expect(w1.y).toBeCloseTo(w0.y, 12);
  });
  it('fitView enquadra o modelo na área visível', () => {
    const { m } = frame();
    const b = modelBounds(m);
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 5 });
    const v = fitView(b, 800, 600);
    const p0 = toScreen(v, 0, 0);
    const p1 = toScreen(v, 20, 5);
    expect(p0.x).toBeGreaterThan(0);
    expect(p1.x).toBeLessThan(800);
    expect(p1.y).toBeGreaterThan(0);
    expect(p0.y).toBeLessThan(600);
  });
});

describe('memberPolyline', () => {
  it('barra tem 2 pontos e arco 201 pontos sobre a curva', () => {
    const { m, bar, arc } = frame();
    expect(memberPolyline(m, m.members.find((k) => k.id === bar)!)).toHaveLength(2);
    const pts = memberPolyline(m, m.members.find((k) => k.id === arc)!);
    expect(pts).toHaveLength(201);
    for (const p of pts) expect(p.y).toBeCloseTo((p.x * (20 - p.x)) / 20, 9);
  });
});

describe('hitTest', () => {
  it('prioriza nós, depois barras e arcos, dentro da tolerância', () => {
    const { m, a, bar, arc } = frame();
    expect(hitTest(m, 0.05, 0.02, 0.2)).toEqual({ kind: 'node', id: a });
    expect(hitTest(m, 2, 0.1, 0.2)).toMatchObject({ kind: 'member', id: bar });
    const h = hitTest(m, 15, 3.75 + 0.05, 0.2);
    expect(h).toMatchObject({ kind: 'member', id: arc });
    expect(hitTest(m, 7, 3, 0.2)).toBeNull();
  });
  it('informa a posição ao longo da barra (fração) e no arco (x)', () => {
    const { m, bar, arc } = frame();
    const h1 = hitTest(m, 1, 0.05, 0.2);
    expect(h1).toMatchObject({ kind: 'member', id: bar });
    if (h1?.kind === 'member') expect(h1.at).toBeCloseTo(0.25, 6);
    const h2 = hitTest(m, 15, 3.75, 0.2);
    expect(h2).toMatchObject({ kind: 'member', id: arc });
    if (h2?.kind === 'member') expect(h2.at).toBeCloseTo(15, 1);
  });
});
