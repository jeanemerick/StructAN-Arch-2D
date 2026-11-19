import { describe, it, expect } from 'vitest';
import { analyze, type AnalysisOk } from '../src/solver/analyze';
import { memberStations, type Station } from '../src/solver/diagrams';
import { addArc, splitMember, updateMember, updateSection, setSupport, setNodalLoad } from '../src/model/ops';
import type { DistLoad, Model, Shape } from '../src/model/types';
import { refModel, ok, reaction, expectEquilibrium, PIN } from './helpers';

const relErr = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

interface ArcCase {
  m: Model;
  left: string;
  right: string;
  arcs: string[];
  crown?: string;
}

/** Arco biarticulado (apoios de 2º gênero nas extremidades), opcionalmente dividido em xSplit. */
function arch(opts: {
  expr: string;
  xi: number;
  xj: number;
  nSeg?: number;
  shape?: Shape;
  load?: DistLoad;
  xSplit?: number;
  crownHinge?: boolean;
}): ArcCase {
  let m = refModel();
  if (opts.shape) m = updateSection(m, 's1', { shape: opts.shape });
  const r = addArc(m, { expr: opts.expr, xi: opts.xi, xj: opts.xj, nSeg: opts.nSeg ?? 40, sectionId: 's1' });
  if ('error' in r) throw new Error(r.error);
  m = r.model;
  const arc = m.members[0];
  const left = arc.ni;
  const right = arc.nj;
  if (opts.load) m = updateMember(m, r.id, { loads: [opts.load] });
  let arcs = [r.id];
  let crown: string | undefined;
  if (opts.xSplit !== undefined) {
    const s = splitMember(m, r.id, opts.xSplit);
    m = s.model;
    crown = s.nodeId;
    arcs = m.members.map((k) => k.id);
    // número de segmentos de cada metade = nSeg
    if (opts.crownHinge) m = updateMember(m, arcs[0], { hingeJ: true });
  }
  m = setSupport(m, left, PIN);
  m = setSupport(m, right, PIN);
  return { m, left, right, arcs, crown };
}

function stationsOf(c: ArcCase, r: AnalysisOk): Station[] {
  return c.arcs.flatMap((id) => memberStations(c.m, r, id));
}

const projQ = (q: number): DistLoad => ({ dir: 'globalY', ref: 'projection', qi: q, qj: q });

