import { describe, it, expect } from 'vitest';
import { analyze } from '../src/solver/analyze';
import { memberStations, type Station } from '../src/solver/diagrams';
import { addBar, addNode, setNodalLoad, setSupport } from '../src/model/ops';
import type { Id, Model } from '../src/model/types';
import { buildChains } from '../src/ui/diagramShapes';
import { endLabels } from '../src/ui/diagramLabels';
import { boxesOverlap, placeLabels } from '../src/ui/labels';
import { toScreen, type Pt } from '../src/ui/geometry';
import { examples } from '../src/model/examples';
import { ok, PIN, refModel, ROLLER } from './helpers';

const V = { scale: 60, ox: 80, oy: 500 };
const scr = (p: Pt) => toScreen(V, p.x, p.y);

function stations(m: Model) {
  const r = ok(analyze(m));
  return new Map<Id, Station[]>(m.members.map((k) => [k.id, memberStations(m, r, k.id, 20)]));
}

/** Duas barras alinhadas (0–3–6) com carga axial no nó do meio: N salta de −13 para −18 (como na imagem 3). */
function axialJump(): { m: Model; mid: string } {
  let m = refModel();
  const a = addNode(m, 0, 0);
  const b = addNode(a.model, 3, 0);
  const c = addNode(b.model, 6, 0);
  m = addBar(c.model, a.id, b.id).model;
  m = addBar(m, b.id, c.id).model;
  m = setSupport(setSupport(m, a.id, { rx: true, ry: true, rz: false }), c.id, ROLLER);
  m = setNodalLoad(m, c.id, { fx: -13, fy: 0, mz: 0 });
  m = setNodalLoad(m, b.id, { fx: -5, fy: 0, mz: 0 });
  return { m, mid: b.id };
}

describe('D5 — valores nas descontinuidades', () => {
  it('salto de N no nó (−18 e −13): um rótulo de cada lado, afastado do nó ao longo da sua barra, com traço de chamada', () => {
    const { m, mid } = axialJump();
    const st = stations(m);
    const chains = buildChains(m, st, 'N');
    expect(chains).toHaveLength(2);
    const maxAbs = 18;
    const labels = endLabels(chains, 0.05, scr, maxAbs);
    const node = m.nodes.find((n) => n.id === mid)!;
    const nodeX = scr(node).x;
    const atNode = labels.filter((l) => Math.abs(l.at.x - nodeX) < 1e-6);
    expect(atNode.map((l) => l.text).sort()).toEqual(['-13,00', '-18,00']);
    for (const l of atNode) {
      expect(l.leader).toBe(true);
      const side = l.memberId === m.members[0].id ? -1 : 1;
      // o texto fica do lado da barra a que pertence, a pelo menos 20 px do nó
      expect(side * (l.candidates[0].x - nodeX)).toBeGreaterThan(20);
    }
    const placed = placeLabels(labels.map((l) => ({ key: l.key, text: l.text, candidates: l.candidates, priority: 80 })));
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(boxesOverlap(placed[i].box, placed[j].box)).toBe(false);
  });

  it('mesmo valor dos dois lados (canto de pórtico em M) vira um rótulo só', () => {
    const m = examples.find((e) => e.slug === 'portico-plano')!.build();
    const st = stations(m);
    const chains = buildChains(m, st, 'M');
    const labels = endLabels(chains, 0.01, scr, 100);
    const corner = m.nodes.find((n) => n.x === 0 && n.y === 4)!;
    const c = scr(corner);
    const here = labels.filter((l) => Math.hypot(l.at.x - c.x, l.at.y - c.y) < 40);
    expect(here).toHaveLength(1);
    expect(here[0].leader).toBe(false);
  });

  it('valores nulos não ganham rótulo', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 4, 0);
    m = addBar(b.model, a.id, b.id).model;
    m = setSupport(setSupport(m, a.id, PIN), b.id, ROLLER);
    m = { ...m, members: m.members.map((k) => ({ ...k, loads: [{ dir: 'globalY' as const, ref: 'length' as const, qi: -10, qj: -10 }] })) };
    const chains = buildChains(m, stations(m), 'M');
    expect(endLabels(chains, 0.01, scr, 20)).toHaveLength(0);
  });
});

describe('rótulos sem colisão', () => {
  it('dois rótulos no mesmo ponto: o segundo vai para outra posição candidata', () => {
    const c = { x: 100, y: 100 };
    const placed = placeLabels([
      { key: 'a', text: '150,0', candidates: [c, { x: 100, y: 130 }], priority: 90 },
      { key: 'b', text: '75,00', candidates: [c, { x: 100, y: 130 }], priority: 80 },
    ]);
    expect(placed).toHaveLength(2);
    expect(boxesOverlap(placed[0].box, placed[1].box)).toBe(false);
  });

  it('rótulo de baixa prioridade sem lugar livre é descartado', () => {
    const c = { x: 100, y: 100 };
    const placed = placeLabels(
      [
        { key: 'a', text: '150,0', candidates: [c], priority: 90 },
        { key: 'b', text: '75,00', candidates: [c], priority: 10 },
      ],
      [],
      50,
    );
    expect(placed.map((p) => p.key)).toEqual(['a']);
  });
});
