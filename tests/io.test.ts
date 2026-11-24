import { describe, it, expect } from 'vitest';
import { serialize, parseModel } from '../src/model/io';
import { parabola, circular, catenary } from '../src/model/presets';
import { examples } from '../src/model/examples';
import { compileExpr } from '../src/expr/parser';
import { analyze } from '../src/solver/analyze';
import { memberStations } from '../src/solver/diagrams';
import { ok, expectEquilibrium } from './helpers';

describe('arquivo JSON', () => {
  it('ida e volta preserva o modelo', () => {
    for (const ex of examples) {
      const m = ex.build();
      const back = parseModel(serialize(m));
      expect(back.ok).toBe(true);
      if (back.ok) expect(back.model).toEqual(m);
    }
  });
  it('rejeita texto que não é JSON, versão desconhecida e nó inexistente', () => {
    expect(parseModel('isto não é json').ok).toBe(false);
    const m = examples[0].build();
    expect(parseModel(JSON.stringify({ ...m, version: 3 })).ok).toBe(false);
    const broken = { ...m, members: m.members.map((k, i) => (i === 0 ? { ...k, nj: 'n999' } : k)) };
    const r = parseModel(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });
  it('rejeita campos com tipo errado', () => {
    const m = examples[0].build();
    const bad = { ...m, nodes: m.nodes.map((n, i) => (i === 0 ? { ...n, x: 'abc' } : n)) };
    expect(parseModel(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('equações prontas', () => {
  const cases = { parabola, circular, catenary };
  for (const [name, f] of Object.entries(cases)) {
    it(`${name}(2, 1, 10, 3) passa por (2,1), (12,1) e (7,4)`, () => {
      const c = compileExpr(f(2, 1, 10, 3));
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      expect(Math.abs(c.fn(2) - 1)).toBeLessThan(1e-9);
      expect(Math.abs(c.fn(12) - 1)).toBeLessThan(1e-9);
      expect(Math.abs(c.fn(7) - 4)).toBeLessThan(1e-9);
    });
  }
  it('aceitam origem negativa', () => {
    const c = compileExpr(parabola(-10, -2, 20, 5));
    expect(c.ok).toBe(true);
    if (c.ok) expect(Math.abs(c.fn(0) - 3)).toBeLessThan(1e-9);
  });
  it('circular com altura do arco maior que meio vão lança erro', () => {
    expect(() => circular(0, 0, 10, 6)).toThrow(/altura do arco/i);
  });
});

describe('exemplos', () => {
  for (const ex of examples) {
    it(`${ex.slug} é analisado e está em equilíbrio`, () => {
      const m = ex.build();
      const r = ok(analyze(m));
      expectEquilibrium(m, r);
    });
  }
  it('lista os sete exemplos previstos', () => {
    expect(examples.map((e) => e.slug)).toEqual([
      'viga-biapoiada',
      'portico-plano',
      'arco-parabolico-biarticulado',
      'arco-triarticulado',
      'arco-atirantado',
      'arco-triarticulado-faixa',
      'portico-duas-aguas-tirantes',
    ]);
  });
  it('arco atirantado: esforço no tirante ≈ qL²/(8f) (±2%)', () => {
    const m = examples.find((e) => e.slug === 'arco-atirantado')!.build();
    const r = ok(analyze(m));
    const tie = m.members.find((k) => k.kind === 'bar')!;
    const st = memberStations(m, r, tie.id);
    expect(Math.abs(st[0].N / ((10 * 20 * 20) / (8 * 4)) - 1)).toBeLessThan(0.02);
  });
});