describe('arcos — casos analíticos', () => {
  it('parabólico triarticulado, q=10 por projeção: H=V=100; N no fecho −100 e na nascença −141,42; M ≈ 0', () => {
    const c = arch({ expr: 'x*(20-x)/20', xi: 0, xj: 20, load: projQ(-10), xSplit: 10, crownHinge: true });
    const r = ok(analyze(c.m));
    expectEquilibrium(c.m, r);
    const R = reaction(r, c.left);
    expect(relErr(R.fx, 100)).toBeLessThan(0.001);
    expect(relErr(R.fy, 100)).toBeLessThan(0.001);
    expect(relErr(-reaction(r, c.right).fx, 100)).toBeLessThan(0.001);
    const st = stationsOf(c, r);
    const crown = st.find((p) => Math.abs(p.x - 10) < 1e-9)!;
    expect(relErr(crown.N, -100)).toBeLessThan(0.005);
    expect(relErr(st[0].N, -Math.hypot(100, 100))).toBeLessThan(0.005);
    for (const p of st) expect(Math.abs(p.M)).toBeLessThanOrEqual(1.0);
  });

  it('parabólico biarticulado, seção 30×60, q=10 por projeção: H = 100 (±0,5%)', () => {
    const c = arch({ expr: 'x*(20-x)/20', xi: 0, xj: 20, load: projQ(-10), shape: { kind: 'rect', b: 0.3, h: 0.6 } });
    const r = ok(analyze(c.m));
    expectEquilibrium(c.m, r);
    expect(relErr(reaction(r, c.left).fx, 100)).toBeLessThan(0.005);
  });

  it('semicircular biarticulado, P=100 no fecho, A=10 m², I=0,001 m⁴: H = P/π (±1%)', () => {
    const c = arch({ expr: 'sqrt(25-x^2)', xi: -5, xj: 5, xSplit: 0, shape: { kind: 'generic', A: 10, I: 0.001 } });
    const m = setNodalLoad(c.m, c.crown!, { fx: 0, fy: -100, mz: 0 });
    const r = ok(analyze(m));
    expectEquilibrium(m, r);
    expect(relErr(reaction(r, c.left).fx, 100 / Math.PI)).toBeLessThan(0.01);
  });

  it('semicircular triarticulado, P=100 no fecho: H = V = 50 e M(x=−3,5355) = −103,55', () => {
    const c = arch({ expr: 'sqrt(25-x^2)', xi: -5, xj: 5, xSplit: 0, crownHinge: true, shape: { kind: 'generic', A: 10, I: 0.001 } });
    const m = setNodalLoad(c.m, c.crown!, { fx: 0, fy: -100, mz: 0 });
    const r = ok(analyze(m));
    expectEquilibrium(m, r);
    const R = reaction(r, c.left);
    expect(relErr(R.fx, 50)).toBeLessThan(0.001);
    expect(relErr(R.fy, 50)).toBeLessThan(0.001);
    const st = stationsOf({ ...c, m }, r);
    const p = st.reduce((b, q) => (Math.abs(q.x + 3.5355) < Math.abs(b.x + 3.5355) ? q : b));
    expect(Math.abs(p.x + 3.5355)).toBeLessThan(1e-3);
    expect(relErr(p.M, -103.55)).toBeLessThan(0.01);
  });

  it('circular R=10, 120°, pressão normal 20 kN/m: N = −200 em todas as estações e M ≈ 0', () => {
    const xs = 10 * Math.sin(Math.PI / 3);
    const c = arch({
      expr: 'sqrt(100-x^2)',
      xi: -xs,
      xj: xs,
      load: { dir: 'localY', ref: 'length', qi: -20, qj: -20 },
      shape: { kind: 'generic', A: 10, I: 0.001 },
    });
    const r = ok(analyze(c.m));
    expectEquilibrium(c.m, r);
    const st = stationsOf(c, r);
    expect(st).toHaveLength(41);
    for (const p of st) {
      expect(relErr(p.N, -200)).toBeLessThan(0.005);
      expect(Math.abs(p.M)).toBeLessThanOrEqual(1.0);
    }
  });

  it('catenária −10·cosh(x/10), peso próprio 5 kN/m por comprimento: H = 50 e M ≈ 0', () => {
    const c = arch({
      expr: '-10*cosh(x/10)',
      xi: -8,
      xj: 8,
      load: { dir: 'globalY', ref: 'length', qi: -5, qj: -5 },
      shape: { kind: 'generic', A: 10, I: 0.001 },
    });
    const r = ok(analyze(c.m));
    expectEquilibrium(c.m, r);
    expect(relErr(reaction(r, c.left).fx, 50)).toBeLessThan(0.01);
    for (const p of stationsOf(c, r)) expect(Math.abs(p.M)).toBeLessThanOrEqual(0.5);
  });

  it('convergência: parabólico biarticulado com carga na metade esquerda, M máx com nSeg 20 e 80 difere < 1%', () => {
    const maxM = (nSeg: number) => {
      const c = arch({ expr: 'x*(20-x)/20', xi: 0, xj: 20, nSeg, xSplit: 10 });
      const m = updateMember(c.m, c.arcs[0], { loads: [projQ(-10)] });
      const r = ok(analyze(m));
      expectEquilibrium(m, r);
      return Math.max(...stationsOf({ ...c, m }, r).map((p) => Math.abs(p.M)));
    };
    const a = maxM(20);
    const b = maxM(80);
    expect(a).toBeGreaterThan(10);
    expect(relErr(a, b)).toBeLessThan(0.01);
  });

  it('tangente das estações segue a curva real (semicírculo: vertical nas nascenças)', () => {
    const c = arch({ expr: 'sqrt(25-x^2)', xi: -5, xj: 5, shape: { kind: 'generic', A: 10, I: 0.001 } });
    const m = setNodalLoad(c.m, c.left, { fx: 0, fy: 0, mz: 0 });
    const r = ok(analyze(m));
    const st = stationsOf({ ...c, m }, r);
    expect(st[0].ty).toBeGreaterThan(0.999);
    expect(st[st.length - 1].ty).toBeLessThan(-0.999);
    const mid = st[20];
    expect(Math.abs(mid.tx - 1)).toBeLessThan(1e-6);
  });
});
